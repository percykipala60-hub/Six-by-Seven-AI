"""Communication : e-mails (SMTP/IMAP), Telegram, WhatsApp Cloud API."""

from __future__ import annotations

from ..util import truncate, wrap_untrusted
from . import ToolContext, ToolResult, p, tool


@tool("send_email", "Envoie un e-mail (compte configuré dans Réglages → E-mail), pièces jointes possibles.",
      {"to": p("string", "Destinataire(s), séparés par des virgules"), "subject": p("string", "Objet"),
       "body": p("string", "Texte du message"), "attachments": p("array", "Chemins de fichiers", items={"type": "string"})},
      required=["to", "subject", "body"], risk="external", toolset="comms",
      summary=lambda a: f"E-mail à {a.get('to')} — « {a.get('subject')} » :\n{truncate(str(a.get('body', '')), 500)}")
def send_email(ctx: ToolContext, to: str, subject: str, body: str, attachments: list | None = None) -> ToolResult | str:
    from ..channels.email_channel import send_mail
    files = [str(ctx.resolve(a)) for a in (attachments or [])]
    missing = [f for f in files if not __import__("os").path.exists(f)]
    if missing:
        return ToolResult.err(f"pièces jointes introuvables : {', '.join(missing)}")
    send_mail(ctx.cfg, [t.strip() for t in to.split(",") if t.strip()], subject, body, files)
    return f"E-mail envoyé à {to}."


@tool("read_inbox", "Lit les derniers e-mails de la boîte de réception (sans les marquer comme lus).",
      {"limit": p("integer", "Nombre (10)"), "unread_only": p("boolean", "Seulement les non lus"),
       "query": p("string", "Filtre : expéditeur ou mot de l'objet")}, toolset="comms")
def read_inbox(ctx: ToolContext, limit: int = 10, unread_only: bool = False, query: str = "") -> ToolResult | str:
    from ..channels.email_channel import list_messages
    rows = list_messages(ctx.cfg, limit=max(1, min(int(limit or 10), 50)), unread_only=unread_only, query=query)
    if not rows:
        return "Aucun e-mail trouvé."
    body = "\n\n".join(f"- {r['date']} | De : {r['from']} | Objet : {r['subject']}\n  {truncate(r['snippet'], 400)}"
                       for r in rows)
    return wrap_untrusted("email", body)


@tool("send_telegram", "Envoie un message Telegram via le bot ZEUS (chat_id, ou « owner » pour toi-même).",
      {"chat_id": p("string", "Identifiant du chat, ou owner"), "text": p("string"),
       "file": p("string", "Chemin d'un fichier/image à joindre")}, required=["chat_id", "text"], risk="external",
      toolset="comms", risk_fn=lambda c, a: "read" if str(a.get("chat_id")) == "owner" else "external")
def send_telegram(ctx: ToolContext, chat_id: str, text: str, file: str = "") -> ToolResult | str:
    ch = ctx.zeus.channels.get("telegram")
    if not ch:
        return ToolResult.err("Telegram n'est pas configuré (Réglages → Canaux)")
    files = [str(ctx.resolve(file))] if file else []
    if str(chat_id) == "owner":
        ok = ch.notify_owner(text, files=files)
        return "Envoyé." if ok else ToolResult.err("aucun compte propriétaire Telegram relié")
    ch.send(str(chat_id), text, files)
    return "Message Telegram envoyé."


@tool("send_whatsapp", "Envoie un message via l'API WhatsApp Business (Cloud API). Sans API : utilise "
                       "phone_send_whatsapp (depuis ton téléphone).",
      {"number": p("string", "Numéro international"), "text": p("string")}, required=["number", "text"],
      risk="external", toolset="comms",
      summary=lambda a: f"WhatsApp (API) à {a.get('number')} : « {truncate(str(a.get('text', '')), 300)} »")
def send_whatsapp(ctx: ToolContext, number: str, text: str) -> ToolResult | str:
    ch = ctx.zeus.channels.get("whatsapp")
    if not ch:
        return ToolResult.err("API WhatsApp non configurée — utilise phone_send_whatsapp pour passer par ton téléphone")
    ch.send(number, text, [])
    return "Message WhatsApp envoyé (API)."
