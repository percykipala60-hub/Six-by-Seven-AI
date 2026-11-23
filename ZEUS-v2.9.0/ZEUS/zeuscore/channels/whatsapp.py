"""Canal WhatsApp Business (Cloud API de Meta) : guichet 24 h/24 pour les usagers, et canal
privé pour toi. Nécessite une adresse publique HTTPS pour le webhook (ex. Cloudflare Tunnel).
Sans API officielle, ZEUS peut aussi utiliser WhatsApp sur ton téléphone (outil phone_send_whatsapp)."""

from __future__ import annotations

import hashlib
import hmac
import json
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from ..util import guess_mime, is_image, log, truncate
from ..voice import multipart
from . import Channel, split_text

GRAPH = "https://graph.facebook.com"


class WhatsAppChannel(Channel):
    name = "whatsapp"

    def __init__(self, zeus):
        super().__init__(zeus)
        from ..config import Config
        self.token = Config.secret(self.cfg.get("whatsapp.access_token"))
        self.phone_id = str(self.cfg.get("whatsapp.phone_number_id") or "")
        self.version = self.cfg.get("whatsapp.api_version") or "v21.0"
        if not (self.token and self.phone_id):
            raise ValueError("WhatsApp : access_token et phone_number_id requis (Réglages → Canaux)")
        self._seen: list[str] = []

    def start(self) -> None:
        self.connected = True

    def owner_peers(self) -> list[str]:
        return [str(x).lstrip("+") for x in self.cfg.get("owner.whatsapp_numbers") or []]

    # ------------------------------------------------------------------ API
    def _post(self, path: str, payload: dict) -> dict:
        req = urllib.request.Request(f"{GRAPH}/{self.version}/{path}", data=json.dumps(payload).encode(),
                                     headers={"Authorization": f"Bearer {self.token}",
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            self.last_error = body[:300]
            if "131047" in body:
                raise RuntimeError("WhatsApp refuse : plus de 24 h depuis le dernier message de ce contact "
                                   "(il faut un modèle de message approuvé)") from None
            raise RuntimeError(f"WhatsApp : {body[:300]}") from None

    def _media_url(self, media_id: str) -> str:
        req = urllib.request.Request(f"{GRAPH}/{self.version}/{media_id}",
                                     headers={"Authorization": f"Bearer {self.token}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())["url"]

    def download(self, media_id: str, name: str) -> str:
        url = self._media_url(media_id)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.token}", "User-Agent": "ZEUS"})
        d = self.cfg.dir("uploads/whatsapp")
        dest = d / f"{int(time.time() * 1000)}_{name}"
        with urllib.request.urlopen(req, timeout=120) as r:
            dest.write_bytes(r.read())
        return str(dest)

    def upload_media(self, path: str) -> str:
        p = Path(path)
        body, ctype = multipart({"messaging_product": "whatsapp", "type": guess_mime(str(p))},
                                {"file": (p.name, p.read_bytes(), guess_mime(str(p)))})
        req = urllib.request.Request(f"{GRAPH}/{self.version}/{self.phone_id}/media", data=body,
                                     headers={"Authorization": f"Bearer {self.token}", "Content-Type": ctype})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read().decode())["id"]

    # ------------------------------------------------------------------ webhook
    def verify(self, params: dict) -> str | None:
        from ..config import Config
        want = Config.secret(self.cfg.get("whatsapp.verify_token"))
        if params.get("hub.mode") == "subscribe" and want and params.get("hub.verify_token") == want:
            return params.get("hub.challenge", "")
        return None

    def check_signature(self, raw: bytes, header: str) -> bool:
        from ..config import Config
        secret = Config.secret(self.cfg.get("whatsapp.app_secret"))
        if not secret:
            return True
        expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, header or "")

    def handle_webhook(self, payload: dict) -> None:
        for entry in payload.get("entry") or []:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}
                names = {c.get("wa_id"): (c.get("profile") or {}).get("name", "") for c in value.get("contacts") or []}
                for m in value.get("messages") or []:
                    mid = m.get("id", "")
                    if mid in self._seen:
                        continue
                    self._seen = (self._seen + [mid])[-500:]
                    threading.Thread(target=self._handle, args=(m, names.get(m.get("from"), "")), daemon=True).start()

    def _handle(self, m: dict, name: str) -> None:
        frm = str(m.get("from") or "")
        typ = m.get("type")
        text, atts = "", []
        try:
            if typ == "text":
                text = (m.get("text") or {}).get("body", "")
            elif typ in ("image", "document", "audio", "video", "sticker"):
                media = m.get(typ) or {}
                ext = {"image": ".jpg", "audio": ".ogg", "video": ".mp4", "sticker": ".webp"}.get(typ, "")
                fname = media.get("filename") or f"{typ}{ext}"
                text = media.get("caption", "")
                if typ != "video":
                    atts.append(self.download(media["id"], fname))
                else:
                    text += "\n[vidéo reçue — non traitée]"
            elif typ == "location":
                loc = m.get("location") or {}
                text = f"[Position : {loc.get('latitude')}, {loc.get('longitude')}] {loc.get('name', '')}"
            elif typ == "interactive":
                it = m.get("interactive") or {}
                rep = it.get("button_reply") or it.get("list_reply") or {}
                rid = rep.get("id", "")
                if rid.startswith("ap:") and self.zeus.is_owner("whatsapp", frm):
                    _, aid, decision = (rid.split(":") + ["deny"])[:3]
                    done = self.zeus.approvals.decide(int(aid), decision, "whatsapp")
                    self.send(frm, "✅ Autorisé." if done and decision != "deny" else ("❌ Refusé." if done else "Déjà traité."))
                    return
                text = rep.get("title", "")
            elif typ == "button":
                text = (m.get("button") or {}).get("text", "")
            else:
                text = f"[message de type {typ}]"
        except Exception as e:  # noqa: BLE001
            log.warning("WhatsApp entrant : %s", e)
        self.stats["in"] += 1
        try:
            self._post(f"{self.phone_id}/messages", {"messaging_product": "whatsapp", "status": "read",
                                                     "message_id": m.get("id")})
        except Exception:
            pass
        if self.zeus.is_owner("whatsapp", frm) and atts and atts[0].endswith(".ogg") and not text:
            tx = self.zeus.transcribe(atts[0])
            if tx:
                text, atts = tx, atts[1:]
        self.zeus.handle_incoming("whatsapp", frm, text, atts, peer_name=name,
                                  reply=lambda t, files: self.send(frm, t, files))

    # ------------------------------------------------------------------ envoi
    def send(self, peer: str, text: str, files: list[str] | None = None) -> None:
        to = str(peer).lstrip("+")
        for chunk in split_text(text or "", 3800):
            if chunk.strip():
                self._post(f"{self.phone_id}/messages", {"messaging_product": "whatsapp", "to": to, "type": "text",
                                                         "text": {"body": chunk, "preview_url": False}})
        for f in files or []:
            if not Path(f).exists():
                continue
            try:
                mid = self.upload_media(f)
                if is_image(f):
                    payload: dict[str, Any] = {"type": "image", "image": {"id": mid}}
                else:
                    payload = {"type": "document", "document": {"id": mid, "filename": Path(f).name}}
                self._post(f"{self.phone_id}/messages", {"messaging_product": "whatsapp", "to": to, **payload})
            except Exception as e:  # noqa: BLE001
                log.warning("fichier WhatsApp : %s", e)
        self.stats["out"] += 1

    def send_approval(self, approval: dict, text: str) -> None:
        aid = approval["id"]
        for peer in self.owner_peers():
            try:
                if approval.get("kind") == "question":
                    self.send(peer, text + "\n\n(Réponds par message.)")
                    continue
                self._post(f"{self.phone_id}/messages", {
                    "messaging_product": "whatsapp", "to": peer, "type": "interactive",
                    "interactive": {"type": "button", "body": {"text": truncate(text, 1000)}, "action": {"buttons": [
                        {"type": "reply", "reply": {"id": f"ap:{aid}:approve", "title": "✅ Autoriser"}},
                        {"type": "reply", "reply": {"id": f"ap:{aid}:deny", "title": "❌ Refuser"}}]}}})
            except Exception as e:  # noqa: BLE001
                log.warning("validation WhatsApp : %s", e)
