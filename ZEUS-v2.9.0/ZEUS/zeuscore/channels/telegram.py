"""Canal Telegram : parle à ZEUS depuis ton téléphone (texte, photos, documents, messages vocaux),
valide ses actions d'un clic. Fonctionne sans adresse publique (long polling)."""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from ..util import guess_mime, is_audio, is_image, log, norm, truncate
from ..voice import multipart
from . import Channel, md_to_html, split_text


class TelegramChannel(Channel):
    name = "telegram"

    def __init__(self, zeus):
        super().__init__(zeus)
        from ..config import Config
        self.token = Config.secret(self.cfg.get("telegram.bot_token"))
        if not self.token:
            raise ValueError("jeton du bot Telegram manquant (Réglages → Canaux)")
        self.api = f"https://api.telegram.org/bot{self.token}/"
        self.file_api = f"https://api.telegram.org/file/bot{self.token}/"
        self.username = ""
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------------ API
    def call(self, method: str, params: dict | None = None, timeout: float = 30) -> Any:
        data = json.dumps(params or {}).encode()
        req = urllib.request.Request(self.api + method, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                j = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                desc = json.loads(body).get("description", body)
            except Exception:
                desc = body
            raise RuntimeError(f"Telegram {method} : {desc}") from None
        if not j.get("ok"):
            raise RuntimeError(f"Telegram {method} : {j.get('description')}")
        return j.get("result")

    def upload(self, method: str, chat_id: str, field: str, path: str, caption: str = "") -> Any:
        p = Path(path)
        fields = {"chat_id": str(chat_id)}
        if caption:
            fields["caption"] = caption[:1000]
        body, ctype = multipart(fields, {field: (p.name, p.read_bytes(), guess_mime(str(p)))})
        req = urllib.request.Request(self.api + method, data=body, headers={"Content-Type": ctype})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read().decode()).get("result")

    def download(self, file_id: str, name_hint: str = "") -> str:
        info = self.call("getFile", {"file_id": file_id})
        fp = info["file_path"]
        d = self.cfg.dir("uploads/telegram")
        name = name_hint or Path(fp).name
        dest = d / f"{int(time.time() * 1000)}_{name}"
        with urllib.request.urlopen(self.file_api + urllib.parse.quote(fp), timeout=120) as r:
            dest.write_bytes(r.read())
        return str(dest)

    # ------------------------------------------------------------------ cycle
    def start(self) -> None:
        me = self.call("getMe", timeout=20)
        self.username = me.get("username", "")
        self.connected = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="telegram")
        self._thread.start()
        log.info("Telegram connecté : @%s", self.username)

    def _loop(self) -> None:
        offset = int(self.zeus.db.kv_get("telegram_offset", 0) or 0)
        backoff = 2
        while not self._stop.is_set():
            try:
                updates = self.call("getUpdates", {"offset": offset, "timeout": 45,
                                                   "allowed_updates": ["message", "callback_query"]}, timeout=60)
                self.connected, self.last_error, backoff = True, "", 2
                for u in updates or []:
                    offset = max(offset, int(u["update_id"]) + 1)
                    self.zeus.db.kv_set("telegram_offset", offset)
                    try:
                        self._handle(u)
                    except Exception:  # noqa: BLE001
                        log.exception("message Telegram")
            except Exception as e:  # noqa: BLE001
                self.connected, self.last_error = False, str(e)
                log.warning("Telegram : %s", e)
                self._stop.wait(backoff)
                backoff = min(backoff * 2, 60)

    def owner_peers(self) -> list[str]:
        return [str(x) for x in self.cfg.get("owner.telegram_ids") or []]

    # ------------------------------------------------------------------ réception
    def _handle(self, u: dict) -> None:
        if "callback_query" in u:
            return self._callback(u["callback_query"])
        m = u.get("message") or {}
        chat = m.get("chat") or {}
        if chat.get("type") not in (None, "private"):
            return
        chat_id = str(chat.get("id"))
        frm = m.get("from") or {}
        name = " ".join(x for x in (frm.get("first_name"), frm.get("last_name")) if x) or frm.get("username") or chat_id
        text = m.get("text") or m.get("caption") or ""
        atts: list[str] = []
        try:
            if m.get("photo"):
                atts.append(self.download(m["photo"][-1]["file_id"], "photo.jpg"))
            if m.get("document"):
                doc = m["document"]
                if int(doc.get("file_size") or 0) <= 20_000_000:
                    atts.append(self.download(doc["file_id"], doc.get("file_name") or "document"))
            if m.get("voice"):
                atts.append(self.download(m["voice"]["file_id"], "vocal.ogg"))
            if m.get("audio"):
                atts.append(self.download(m["audio"]["file_id"], m["audio"].get("file_name") or "audio.mp3"))
        except Exception as e:  # noqa: BLE001
            log.warning("téléchargement Telegram : %s", e)
        if m.get("location"):
            loc = m["location"]
            text += f"\n[Position partagée : {loc.get('latitude')}, {loc.get('longitude')}]"
        if m.get("contact"):
            c = m["contact"]
            text += f"\n[Contact partagé : {c.get('first_name', '')} {c.get('last_name', '')} — {c.get('phone_number', '')}]"
        self.stats["in"] += 1
        owner = self.zeus.is_owner("telegram", chat_id)
        cmd = norm(text.split()[0]) if text.strip().startswith("/") else ""
        if cmd in ("/start", "/aide", "/help") and owner:
            return self.send(chat_id, f"⚡ {self.zeus.config.assistant_name} est prêt. Écris ou envoie un vocal. "
                                      f"Commandes : /nouveau, /stop, /etat, /max, /normal, /depenses, /erreur (ZEUS s'est trompé), "
                                      f"/autonomie prudent|equilibre|autonome.\n"
                                      f"Rôles : /prof anglais B1 (ou espagnol, allemand, français), "
                                      f"/jeu anglais restaurant (jeu de rôle), /defi espagnol es.ser_estar, "
                                      f"/enseignant maths, /interprete anglais, /secretaire, /assistant.\n"
                                      f"Métiers : /formateur (profs), /dirigeant, /rh, /chercheur.")
        if owner and cmd in ("/max", "/normal", "/rapide"):
            s = self.zeus.db.find_session("telegram", chat_id)
            sid = s["id"] if s else self.zeus.db.create_session("telegram", chat_id, "owner")
            s = self.zeus.db.get_session(sid) or {}
            meta = s.get("meta") or {}
            meta["brain"] = {"/max": "max", "/rapide": "fast"}.get(cmd)
            self.zeus.db.update_session(sid, meta=meta)
            routing = self.zeus.config.get("routing") or {}
            target = routing.get({"/max": "max", "/rapide": "fast"}.get(cmd, "default")) or routing.get("default") or "—"
            return self.send(chat_id, {"/max": "🧠 Mode maximum", "/rapide": "⚡ Mode rapide"}.get(cmd, "Mode normal") +
                             f" pour cette conversation (modèle : {target}).")
        if owner and cmd in ("/prof", "/teacher", "/langue", "/jeu", "/defi", "/enseignant", "/cours", "/tuteur",
                             "/secretaire", "/secretary", "/assistant", "/interprete", "/interpreter", "/traducteur",
                             "/formateur", "/dirigeant", "/pdg", "/rh", "/drh", "/chercheur", "/recherche"):
            from .. import modes
            m = modes.from_command(text) or modes.normalize("assistant")
            s = self.zeus.db.find_session("telegram", chat_id)
            sid = s["id"] if s else self.zeus.db.create_session("telegram", chat_id, "owner")
            s = self.zeus.db.get_session(sid) or {}
            meta = s.get("meta") or {}
            meta["mode"] = m
            meta["toolsets"] = sorted(set(meta.get("toolsets") or []) |
                                      (set(modes.toolsets(m)) & set(self.zeus.registry.toolsets())))
            self.zeus.db.update_session(sid, meta=meta)
            hint = {"prof_langue": " Écris-moi ou envoie un vocal dans la langue que tu apprends : je te corrige.",
                    "enseignant": " Pose ta question ou envoie la photo de ton exercice.",
                    "secretaire": " Dis-moi : rendez-vous, courrier, tâches, facture…",
                    "interprete": " Envoie un message ou un vocal : je le traduis dans l'autre langue."}.get(m["id"], "")
            return self.send(chat_id, f"{modes.MODES[m['id']]['icon']} Rôle : {modes.describe(m)}.{hint}")
        if owner and cmd in ("/depenses", "/couts", "/budget"):
            c = self.zeus.costs.status()
            lim = f" sur {c['limit']:.2f} $" if c["limit"] else " (pas de plafond)"
            lines = [f"💸 Ce mois : {c['month']:.2f} ${lim} · aujourd'hui : {c['today']:.2f} $"]
            lines += [f"- {m['model_id']} : {m['cost']:.2f} $ ({m['calls']} appels)" for m in c["by_model"][:6]]
            return self.send(chat_id, "\n".join(lines))
        if owner and cmd in ("/erreur", "/trompe", "/faux", "/error"):
            from .. import feedback
            s = self.zeus.db.find_session("telegram", chat_id)
            expected = text.split(None, 1)[1].strip() if len(text.split(None, 1)) > 1 else ""
            try:
                case = feedback.record(self.zeus, s["id"] if s else "", None, "faux", "signalé depuis Telegram",
                                       expected)
            except KeyError:
                return self.send(chat_id, "Je ne trouve pas de réponse de ma part à signaler dans cette conversation.")
            return self.send(chat_id, f"📝 Merci, c'est noté (cas n° {case['id']}). Il servira de test pour que je "
                                      f"ne refasse pas cette erreur." + ("" if expected else
                                      " Tu peux préciser ce que tu attendais : /erreur ta réponse attendue"))
        if owner and cmd in ("/nouveau", "/new"):
            self.zeus.db.create_session("telegram", chat_id, "owner")
            return self.send(chat_id, "🆕 Nouvelle conversation.")
        if owner and cmd in ("/etat", "/status"):
            st = self.zeus.status()
            models = ", ".join(f"{m['id']}{'' if m['healthy'] else ' (en pause)'}" for m in st["models"]) or "aucun"
            return self.send(chat_id, f"Modèles : {models}\n{self.zeus.phone_summary()}\nAutonomie : {st['autonomy']}\n"
                                      f"Validations en attente : {st['stats']['approvals_pending']}")
        if owner and cmd in ("/autonomie", "/autonomy"):
            parts = text.split()
            mode = norm(parts[1]) if len(parts) > 1 else ""
            if mode in ("prudent", "equilibre", "autonome"):
                self.zeus.config.set("security.autonomy", mode)
                return self.send(chat_id, f"Autonomie : {mode}.")
            return self.send(chat_id, "Usage : /autonomie prudent | equilibre | autonome")
        spoken = False
        if owner and voice_only(m) and atts:
            tx = self.zeus.transcribe(atts[0])
            if tx:
                text, atts, spoken = tx, atts[1:], True
                self.send(chat_id, f"🎙️ « {truncate(tx, 300)} »")
        stop_typing = self._typing(chat_id)

        def reply(t: str, files: list[str]) -> None:
            stop_typing.set()
            if spoken and t and self.zeus.config.get("voice.reply_voice", True):
                # Question posée à la voix → réponse aussi en vocal (dans la langue de la réponse), comme Jarvis.
                try:
                    from .. import modes
                    from ..voice import speak
                    sess = self.zeus.db.find_session("telegram", chat_id) or {}
                    said = t
                    if modes.get(sess).get("id") == "prof_langue":
                        from ..tools.learning import lesson_speech
                        said = lesson_speech(t)  # sans les corrections ni les traductions entre parenthèses
                    audio = speak(self.zeus.config, said, self.zeus.config.dir("outputs/voix"))
                    if audio:
                        files = [*files, str(audio)]
                except Exception as e:  # noqa: BLE001
                    log.warning("réponse vocale Telegram : %s", e)
            self.send(chat_id, t, files)

        status = self.zeus.handle_incoming("telegram", chat_id, text, atts, peer_name=name, reply=reply)
        if status in ("ignored", "answered", "stopped", "paired", "injected"):
            stop_typing.set()

    def _typing(self, chat_id: str) -> threading.Event:
        ev = threading.Event()

        def loop() -> None:
            for _ in range(60):
                if ev.is_set() or self._stop.is_set():
                    return
                try:
                    self.call("sendChatAction", {"chat_id": chat_id, "action": "typing"}, timeout=10)
                except Exception:
                    return
                ev.wait(4.5)
        threading.Thread(target=loop, daemon=True).start()
        return ev

    def _callback(self, cq: dict) -> None:
        chat_id = str(((cq.get("message") or {}).get("chat") or {}).get("id"))
        data = cq.get("data") or ""
        ok_text = "?"
        if self.zeus.is_owner("telegram", chat_id) and data.startswith(("ap:", "aq:")):
            parts = data.split(":")
            try:
                aid = int(parts[1])
            except (IndexError, ValueError):
                aid = 0
            appr = self.zeus.db.get_approval(aid) if aid else None
            if appr and data.startswith("aq:"):
                opts = appr.get("options") or []
                idx = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else -1
                answer = opts[idx] if 0 <= idx < len(opts) else ""
                done = self.zeus.approvals.decide(aid, "answer", "telegram", answer)
                ok_text = f"Réponse : {answer}" if done else "Déjà traité"
            elif appr:
                decision = parts[2] if len(parts) > 2 else "deny"
                done = self.zeus.approvals.decide(aid, decision, "telegram")
                ok_text = {"approve": "✅ Autorisé", "always": "✅ Autorisé (toujours)", "session": "✅ Autorisé",
                           "deny": "❌ Refusé"}.get(decision, decision) if done else "Déjà traité"
            msg = cq.get("message") or {}
            try:
                self.call("editMessageText", {"chat_id": chat_id, "message_id": msg.get("message_id"),
                                              "text": (msg.get("text") or "")[:3500] + f"\n\n→ {ok_text}"})
            except Exception:
                pass
        try:
            self.call("answerCallbackQuery", {"callback_query_id": cq.get("id"), "text": ok_text[:190]})
        except Exception:
            pass

    # ------------------------------------------------------------------ envoi
    def send(self, peer: str, text: str, files: list[str] | None = None) -> None:
        for chunk in split_text(text or "", 3900):
            if not chunk.strip():
                continue
            try:
                self.call("sendMessage", {"chat_id": peer, "text": md_to_html(chunk), "parse_mode": "HTML",
                                          "disable_web_page_preview": True})
            except RuntimeError:
                self.call("sendMessage", {"chat_id": peer, "text": chunk, "disable_web_page_preview": True})
        for f in files or []:
            if not Path(f).exists():
                continue
            try:
                if is_image(f) and Path(f).stat().st_size < 10_000_000:
                    self.upload("sendPhoto", peer, "photo", f)
                elif is_audio(f):
                    self.upload("sendAudio", peer, "audio", f)
                else:
                    self.upload("sendDocument", peer, "document", f)
            except Exception as e:  # noqa: BLE001
                log.warning("envoi de fichier Telegram : %s", e)
        self.stats["out"] += 1

    def send_approval(self, approval: dict, text: str) -> None:
        aid = approval["id"]
        if approval.get("kind") == "question" and approval.get("options"):
            kb = [[{"text": truncate(o, 60), "callback_data": f"aq:{aid}:{i}"}] for i, o in enumerate(approval["options"][:6])]
        elif approval.get("kind") == "question":
            kb = []
            text += "\n\n(Réponds simplement par message.)"
        else:
            kb = [[{"text": "✅ Autoriser", "callback_data": f"ap:{aid}:approve"},
                   {"text": "❌ Refuser", "callback_data": f"ap:{aid}:deny"}]]
            if approval.get("risk") not in ("money", "catastrophic"):
                kb.append([{"text": "✅ Toujours autoriser cet outil", "callback_data": f"ap:{aid}:always"}])
        for peer in self.owner_peers():
            params: dict[str, Any] = {"chat_id": peer, "text": text[:3900]}
            if kb:
                params["reply_markup"] = {"inline_keyboard": kb}
            try:
                self.call("sendMessage", params)
            except Exception as e:  # noqa: BLE001
                log.warning("validation Telegram : %s", e)

    def status(self) -> dict:
        return {**super().status(), "bot": self.username}


def voice_only(m: dict) -> bool:
    return bool(m.get("voice")) and not (m.get("text") or m.get("caption"))
