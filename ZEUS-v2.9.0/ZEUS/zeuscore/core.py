"""Le chef d'orchestre : relie le cerveau, les outils, la mémoire, les canaux et le téléphone."""

from __future__ import annotations

import re
import secrets
import threading
import time
from pathlib import Path
from typing import Any, Callable

from . import __version__
from .agent import Agent, Run, RunResult
from .config import Config
from .events import EventBus
from .llm import LLMRouter
from .security import Approvals, Security, risk_label
from .store import Store
from .tools import REGISTRY, load_builtin_tools
from .util import fr_datetime, log, norm, setup_logging, truncate

ReplyFn = Callable[[str, list[str]], None]


def normalize_phone(n: str) -> str:
    d = re.sub(r"[^\d]", "", str(n or ""))
    return d.lstrip("0") if not str(n).strip().startswith("+") else d


def _same_number(peer: str, numbers: list, country_code: str = "") -> bool:
    """Compare des numéros en ignorant le format (+243…, 0…, espaces)."""
    def canon(n: str) -> str:
        d = re.sub(r"[^\d]", "", str(n or ""))
        if d.startswith("00"):
            d = d[2:]
        cc = str(country_code or "").lstrip("+")
        if cc and d.startswith("0"):
            d = cc + d[1:]
        return d[-9:] if len(d) >= 9 else d
    p = canon(peer)
    return bool(p) and any(canon(x) == p for x in numbers)


