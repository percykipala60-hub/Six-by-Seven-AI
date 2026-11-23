"""Canal e-mail : ZEUS lit la boîte (IMAP), répond (SMTP), range les pièces jointes des usagers.
Gmail : active la validation en 2 étapes et crée un « mot de passe d'application »."""

from __future__ import annotations

import email
import imaplib
import re
import smtplib
import ssl
import threading
import time
from email import policy
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from pathlib import Path
from typing import Any

from ..util import guess_mime, html_to_text, log, truncate
from . import Channel

AUTO_HEADERS = ("auto-submitted", "x-autoreply", "x-autorespond", "list-id", "list-unsubscribe")


def _secret(cfg: Any, key: str) -> str:
    from ..config import Config
    return Config.secret(cfg.get(key))


def send_mail(cfg: Any, to: list[str], subject: str, body: str, attachments: list[str] | None = None,
              in_reply_to: str = "", references: str = "") -> str:
    host = cfg.get("email.smtp_host")
    user = cfg.get("email.username")
    if not host or not user:
        raise RuntimeError("e-mail non configuré (Réglages → E-mail : serveur SMTP, identifiant, mot de passe)")
    msg = EmailMessage()
    msg["From"] = formataddr((cfg.get("email.from_name") or "ZEUS", user))
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid()
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = (references + " " + in_reply_to).strip()
    msg.set_content(body)
    for a in attachments or []:
        pth = Path(a)
        mime = guess_mime(str(pth)).split("/", 1)
        msg.add_attachment(pth.read_bytes(), maintype=mime[0], subtype=mime[1] if len(mime) > 1 else "octet-stream",
                           filename=pth.name)
    port = int(cfg.get("email.smtp_port") or 587)
    ctx = ssl.create_default_context()
    if cfg.get("email.smtp_ssl") or port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=60) as s:
            s.login(user, _secret(cfg, "email.password"))
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=60) as s:
            s.ehlo()
            s.starttls(context=ctx)
            s.login(user, _secret(cfg, "email.password"))
            s.send_message(msg)
    return msg["Message-ID"]


def _imap(cfg: Any) -> imaplib.IMAP4_SSL:
    host = cfg.get("email.imap_host")
    if not host:
        raise RuntimeError("IMAP non configuré")
    m = imaplib.IMAP4_SSL(host, int(cfg.get("email.imap_port") or 993), timeout=60)
    m.login(cfg.get("email.username"), _secret(cfg, "email.password"))
    return m


def _body(msg: email.message.EmailMessage) -> str:
    part = msg.get_body(preferencelist=("plain", "html"))
    if part is None:
        return ""
    try:
        text = part.get_content()
    except Exception:
        return ""
    if part.get_content_type() == "text/html":
        text = html_to_text(text)[1]
    # retire les citations des réponses précédentes
    text = re.split(r"\n(?:Le .{5,80} a écrit ?:|On .{5,80} wrote:|-----Original Message-----)", text)[0]
    return text.strip()


def list_messages(cfg: Any, limit: int = 10, unread_only: bool = False, query: str = "") -> list[dict]:
    m = _imap(cfg)
    try:
        m.select(cfg.get("email.folder") or "INBOX", readonly=True)
        crit = ["UNSEEN"] if unread_only else ["ALL"]
        if query:
            q = query.replace('"', "")
            crit = crit + ["OR", "FROM", f'"{q}"', "SUBJECT", f'"{q}"']
        typ, data = m.search("UTF-8", *crit) if not query.isascii() else m.search(None, *crit)
        ids = (data[0] or b"").split()[-limit:]
        out = []
        for i in reversed(ids):
            typ, msgdata = m.fetch(i, "(BODY.PEEK[])")
            raw = next((x[1] for x in msgdata if isinstance(x, tuple)), b"")
            msg = email.message_from_bytes(raw, policy=policy.default)
            out.append({"from": str(msg.get("From", "")), "subject": str(msg.get("Subject", "")),
                        "date": str(msg.get("Date", ""))[:31], "snippet": truncate(_body(msg), 600)})
        return out
    finally:
        try:
            m.logout()
        except Exception:
            pass


