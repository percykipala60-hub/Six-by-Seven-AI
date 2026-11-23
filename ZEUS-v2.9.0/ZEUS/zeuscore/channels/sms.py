"""Canal SMS : ZEUS reçoit et envoie des SMS avec TON téléphone Android (aucun fournisseur payant).

Usages : guichet administratif par SMS (les usagers sans smartphone ni internet peuvent faire leurs
démarches), commandes depuis un autre téléphone du propriétaire.

Protections : jamais de réponse aux numéros courts / expéditeurs nommés (opérateurs, M-Pesa, banques),
limite de réponses par heure et par numéro, réponses courtes (3 SMS maximum).
"""

from __future__ import annotations

import hashlib
import re
import threading
import time
from typing import Any

from ..util import log
from . import Channel


def strip_markdown(t: str) -> str:
    t = re.sub(r"```.*?```", " ", t or "", flags=re.S)
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r"`([^`]+)`", r"\1", t)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1 \2", t)
    t = re.sub(r"^#{1,6}\s*", "", t, flags=re.M)
    t = re.sub(r"^\s*[-*]\s+", "- ", t, flags=re.M)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def is_replyable(sender: str) -> bool:
    """Vrai seulement pour un vrai numéro de téléphone (pas un code court ni un nom d'expéditeur)."""
    s = (sender or "").strip()
    if re.search(r"[A-Za-zÀ-ÿ]", s):
        return False
    return len(re.sub(r"\D", "", s)) >= 8


class SmsChannel(Channel):
    name = "sms"

    def __init__(self, zeus):
        super().__init__(zeus)
        self.mode = "attente"
        self.seen: dict[str, float] = {}
        self.baseline = False
        self.sent_log: dict[str, list[float]] = {}
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ cycle
    def start(self) -> None:
        self.connected = True
        self.zeus.watcher.subscribe(self.on_notifications)
        self._thread = threading.Thread(target=self._loop, daemon=True, name="sms")
        self._thread.start()

    def stop(self) -> None:
        super().stop()
        self.zeus.watcher.unsubscribe(self.on_notifications)

    def _loop(self) -> None:
        while not self._stop.wait(max(5, int(self.cfg.get("sms.poll_seconds") or 20))):
            ph = self.zeus.phone
            try:
                if not (ph.connected() or ph.termux_api()):
                    self.mode = "attente"
                    continue
                if self.mode in ("attente", "fournisseur"):
                    self.poll_provider()
                self.last_error = ""
            except Exception as e:  # noqa: BLE001
                self.last_error = str(e)
                log.debug("sms : %s", e)

    # ------------------------------------------------------------------ réception
    @staticmethod
    def _key(frm: str, body: str, date: str = "") -> str:
        return hashlib.sha1(f"{re.sub(r'[^0-9A-Za-z]', '', frm)}|{body}|{date}".encode("utf-8", "replace")).hexdigest()[:16]

    def poll_provider(self) -> list[dict]:
        """Lecture directe de la boîte SMS (Termux:API, ou ADB si Android l'autorise)."""
        from ..tools.phone import PhoneError
        try:
            rows = self.zeus.phone.read_sms(limit=15)
        except PhoneError:
            self.mode = "notifications"  # Android refuse : on passe par les notifications
            return []
        self.mode = "fournisseur"
        return self._ingest([{"from": r.get("from") or "", "body": r.get("body") or "", "date": str(r.get("date") or ""),
                              "name": ""} for r in rows])

    def on_notifications(self, notifs: list[dict]) -> None:
        """Abonné de la surveillance : SMS reçus vus dans les notifications de l'appli Messages."""
        if self.mode == "fournisseur":
            return
        from ..watcher import SMS_APPS
        rows = []
        for n in notifs:
            if (n.get("app") or "") in SMS_APPS and n.get("text"):
                rows.append({"from": n.get("title") or "", "body": n.get("text") or "", "date": "", "name": n.get("title") or ""})
        if rows:
            self.baseline = True  # les notifications sont déjà filtrées « nouvelles » par la surveillance
            self._ingest(rows)

    def _ingest(self, rows: list[dict]) -> list[dict]:
        fresh = []
        now = time.time()
        for r in rows:
            k = self._key(r["from"], r["body"], r.get("date", ""))
            if k in self.seen:
                continue
            self.seen[k] = now
            fresh.append(r)
        if not self.baseline:
            self.baseline = True
            return []
        for r in reversed(fresh):
            self.handle(r)
        return fresh

    def resolve_number(self, sender: str) -> str:
        if re.search(r"\d{8,}", re.sub(r"[\s.-]", "", sender)):
            return sender
        try:
            found = self.zeus.phone.contacts(sender, 2)
        except Exception:
            found = []
        return found[0]["number"] if found else sender

    def handle(self, r: dict) -> str:
        sender = r["from"].strip()
        number = self.resolve_number(sender)
        self.stats["in"] += 1
        if not is_replyable(number):
            self.zeus.db.audit("zeus", "sms ignoré (expéditeur non joignable)", {"from": sender, "text": r["body"][:200]})
            return "ignored"
        if not self._allow(number):
            self.zeus.db.audit("zeus", "sms : limite de réponses atteinte", {"from": number})
            return "limited"
        name = r.get("name") if r.get("name") and r.get("name") != number else ""
        return self.zeus.handle_incoming("sms", number, r["body"], [], peer_name=name,
                                         reply=lambda t, files, n=number: self.send(n, t, files))

    def _allow(self, number: str) -> bool:
        key = re.sub(r"\D", "", number)[-9:]
        with self._lock:
            hist = [t for t in self.sent_log.get(key, []) if time.time() - t < 3600]
            self.sent_log[key] = hist
            return len(hist) < int(self.cfg.get("sms.max_per_hour") or 6)

    # ------------------------------------------------------------------ envoi
    def send(self, peer: str, text: str, files: list[str] | None = None) -> None:
        body = strip_markdown(text)
        limit = int(self.cfg.get("sms.max_chars") or 459)
        if len(body) > limit:
            body = body[:limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"
        self.zeus.phone.send_sms(peer, body)
        key = re.sub(r"\D", "", peer)[-9:]
        with self._lock:
            self.sent_log.setdefault(key, []).append(time.time())
        self.stats["out"] += 1

    def owner_peers(self) -> list[str]:
        return [str(x) for x in self.cfg.get("owner.phone_numbers") or []]

    def notify_owner(self, text: str, image: str | None = None, files: list[str] | None = None) -> bool:
        if not self.cfg.get("sms.notify_owner"):
            return False  # pas de SMS payant à chaque notification, sauf si tu l'as demandé
        return super().notify_owner(text, None, [])

    def send_approval(self, approval: dict, text: str) -> None:
        s = self.zeus.db.get_session(approval.get("session_id") or "") or {}
        if s.get("channel") == "sms":
            super().send_approval(approval, strip_markdown(text))

    def status(self) -> dict[str, Any]:
        return {**super().status(), "mode": self.mode}