class Zeus:
    def __init__(self, home: Path | str, router: LLMRouter | None = None, verbose: bool = False,
                 log_name: str = "zeus.log"):
        self.home = Path(home).expanduser().resolve()
        self.config = Config(self.home)
        setup_logging(self.config.dir("logs"), verbose, log_name)
        self.db = Store(self.home / "zeus.db")
        self.bus = EventBus()
        from .sysinfo import SysStats
        self.sysstats = SysStats(self.home)  # processeur, mémoire, disque (interface spatiale)
        self.router = router or LLMRouter(self.config)
        from .costs import CostTracker
        self.costs = CostTracker(self)
        self.router.tracker = self.costs
        load_builtin_tools()
        self.registry = REGISTRY
        self.security = Security(self)
        self.approvals = Approvals(self)
        self.agent = Agent(self)
        from .tools.phone import Phone
        from .dossiers import DossierEngine
        from .scheduler import Scheduler
        from .mcp import MCPManager
        from .watcher import PhoneWatcher
        from .bridge import ToolBridge
        self.phone = Phone(self)
        self.watcher = PhoneWatcher(self)
        self.bridge = ToolBridge(self)
        self.dossiers = DossierEngine(self)
        self.scheduler = Scheduler(self)
        from .kb import Library
        from .calendar_sync import CalendarSync
        self.library = Library(self)
        self.calendars = CalendarSync(self)
        self.mcp = MCPManager(self)
        self.channels: dict[str, Any] = {}
        self._runs: dict[str, Run] = {}
        self._runs_lock = threading.Lock()
        self._session_locks: dict[str, threading.Lock] = {}
        self.started = time.time()
        self.version = __version__
        if not self.config.get("telegram.pairing_code"):
            self.config.set("telegram.pairing_code", f"{secrets.randbelow(900000) + 100000}")
        from .tools.brain import sync_skill_files
        from . import brief
        try:
            sync_skill_files(self)
            brief.ensure_skill(self)
        except Exception as e:  # noqa: BLE001
            log.warning("synchronisation des compétences : %s", e)

    # ================================================================== cycle de vie
    def start(self, channels: bool = True) -> None:
        self.scheduler.start()
        self.watcher.start()
        self.dossiers.ensure_system_jobs()
        if self.library.folders() or self.library.files():
            self.library.ensure_job()
            threading.Thread(target=self.library.index, daemon=True, name="bibliotheque").start()
        if self.calendars.feeds():
            self.calendars.ensure_job()
            threading.Thread(target=self.calendars.sync_all, daemon=True, name="calendriers").start()
        threading.Thread(target=self.mcp.start, daemon=True, name="mcp").start()
        if str(self.config.get("local.preheat") or "secours") == "demarrage":
            threading.Thread(target=self.prewarm_local, daemon=True, name="prechauffage").start()
        if channels:
            self.start_channels()

    def mini_brain_handle(self):
        """Le modèle local qui sert de mini-cerveau de secours (ou None : pas de modèle en ligne, ou pas de local)."""
        order = self.router.order()
        if not order or order[0].is_local or not any(not h.is_local for h in self.router.handles):
            return None
        return next((h for h in order if h.is_local), None)

    def prewarm_local(self, session_id: str | None = None) -> bool:
        """Charge le mini-cerveau local et ses consignes (« local.preheat » : « demarrage » pour le faire au lancement ;
        par défaut, ZEUS le fait seulement pendant qu'il attend Groq ou internet)."""
        from . import minibrain
        h = self.mini_brain_handle()
        if h is None or self.config.get("local.mini", True) is False:
            return False
        sid = session_id or self.owner_session()
        session = self.db.get_session(sid) or {}
        return h.warm(minibrain.system_prompt(self, session))

    def start_channels(self) -> None:
        from .channels.telegram import TelegramChannel
        from .channels.email_channel import EmailChannel
        from .channels.whatsapp import WhatsAppChannel
        from .channels.sms import SmsChannel
        for name, cls in (("telegram", TelegramChannel), ("email", EmailChannel), ("whatsapp", WhatsAppChannel),
                          ("sms", SmsChannel)):
            old = self.channels.pop(name, None)
            if old:
                try:
                    old.stop()
                except Exception:
                    pass
            if self.config.get(f"{name}.enabled"):
                try:
                    ch = cls(self)
                    ch.start()
                    self.channels[name] = ch
                except Exception as e:  # noqa: BLE001
                    log.error("canal %s : %s", name, e)
                    self.bus.publish("notification", level="error", text=f"Canal {name} : {e}")

    def stop(self) -> None:
        self.scheduler.stop()
        self.watcher.stop()
        self.bridge.stop()
        for ch in list(self.channels.values()):
            try:
                ch.stop()
            except Exception:
                pass
        self.mcp.stop()
        b = getattr(self, "_browser", None)
        if b is not None:
            b.stop()
        with self._runs_lock:
            for r in self._runs.values():
                r.cancel.set()

    # ================================================================== tâches en cours
    def register_run(self, sid: str, run: Run) -> None:
        with self._runs_lock:
            self._runs[sid] = run

    def unregister_run(self, sid: str, run: Run) -> None:
        with self._runs_lock:
            if self._runs.get(sid) is run:
                del self._runs[sid]

    def running(self, sid: str) -> Run | None:
        with self._runs_lock:
            return self._runs.get(sid)

    def runs(self) -> list[dict]:
        with self._runs_lock:
            return [r.info() for r in self._runs.values()]

    def stop_run(self, sid: str) -> bool:
        r = self.running(sid)
        if r:
            r.cancel.set()
            return True
        return False

    def _session_lock(self, sid: str) -> threading.Lock:
        with self._runs_lock:
            return self._session_locks.setdefault(sid, threading.Lock())

    # ================================================================== conversations
    def owner_session(self, channel: str = "web", peer: str = "owner", new: bool = False) -> str:
        if not new:
            s = self.db.find_session(channel, peer)
            if s:
                return s["id"]
        return self.db.create_session(channel, peer, "owner")

    def submit(self, session_id: str, text: str, attachments: list[str] | None = None,
               on_done: Callable[[RunResult], None] | None = None, **kw: Any) -> str:
        """Lance une tâche en arrière-plan. Si une tâche tourne déjà, le message y est injecté."""
        r = self.running(session_id)
        if r is not None and r.parent is None and not r.cancel.is_set():
            r.inbox.put({"text": text, "attachments": attachments or []})
            self.bus.publish("inbox", session_id=session_id, text=text)
            return "injected"

        def work() -> None:
            with self._session_lock(session_id):
                try:
                    res = self.agent.run(session_id, text, attachments, **kw)
                except Exception as e:  # noqa: BLE001
                    log.exception("tâche %s", session_id)
                    res = RunResult(f"Erreur : {e}", ok=False)
            if on_done:
                try:
                    on_done(res)
                except Exception:  # noqa: BLE001
                    log.exception("livraison de la réponse")

        threading.Thread(target=work, daemon=True, name=f"run-{session_id}").start()
        return "started"

    def chat(self, session_id: str, text: str, attachments: list[str] | None = None, **kw: Any) -> RunResult:
        """Version synchrone (terminal, tests)."""
        with self._session_lock(session_id):
            return self.agent.run(session_id, text, attachments, **kw)

    # ================================================================== identité
    def is_owner(self, channel: str, peer: str) -> bool:
        o = self.config.get("owner") or {}
        if channel in ("web", "cli", "scheduler"):
            return True
        if channel == "telegram":
            return str(peer) in {str(x) for x in o.get("telegram_ids") or []}
        if channel == "whatsapp":
            return normalize_phone(peer) in {normalize_phone(x) for x in o.get("whatsapp_numbers") or []}
        if channel == "email":
            return str(peer).strip().lower() in {str(x).strip().lower() for x in o.get("emails") or []}
        if channel == "sms":
            nums = list(o.get("phone_numbers") or []) + list(o.get("whatsapp_numbers") or [])
            return _same_number(peer, nums, self.config.get("phone.country_code") or "")
        return False

    def try_pairing(self, channel: str, peer: str, text: str) -> bool:
        code = str(self.config.get("telegram.pairing_code") or "")
        if not code or code not in (text or ""):
            return False
        key = {"telegram": "owner.telegram_ids", "whatsapp": "owner.whatsapp_numbers",
               "email": "owner.emails", "sms": "owner.phone_numbers"}.get(channel)
        if not key:
            return False
        ids = list(self.config.get(key) or [])
        val: Any = int(peer) if channel == "telegram" and str(peer).lstrip("-").isdigit() else peer
        if val not in ids:
            ids.append(val)
            self.config.set(key, ids)
        self.config.set("telegram.pairing_code", f"{secrets.randbelow(900000) + 100000}")
        self.db.audit("owner", "appairage", {"channel": channel, "peer": peer})
        self.bus.publish("notification", level="success", text=f"Nouveau compte propriétaire relié : {channel} {peer}")
        return True

    # ================================================================== messages entrants
    def handle_incoming(self, channel: str, peer: str, text: str, attachments: list[str] | None = None,
                        peer_name: str = "", reply: ReplyFn | None = None) -> str:
        """Point d'entrée commun de Telegram, WhatsApp, e-mail…"""
        attachments = attachments or []
        if not self.is_owner(channel, peer) and self.try_pairing(channel, peer, text):
            if reply:
                reply(f"⚡ C'est fait : ce compte est maintenant relié à {self.config.assistant_name}. "
                      f"Je t'écoute.", [])
            return "paired"
        owner = self.is_owner(channel, peer)
        trust = "owner" if owner else "external"
        if not owner:
            allowed = self.config.get(f"{channel}.allow_external", False) and self.config.get("guichet.enabled", True)
            if not allowed:
                if reply and text.strip().lower().startswith("/start"):
                    reply("Ce bot est privé. Si tu es le propriétaire, envoie le code d'appairage affiché dans "
                          "ZEUS (Réglages → Canaux).", [])
                self.db.audit("external", "message ignoré", {"channel": channel, "peer": peer, "text": text[:200]})
                return "ignored"
        s = self.db.find_session(channel, str(peer))
        if s and s.get("trust") != trust:
            self.db.update_session(s["id"], trust=trust)
            s = self.db.get_session(s["id"])
        if not s:
            sid = self.db.create_session(channel, str(peer), trust, peer_name=peer_name,
                                         title=(peer_name or str(peer)) if trust == "external" else "")
        else:
            sid = s["id"]
        if owner:
            if self._answer_pending(sid, text):
                return "answered"
            if text.strip().lower() in ("/stop", "stop", "arrête", "arrete", "stop zeus"):
                stopped = self.stop_run(sid)
                if reply:
                    reply("⏹️ Arrêté." if stopped else "Rien en cours.", [])
                return "stopped"
            if text.strip().startswith("/"):
                # Rôles par commande, sur tous les canaux (WhatsApp, SMS, e-mail…) : /prof anglais B1, /rh, /interprete…
                from . import modes
                m = modes.from_command(text)
                if m:
                    meta = (self.db.get_session(sid) or {}).get("meta") or {}
                    meta["mode"] = m
                    meta["toolsets"] = sorted(set(meta.get("toolsets") or []) |
                                              (set(modes.toolsets(m)) & set(self.registry.toolsets())))
                    self.db.update_session(sid, meta=meta)
                    if reply:
                        reply(f"{modes.MODES[m['id']]['icon']} Rôle : {modes.describe(m)}.", [])
                    return "answered"
        dossier_note = ""
        if trust == "external":
            dossier_note = self.dossiers.ingest_from_channel(sid, channel, str(peer), peer_name, attachments, text)
            if not text.strip() and attachments:
                text = f"[L'usager a envoyé {len(attachments)} pièce(s) jointe(s).]"
            # les pièces de l'usager sont déjà lues et classées par le moteur de dossiers
            attachments = []

        def done(res: RunResult) -> None:
            if reply:
                reply(res.text, res.files if owner else [])

        status = self.submit(sid, text, attachments, on_done=done, dossier_note=dossier_note)
        return status

    def _answer_pending(self, sid: str, text: str) -> bool:
        """Réponses aux validations/questions : « oui », « non 12 », ou texte libre pour une question."""
        t = norm(text)
        m = re.match(r"^(oui|ok|yes|vas-y|go|autorise|valide|non|no|refuse|annule)\b\s*#?(\d+)?\s*$", t)
        pending = [a for a in self.db.list_approvals("pending", 50)]
        if m:
            yes = m.group(1) in ("oui", "ok", "yes", "vas-y", "go", "autorise", "valide")
            target = None
            if m.group(2):
                target = next((a for a in pending if a["id"] == int(m.group(2))), None)
            else:
                mine = [a for a in pending if a.get("session_id") == sid] or pending
                target = mine[0] if len(mine) == 1 else None
            if target:
                if target["kind"] == "question":
                    return self.approvals.decide(target["id"], "answer", "owner", text.strip())
                return self.approvals.decide(target["id"], "approve" if yes else "deny", "owner")
        q = self.approvals.pending_question(sid)
        if q:
            return self.approvals.decide(q["id"], "answer", "owner", text.strip())
        return False

    # ================================================================== notifications
    def notify_owner(self, text: str, image: str | None = None, files: list[str] | None = None,
                     exclude: str = "") -> list[str]:
        self.bus.publish("notification", level="info", text=text, image=image)
        sent = []
        for name, ch in list(self.channels.items()):
            if name == exclude:
                continue
            try:
                if ch.notify_owner(text, image=image, files=files or []):
                    sent.append(name)
            except Exception as e:  # noqa: BLE001
                log.warning("notification %s : %s", name, e)
        return sent

    def notify_approval(self, approval: dict, ctx: Any = None) -> None:
        kind = approval.get("kind")
        if kind == "question":
            text = f"❓ {approval.get('summary')}"
            opts = approval.get("options") or []
            if opts:
                text += "\nChoix : " + " / ".join(opts)
        else:
            text = (f"⚡ Validation #{approval['id']} — {risk_label(approval.get('risk', ''))}\n"
                    f"{truncate(approval.get('summary') or '', 700)}")
        for ch in list(self.channels.values()):
            try:
                ch.send_approval(approval, text)
            except Exception as e:  # noqa: BLE001
                log.debug("validation non envoyée : %s", e)

    def deliver(self, target: str, text: str, files: list[str] | None = None) -> None:
        """Livre un résultat à « canal:destinataire » (tâches planifiées)."""
        ch_name, _, peer = (target or "owner").partition(":")
        if ch_name in self.channels and peer:
            try:
                self.channels[ch_name].send(peer, text, files or [])
                self.bus.publish("notification", level="info", text=text)
                return
            except Exception as e:  # noqa: BLE001
                log.warning("livraison %s : %s", target, e)
        self.notify_owner(text, files=files)

    # ================================================================== téléphone / voix
    _phone_cache: tuple[float, str] = (0.0, "")

    def phone_summary(self) -> str:
        ts, txt = self._phone_cache
        if time.time() - ts < 30:
            return txt
        try:
            txt = self.phone.summary()
        except Exception as e:  # noqa: BLE001
            txt = f"Téléphone : indisponible ({e})."
        self._phone_cache = (time.time(), txt)
        return txt

    def transcribe(self, path: str) -> str | None:
        from .voice import transcribe
        try:
            return transcribe(self.config, path)
        except Exception as e:  # noqa: BLE001
            log.warning("transcription : %s", e)
            return None

    # ================================================================== état
    def status(self) -> dict:
        return {
            "name": self.config.assistant_name,
            "version": self.version,
            "owner": self.config.owner_name,
            "uptime": round(time.time() - self.started),
            "now": fr_datetime(),
            "models": [h.describe() for h in self.router.handles],
            "routing": self.config.get("routing"),
            "autonomy": self.security.autonomy,
            "phone": self.phone.status(cached=True),
            "channels": {n: c.status() for n, c in self.channels.items()},
            "mcp": self.mcp.status(),
            "watcher": self.watcher.status(),
            "bridge": self.bridge.status(),
            "costs": {k: v for k, v in self.costs.status().items() if k not in ("days",)},
            "stats": self.db.stats(),
            "dossiers": self.db.dossier_counts(),
            "runs": self.runs(),
            "toolsets": self.registry.toolsets(),
            "tools": len(self.registry.tools),
        }


__all__ = ["Zeus", "normalize_phone"]