class EmailChannel(Channel):
    name = "email"

    def __init__(self, zeus):
        super().__init__(zeus)
        if not (self.cfg.get("email.imap_host") and self.cfg.get("email.username")):
            raise ValueError("e-mail : serveur IMAP et identifiant requis")
        self._thread: threading.Thread | None = None
        self._threads: dict[str, dict] = {}

    def start(self) -> None:
        m = _imap(self.cfg)
        m.logout()
        self.connected = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="email")
        self._thread.start()

    def owner_peers(self) -> list[str]:
        return [str(x) for x in self.cfg.get("owner.emails") or []]

    def send_approval(self, approval: dict, text: str) -> None:
        """Par e-mail seulement si la demande vient d'une conversation e-mail (sinon trop de messages)."""
        s = self.zeus.db.get_session(approval.get("session_id") or "") or {}
        if s.get("channel") == "email":
            super().send_approval(approval, text)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.poll()
                self.connected, self.last_error = True, ""
            except Exception as e:  # noqa: BLE001
                self.connected, self.last_error = False, str(e)
                log.warning("e-mail : %s", e)
            self._stop.wait(max(20, int(self.cfg.get("email.poll_seconds") or 60)))

    def poll(self) -> int:
        m = _imap(self.cfg)
        n = 0
        me = (self.cfg.get("email.username") or "").lower()
        try:
            m.select(self.cfg.get("email.folder") or "INBOX")
            typ, data = m.search(None, "UNSEEN")
            for i in (data[0] or b"").split()[:10]:
                typ, msgdata = m.fetch(i, "(RFC822)")
                raw = next((x[1] for x in msgdata if isinstance(x, tuple)), b"")
                msg = email.message_from_bytes(raw, policy=policy.default)
                frm = parseaddr(str(msg.get("From", "")))[1].lower()
                if not frm or frm == me or "noreply" in frm or "no-reply" in frm or "mailer-daemon" in frm:
                    continue
                if any(h in (k.lower() for k in msg.keys()) for h in AUTO_HEADERS) or \
                        str(msg.get("Precedence", "")).lower() in ("bulk", "list", "junk"):
                    continue
                subject = str(msg.get("Subject", ""))
                mid = str(msg.get("Message-ID", ""))
                atts = []
                d = self.cfg.dir("uploads/email")
                for part in msg.iter_attachments():
                    fn = part.get_filename()
                    if not fn:
                        continue
                    data_b = part.get_payload(decode=True) or b""
                    if len(data_b) > 20_000_000:
                        continue
                    dest = d / f"{int(time.time() * 1000)}_{re.sub(r'[^A-Za-z0-9._-]+', '_', fn)}"
                    dest.write_bytes(data_b)
                    atts.append(str(dest))
                text = f"[E-mail] Objet : {subject}\n\n{_body(msg)}"
                self._threads[frm] = {"subject": subject, "mid": mid, "refs": str(msg.get("References", ""))}
                self.stats["in"] += 1
                n += 1
                self.zeus.handle_incoming("email", frm, text, atts, peer_name=parseaddr(str(msg.get("From", "")))[0],
                                          reply=lambda t, files, frm=frm: self.send(frm, t, files))
        finally:
            try:
                m.logout()
            except Exception:
                pass
        return n

    def send(self, peer: str, text: str, files: list[str] | None = None) -> None:
        th = self._threads.get(peer.lower(), {})
        subj = th.get("subject") or f"Message de {self.zeus.config.assistant_name}"
        if th and not subj.lower().startswith("re:"):
            subj = "Re: " + subj
        send_mail(self.cfg, [peer], subj, text, files or [], in_reply_to=th.get("mid", ""), references=th.get("refs", ""))
        self.stats["out"] += 1
