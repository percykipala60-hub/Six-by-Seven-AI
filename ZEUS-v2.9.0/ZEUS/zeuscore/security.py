"""Sécurité : qui peut faire quoi, et quand ZEUS doit demander la permission.

Trois niveaux de confiance :
- owner    : toi (interface web avec jeton, terminal, tes comptes Telegram/WhatsApp/e-mail)
- system   : tâches planifiées lancées en ton nom (sans personne devant l'écran)
- external : n'importe qui d'autre (usagers du guichet). Ils n'ont accès qu'aux outils
             du guichet : jamais au téléphone, au PC, aux fichiers ni au shell.

Trois niveaux d'autonomie (réglables) : prudent, equilibre, autonome.
L'argent (Mobile Money, paiements, codes PIN, USSD) demande toujours confirmation
tant que security.confirm_payments vaut true.
"""

from __future__ import annotations

import re
import threading
import time
from typing import TYPE_CHECKING

from .util import jdump, log, norm

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus
    from .tools import Tool, ToolContext

POLICIES: dict[str, dict[str, str]] = {
    "prudent": {"read": "allow", "write": "confirm", "external": "confirm", "danger": "confirm"},
    "equilibre": {"read": "allow", "write": "allow", "external": "confirm", "danger": "confirm"},
    "autonome": {"read": "allow", "write": "allow", "external": "allow", "danger": "allow"},
}

AUTONOMY_LABELS = {
    "prudent": "Prudent — demande avant toute modification",
    "equilibre": "Équilibré — agit seul en local, demande avant d'envoyer, supprimer ou payer",
    "autonome": "Autonome — agit seul ; ne demande que pour l'argent et les actions catastrophiques",
}

# --------------------------------------------------------------------------- argent
# Sous-chaînes assez longues pour ne jamais toucher une appli ordinaire…
FINANCE_PACKAGE_HINTS = (
    "mpesa", "m.pesa", "orange.money", "orangemoney", "airtelmoney", "airtel.money", "momo", "mtn.mobile",
    "mobilemoney", "mobile.money", "wallet", "bank", "banque", "rawbank", "equity", "ecobank", "trustmerchant",
    "sofibanque", "afriland", "illicocash", "westernunion", "moneygram", "paypal", "revolut", "transferwise",
    "mastercard", "payment", "finance", "crypto", "binance", "bitcoin", "lydia",
)
# … et mots courts comparés à un segment entier du nom de paquet (« com.wave.personal », pas « com.whatsapp »).
FINANCE_SEGMENTS = ("om", "pay", "spay", "cash", "wave", "wise", "visa", "tmb", "fbn", "airtel", "money", "bnb", "paisa")
MONEY_WORDS = (
    "confirmer le paiement", "confirmer le transfert", "envoyer de l'argent", "envoyer l'argent",
    "transferer", "transfert d'argent", "retrait", "retirer", "payer", "paiement", "montant",
    "code pin", "code secret", "entrez votre pin", "saisir le pin", "mot de passe", "valider la transaction",
    "confirm payment", "send money", "pay now", "enter pin", "withdraw", "transfer", "solde",
    "achat de credit", "acheter du credit", "forfait",
)


def looks_like_ussd(s: str) -> bool:
    s = (s or "").replace(" ", "")
    return bool(re.match(r"^[*#][0-9*#]+#?$", s)) or s.endswith("#") and s.startswith("*")


def is_finance_package(pkg: str) -> bool:
    p = (pkg or "").lower().strip()
    if not p:
        return False
    if any(h in p for h in FINANCE_PACKAGE_HINTS):
        return True
    return any(seg in FINANCE_SEGMENTS for seg in re.split(r"[.\-_]", p))


def text_mentions_money(text: str) -> bool:
    t = norm(text)
    return any(w in t for w in MONEY_WORDS)


# --------------------------------------------------------------------------- shell
CATASTROPHIC = [
    r"\brm\s+-[a-z]*(rf|fr)[a-z]*\s+(--no-preserve-root\s+)?(/|/\*|~|~/|~/\*|\$home/?|\*|\.\.?/?)(\s|$)",
    r"\bmkfs(\.\w+)?\b", r"\bdd\s+.*\bof=/dev/", r"\bformat\s+[a-z]:", r"\bdiskpart\b",
    r":\(\)\s*\{\s*:\|:&\s*\};:", r"\b(shutdown|poweroff|halt)\b", r"\breboot\b",
    r"\bdel\s+/[sfq].*[a-z]:\\\s*$", r"remove-item\s+.*-recurse.*[a-z]:\\\s*$",
    r"\breg\s+delete\s+hklm", r"\bchmod\s+-r\s+0?00\s+/", r"\bcipher\s+/w", r"vssadmin\s+delete",
    r"\bbcdedit\b", r">\s*/dev/sd[a-z]",
]
DANGEROUS = [
    r"\brm\b", r"\brmdir\b", r"\bdel\b", r"\berase\b", r"remove-item", r"\bmv\b", r"\bmove\b",
    r"\bchmod\b", r"\bchown\b", r"\bkill(all)?\b", r"\btaskkill\b", r"stop-process", r"\bsudo\b",
    r"\bsu\b", r"\bapt(-get)?\s+(remove|purge|install)", r"\bpip\s+uninstall", r"\bnpm\s+uninstall",
    r"\bbrew\s+uninstall", r"\bwinget\s+uninstall", r"git\s+push\s+.*--force", r"git\s+reset\s+--hard",
    r"git\s+clean", r"\btruncate\b", r"\bshred\b", r"\bcrontab\s+-r", r"\bsystemctl\s+(stop|disable)",
    r"set-executionpolicy", r"\bnet\s+user\b", r"\bpasswd\b", r"\bsc\s+delete\b",
]
EXTERNAL = [r"\bcurl\b.*\s-(x\s*post|d|f|t)\b", r"\bscp\b", r"\bssh\b", r"\brsync\b.*:", r"git\s+push",
            r"\bsendmail\b", r"\bmail\s+-s", r"invoke-webrequest.*-method\s+post", r"\bftp\b", r"\bnc\b"]
READ_ONLY = [
    r"^(ls|dir|pwd|cd|echo|cat|type|head|tail|wc|whoami|hostname|date|uptime|df|du|free|ps|top\s+-b|which|where|"
    r"uname|ver|systeminfo|ipconfig|ifconfig|ip\s+a|ping|nslookup|tree|find|grep|rg|file|stat|env|printenv|"
    r"python3?\s+--version|node\s+--version|git\s+(status|log|diff|show|branch)|get-childitem|get-content|"
    r"get-process|get-date|get-location|test-path|select-string|adb\s+devices)\b"
]


def classify_shell(cmd: str) -> str:
    c = (cmd or "").strip().lower()
    for pat in CATASTROPHIC:
        if re.search(pat, c):
            return "catastrophic"
    parts = re.split(r"\s*(?:&&|\|\||;|\|)\s*", c)
    risk = "read"
    order = {"read": 0, "write": 1, "external": 2, "danger": 3}
    for part in parts:
        if not part:
            continue
        r = "write"
        if any(re.search(pat, part) for pat in READ_ONLY) and ">" not in part:
            r = "read"
        if any(re.search(pat, part) for pat in EXTERNAL):
            r = "external"
        if any(re.search(pat, part) for pat in DANGEROUS):
            r = "danger"
        if order[r] > order[risk]:
            risk = r
    return risk


def classify_python(code: str) -> str:
    c = code or ""
    if re.search(r"shutil\.rmtree|os\.remove|os\.unlink|\.unlink\(|os\.rmdir|send2trash|subprocess|os\.system|"
                 r"os\.popen|ctypes|winreg|\bformat\(.*\bc:", c):
        return "danger"
    if re.search(r"smtplib|requests\.post|urlopen\(.*data=|socket\.|paramiko|ftplib|\.post\(", c):
        return "external"
    return "write"


# --------------------------------------------------------------------------- décisions
# Sessions pilotées par un client MCP (Claude Desktop, Cursor…) : le client a déjà demandé ton accord pour
# chaque appel (« host »), ou pour la tâche confiée à ZEUS (« host_task »).
HOST_MODES = ("host", "host_task")


class Security:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus

    @property
    def autonomy(self) -> str:
        a = self.zeus.config.get("security.autonomy", "equilibre")
        return a if a in POLICIES else "equilibre"

    def decide(self, ctx: "ToolContext", tool: "Tool", risk: str) -> str:
        """Renvoie « allow », « confirm » ou « deny »."""
        trust = ctx.trust
        if trust == "external":
            return "allow" if "external" in tool.trust else "deny"
        if "owner" not in tool.trust:
            return "deny"
        mode = (ctx.session.get("meta") or {}).get("approval_mode")
        if mode in HOST_MODES:
            if risk in ("money", "catastrophic") or (mode == "host_task" and risk == "danger"):
                return "deny"
            return "allow"
        if risk == "catastrophic":
            return "confirm"
        if risk == "money":
            if self.zeus.config.get("security.confirm_payments", True):
                return "confirm"
            risk = "danger"
        session_allow = set((ctx.session.get("meta") or {}).get("allow_tools") or [])
        if tool.name in session_allow or tool.name in (self.zeus.config.get("security.always_allow") or []):
            return "allow"
        autonomy = (ctx.session.get("meta") or {}).get("autonomy") or self.autonomy
        return POLICIES.get(autonomy, POLICIES["equilibre"]).get(risk, "confirm")

    @staticmethod
    def deny_message(ctx: "ToolContext", risk: str) -> str:
        if (ctx.session.get("meta") or {}).get("approval_mode") in HOST_MODES:
            what = {"money": "touche à l'argent (paiement, Mobile Money, code PIN, USSD)",
                    "catastrophic": "est irréversible", "danger": "est sensible"}.get(risk, "n'est pas permise")
            return (f"action bloquée : elle {what}. Piloté par un client MCP, ZEUS ne la fait jamais seul : "
                    f"demande au propriétaire de la lancer depuis ZEUS (interface web ou Telegram), où il pourra "
                    f"la valider lui-même.")
        return "action non autorisée pour cet interlocuteur."


class Approvals:
    """Demandes de validation / questions au propriétaire, avec attente bloquante."""

    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self._events: dict[int, threading.Event] = {}
        self._lock = threading.Lock()

    def request(self, ctx: "ToolContext", kind: str, tool: str, args: dict, risk: str, summary: str,
                options: list[str] | None = None, timeout: float | None = None) -> tuple[str, str]:
        db = self.zeus.db
        sid = ctx.session.get("id", "")
        aid = db.create_approval(sid, kind, tool, args, risk, summary, options)
        ev = threading.Event()
        with self._lock:
            self._events[aid] = ev
        appr = db.get_approval(aid)
        self.zeus.bus.publish("approval", session_id=sid, approval=appr)
        try:
            self.zeus.notify_approval(appr, ctx)
        except Exception as e:  # noqa: BLE001
            log.warning("notification de validation impossible : %s", e)
        if timeout is None:
            timeout = float(self.zeus.config.get("security.approval_timeout", 600))
            if ctx.trust == "system":
                timeout = max(timeout, 3600)
        deadline = time.time() + timeout
        last_check = time.time()
        while time.time() < deadline:
            if ev.wait(0.5):
                break
            if ctx.run is not None and ctx.run.cancel.is_set():
                db.decide_approval(aid, "cancelled", "annulation")
                break
            if time.time() - last_check >= 2:
                # décision prise par un autre processus ZEUS (ex. ZEUS lancé comme serveur MCP + interface web)
                last_check = time.time()
                cur = db.get_approval(aid) or {}
                if cur.get("status") not in (None, "pending"):
                    break
        with self._lock:
            self._events.pop(aid, None)
        a = db.get_approval(aid) or {}
        if a.get("status") == "pending":
            db.decide_approval(aid, "expired", "délai")
            self.zeus.bus.publish("approval_done", session_id=sid, id=aid, status="expired")
            return "expired", ""
        return a.get("status", "denied"), a.get("answer") or ""

    def decide(self, aid: int, decision: str, by: str = "owner", answer: str = "") -> bool:
        """decision : approve | deny | always | session | answer"""
        db = self.zeus.db
        a = db.get_approval(aid)
        if not a or a["status"] != "pending":
            return False
        status = {"approve": "approved", "always": "approved", "session": "approved",
                  "deny": "denied", "answer": "answered"}.get(decision, "denied")
        if decision == "always" and a.get("tool"):
            allow = list(self.zeus.config.get("security.always_allow") or [])
            if a["tool"] not in allow and a.get("risk") not in ("money", "catastrophic"):
                allow.append(a["tool"])
                self.zeus.config.set("security.always_allow", allow)
        if decision == "session" and a.get("tool") and a.get("session_id"):
            s = db.get_session(a["session_id"])
            if s:
                meta = s.get("meta") or {}
                allow = set(meta.get("allow_tools") or [])
                if a.get("risk") not in ("money", "catastrophic"):
                    allow.add(a["tool"])
                meta["allow_tools"] = sorted(allow)
                db.update_session(a["session_id"], meta=meta)
        ok = db.decide_approval(aid, status, by, answer)
        with self._lock:
            ev = self._events.get(aid)
        if ev:
            ev.set()
        self.zeus.bus.publish("approval_done", session_id=a.get("session_id"), id=aid, status=status)
        db.audit(by, f"validation {status}", {"id": aid, "tool": a.get("tool"), "summary": a.get("summary")})
        return ok

    def pending_question(self, session_id: str) -> dict | None:
        for a in self.zeus.db.list_approvals("pending", 50):
            if a.get("session_id") == session_id and a.get("kind") == "question":
                return a
        return None

    def pending_ids(self) -> list[int]:
        with self._lock:
            return list(self._events)


def risk_label(risk: str) -> str:
    return {"read": "lecture", "write": "modification locale", "external": "action vers l'extérieur",
            "danger": "action sensible", "money": "ARGENT / PAIEMENT", "catastrophic": "ACTION CATASTROPHIQUE"
            }.get(risk, risk)


def describe_args(args: dict) -> str:
    return jdump(args)[:600]


__all__ = ["Security", "Approvals", "classify_shell", "classify_python", "is_finance_package",
           "text_mentions_money", "looks_like_ussd", "POLICIES", "AUTONOMY_LABELS", "risk_label"]

