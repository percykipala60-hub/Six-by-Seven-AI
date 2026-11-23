"""Outils de secrétariat : agenda (avec rappels et export .ics), carnet d'adresses, tâches, factures et devis."""

from __future__ import annotations

import datetime as _dt
import time
from decimal import ROUND_HALF_UP, Decimal

from ..util import fr_datetime, slugify, truncate
from . import ToolContext, ToolError, ToolResult, p, tool


def _when(text: str, now: float | None = None) -> float:
    """« demain à 14h », « 2026-11-20 09:30 », « lundi à 10h » → horodatage (un seul moment, pas une récurrence)."""
    from ..scheduler import parse_schedule
    spec, ts = parse_schedule(text, now)
    if not spec.startswith("once"):
        raise ValueError("indique une date précise (pour une récurrence, utilise schedule_task)")
    return ts


def _deliver(ctx: ToolContext) -> str:
    return f"{ctx.channel}:{ctx.peer}" if ctx.channel in ("telegram", "whatsapp", "email") else "owner"


def _hm(ts: float) -> str:
    return _dt.datetime.fromtimestamp(ts).strftime("%H:%M")


def _source_label(ctx_or_zeus, e: dict) -> str:
    src = e.get("source") or ""
    if not src.startswith("feed:"):
        return ""
    zeus = getattr(ctx_or_zeus, "zeus", ctx_or_zeus)
    for f in zeus.calendars.feeds():
        if f"feed:{f['id']}" == src:
            return f" [{f.get('name') or f.get('provider')}]"
    return " [agenda externe]"


def _event_line(e: dict, label: str = "") -> str:
    where = f" @ {e['location']}" if e.get("location") else ""
    who = f" avec {e['attendees']}" if e.get("attendees") else ""
    return f"- #{e['id']} {fr_datetime(e['start'])} → {_hm(e['end'])} : {e['title']}{where}{who}{label}"


# =========================================================================== agenda
@tool("agenda_add", "Ajoute un rendez-vous à l'agenda de ZEUS, avec rappel automatique avant l'heure. "
                    "Signale les conflits d'horaire.",
      {"title": p("string", "Intitulé, ex. « Réunion budget »"),
       "when": p("string", "Début : « demain à 14h », « lundi à 9h30 », « 2026-11-20 10:00 »"),
       "duration": p("integer", "Durée en minutes (60)"),
       "location": p("string", "Lieu ou lien de visio"),
       "attendees": p("string", "Participants"),
       "notes": p("string", "Notes, ordre du jour"),
       "remind": p("integer", "Rappel N minutes avant (15 ; 0 = aucun)")},
      required=["title", "when"], toolset="secretariat")
def agenda_add(ctx: ToolContext, title: str, when: str, duration: int = 60, location: str = "", attendees: str = "",
               notes: str = "", remind: int = 15) -> str:
    try:
        start = _when(when)
    except ValueError as e:
        raise ToolError(str(e))
    end = start + max(5, int(duration or 60)) * 60
    conflicts = ctx.db.list_events(start + 1, end - 1)
    rid = None
    remind = max(0, int(remind or 0))
    if remind and start - remind * 60 > time.time() + 30:
        at = start - remind * 60
        msg = f"⏰ Rappel : « {title} » à {_hm(start)}" + (f" — {location}" if location else "")
        rid = ctx.db.add_schedule(f"Rappel : {truncate(title, 40)}", msg,
                                  f"once {_dt.datetime.fromtimestamp(at):%Y-%m-%dT%H:%M}", at,
                                  deliver=_deliver(ctx), kind="reminder")
        ctx.emit("schedule_changed", id=rid)
    eid = ctx.db.add_event(title.strip()[:200], start, end, location.strip()[:200], notes.strip()[:2000],
                           attendees.strip()[:300], rid)
    ctx.emit("agenda_changed", id=eid)
    out = f"Rendez-vous #{eid} ajouté : {fr_datetime(start)} → {_hm(end)}, « {title} »."
    if rid:
        out += f" Rappel {remind} min avant."
    if conflicts:
        out += " ⚠️ Conflit avec : " + "; ".join(f"#{c['id']} {c['title']} ({_hm(c['start'])}-{_hm(c['end'])})"
                                               f"{_source_label(ctx, c)}" for c in conflicts)
    from ..calendar_sync import google_link, outlook_link
    ev = {"title": title, "start": start, "end": end, "location": location, "notes": notes, "attendees": attendees}
    out += (f"\nPour l'ajouter aussi à ton agenda en un clic — Google : {google_link(ev)} — Outlook : "
            f"{outlook_link(ev)}")
    return out


@tool("agenda_list", "Liste les rendez-vous de l'agenda de ZEUS sur une période.",
      {"days": p("integer", "Nombre de jours à partir du début (7)"),
       "start": p("string", "Début : vide = aujourd'hui, ou « 2026-11-20 »")}, toolset="secretariat")
def agenda_list(ctx: ToolContext, days: int = 7, start: str = "") -> str:
    if start:
        try:
            d = _dt.date.fromisoformat(start.strip()[:10])
        except ValueError:
            raise ToolError("date de début au format AAAA-MM-JJ.")
    else:
        d = _dt.date.today()
    t0 = time.mktime(d.timetuple())
    t1 = t0 + max(1, min(366, int(days or 7))) * 86400
    rows = ctx.db.list_events(t0, t1)
    if not rows:
        return f"Aucun rendez-vous du {d:%d/%m/%Y} sur {days} jour(s)."
    return "\n".join(_event_line(e, _source_label(ctx, e)) + (f"\n  notes : {truncate(e['notes'], 200)}" if e.get("notes") else "")
                     for e in rows)


@tool("agenda_delete", "Supprime un rendez-vous (et son rappel).", {"id": p("integer", "Numéro du rendez-vous")},
      required=["id"], toolset="secretariat", risk="write")
def agenda_delete(ctx: ToolContext, id: int) -> str:  # noqa: A002
    e = ctx.db.get_event(int(id))
    if not e:
        return "Rendez-vous introuvable."
    if (e.get("source") or "").startswith("feed:"):
        raise ToolError(f"« {e['title']} » vient d'un agenda externe{_source_label(ctx, e)} : ZEUS le lit seulement. "
                        f"Supprime-le dans Google Agenda ou Outlook ; il disparaîtra ici à la prochaine synchronisation.")
    if e.get("reminder_id"):
        ctx.db.delete_schedule(int(e["reminder_id"]))
        ctx.emit("schedule_changed", id=e["reminder_id"])
    ctx.db.delete_event(e["id"])
    ctx.emit("agenda_changed", id=e["id"])
    return f"Rendez-vous « {e['title']} » supprimé."


def ics_text(events: list[dict], name: str = "ZEUS") -> str:
    def esc(s: str) -> str:
        return (s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")

    def dt(ts: float) -> str:
        return _dt.datetime.fromtimestamp(ts, _dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:-//{name}//Agenda//FR", "CALSCALE:GREGORIAN"]
    for e in events:
        lines += ["BEGIN:VEVENT", f"UID:zeus-{e['id']}-{int(e['created'] or 0)}@zeus", f"DTSTAMP:{dt(time.time())}",
                  f"DTSTART:{dt(e['start'])}", f"DTEND:{dt(e['end'])}", f"SUMMARY:{esc(e['title'])}"]
        if e.get("location"):
            lines.append(f"LOCATION:{esc(e['location'])}")
        desc = "\n".join(x for x in (e.get("notes") or "", f"Participants : {e['attendees']}" if e.get("attendees") else "") if x)
        if desc:
            lines.append(f"DESCRIPTION:{esc(desc)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


@tool("agenda_export", "Exporte l'agenda en fichier .ics (à importer dans Google Agenda, Outlook, iPhone…).",
      {"path": p("string", "Fichier de sortie (agenda.ics dans l'espace de travail par défaut)"),
       "days": p("integer", "Période à exporter à partir d'aujourd'hui, en jours (365)")},
      toolset="secretariat", risk="write")
def agenda_export(ctx: ToolContext, path: str = "", days: int = 365) -> ToolResult:
    t0 = time.mktime(_dt.date.today().timetuple())
    rows = [e for e in ctx.db.list_events(t0, t0 + max(1, int(days or 365)) * 86400) if not e.get("source")]
    f = ctx.resolve(path or "agenda.ics")
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(ics_text(rows, ctx.cfg.assistant_name), encoding="utf-8")
    return ToolResult(f"{len(rows)} rendez-vous exportés dans {f}", files=[str(f)])


# =========================================================================== agendas externes
@tool("calendar_connect", "Abonne ZEUS à un agenda Google ou Outlook (lecture seule, mis à jour toutes les 15 min). "
                          "Il faut l'adresse secrète iCal : Google Agenda → Paramètres → ton agenda → « Adresse secrète "
                          "au format iCal » ; Outlook.com → Paramètres → Calendrier → Calendriers partagés → Publier "
                          "→ lien ICS.",
      {"url": p("string", "Lien .ics (https://… ou webcal://…)"),
       "name": p("string", "Nom affiché, ex. « Agenda pro »"),
       "remind": p("integer", "Rappel N minutes avant chaque rendez-vous de cet agenda (0 = aucun)")},
      required=["url"], toolset="secretariat", risk="write")
def calendar_connect(ctx: ToolContext, url: str, name: str = "", remind: int = 0) -> str:
    cs = ctx.zeus.calendars
    try:
        feed = cs.add_feed(url, name, remind)
    except ValueError as e:
        raise ToolError(str(e))
    st = cs.sync(feed)
    if not st.get("ok"):
        cs.remove_feed(feed["id"])
        raise ToolError(f"impossible de lire ce calendrier : {st.get('error')}")
    return (f"Agenda « {feed['name']} » ({feed['provider']}) branché : {st['events']} rendez-vous importés. "
            f"ZEUS le relit toutes les {ctx.cfg.get('calendar.sync_minutes') or 15} minutes."
            + (f" Rappels {feed['remind']} min avant." if feed.get("remind") else ""))


@tool("calendar_feeds", "Liste les agendas externes branchés (Google, Outlook…) et l'état de leur synchronisation.",
      {}, toolset="secretariat")
def calendar_feeds(ctx: ToolContext) -> str:
    cs = ctx.zeus.calendars
    feeds, st = cs.feeds(), cs.status()
    if not feeds:
        return ("Aucun agenda externe. Pour brancher Google Agenda ou Outlook, donne-moi l'adresse secrète iCal du "
                "calendrier (calendar_connect).")
    out = []
    for f in feeds:
        s = st.get(f["id"]) or {}
        state = (f"{s.get('events', 0)} rendez-vous, synchro {fr_datetime(s['ts'])}" if s.get("ok")
                 else f"ERREUR : {s.get('error')}" if s else "pas encore synchronisé")
        out.append(f"- {f['id']} : {f['name']} ({f['provider']}) — {state}")
    return "\n".join(out)


@tool("calendar_disconnect", "Débranche un agenda externe (ses rendez-vous disparaissent de l'agenda de ZEUS).",
      {"id": p("string", "Identifiant donné par calendar_feeds")}, required=["id"], toolset="secretariat", risk="write")
def calendar_disconnect(ctx: ToolContext, id: str) -> str:  # noqa: A002
    return "Agenda débranché." if ctx.zeus.calendars.remove_feed(id) else "Agenda introuvable (voir calendar_feeds)."


@tool("calendar_sync", "Relit tout de suite les agendas Google / Outlook branchés.", {}, toolset="secretariat")
def calendar_sync(ctx: ToolContext) -> str:
    return ctx.zeus.calendars.sync_all_text()


# =========================================================================== carnet d'adresses
@tool("contact_save", "Enregistre ou complète une fiche du carnet d'adresses de ZEUS (même nom = mise à jour).",
      {"name": p("string", "Nom complet"), "phone": p("string", "Téléphone"), "email": p("string", "E-mail"),
       "company": p("string", "Société / organisation"), "role": p("string", "Fonction ou lien (client, prof, oncle…)"),
       "address": p("string", "Adresse postale"), "notes": p("string", "Notes")},
      required=["name"], toolset="secretariat")
def contact_save(ctx: ToolContext, name: str, phone: str = "", email: str = "", company: str = "", role: str = "",
                 address: str = "", notes: str = "") -> str:
    cid, new = ctx.db.save_contact(name.strip()[:120], phone=phone.strip(), email=email.strip(),
                                   company=company.strip(), role=role.strip(), address=address.strip(),
                                   notes=notes.strip()[:1000])
    ctx.emit("contacts_changed", id=cid)
    return f"Contact {'créé' if new else 'mis à jour'} (#{cid}) : {name}."


@tool("contact_find", "Cherche dans le carnet d'adresses de ZEUS (nom, numéro, e-mail, société, notes).",
      {"query": p("string", "Recherche (vide = tout)")}, toolset="secretariat")
def contact_find(ctx: ToolContext, query: str = "") -> str:
    rows = ctx.db.find_contacts(query.strip(), 30)
    if not rows:
        return "Aucun contact trouvé." + (" (Les contacts du téléphone : phone_contacts.)" if query else "")
    out = []
    for c in rows:
        bits = [x for x in (c["phone"], c["email"], c["company"], c["role"], c["address"]) if x]
        out.append(f"- #{c['id']} {c['name']} — {' · '.join(bits) or '(sans coordonnées)'}"
                   + (f" — {truncate(c['notes'], 120)}" if c["notes"] else ""))
    return "\n".join(out)


@tool("contact_delete", "Supprime une fiche du carnet d'adresses.", {"id": p("integer", "Numéro du contact")},
      required=["id"], toolset="secretariat", risk="write")
def contact_delete(ctx: ToolContext, id: int) -> str:  # noqa: A002
    ok = ctx.db.delete_contact(int(id))
    ctx.emit("contacts_changed", id=id)
    return "Contact supprimé." if ok else "Contact introuvable."


# =========================================================================== tâches
@tool("todo_add", "Ajoute une tâche à la liste de choses à faire (priorité 1 = urgent, 3 = quand possible).",
      {"text": p("string", "La tâche"), "due": p("string", "Échéance : « vendredi à 17h », « 2026-11-20 » (facultatif)"),
       "priority": p("integer", "1 urgent, 2 normal, 3 bas"), "project": p("string", "Projet ou catégorie")},
      required=["text"], toolset="secretariat")
def todo_add(ctx: ToolContext, text: str, due: str = "", priority: int = 2, project: str = "") -> str:
    ts = None
    if due:
        try:
            ts = _when(due)
        except ValueError as e:
            raise ToolError(f"échéance : {e}")
    tid = ctx.db.add_todo(text.strip()[:500], project.strip()[:80], max(1, min(3, int(priority or 2))), ts)
    ctx.emit("todos_changed", id=tid)
    return f"Tâche #{tid} ajoutée" + (f" (échéance {fr_datetime(ts)})" if ts else "") + "."


@tool("todo_list", "Liste les tâches à faire (les plus urgentes d'abord).",
      {"status": p("string", "open = à faire, done = faites, all = toutes", enum=["open", "done", "all"]),
       "project": p("string", "Filtrer par projet")}, toolset="secretariat")
def todo_list(ctx: ToolContext, status: str = "open", project: str = "") -> str:
    rows = ctx.db.list_todos(status or "open", project)
    if not rows:
        return "Aucune tâche." if status != "open" else "Aucune tâche en cours. 🎉"
    now = time.time()
    out = []
    for t in rows:
        late = " ⚠️ EN RETARD" if t["due"] and t["due"] < now and not t["done"] else ""
        due = f" — pour {fr_datetime(t['due'])}" if t["due"] else ""
        proj = f" [{t['project']}]" if t["project"] else ""
        out.append(f"- #{t['id']} {'✓' if t['done'] else {1: '🔴', 2: '🟡', 3: '⚪'}.get(t['priority'], '🟡')}"
                   f"{proj} {t['text']}{due}{late}")
    return "\n".join(out)


@tool("todo_done", "Marque une tâche comme faite (ou la rouvre avec done=false).",
      {"id": p("integer", "Numéro"), "done": p("boolean", "true = faite (défaut)")}, required=["id"],
      toolset="secretariat")
def todo_done(ctx: ToolContext, id: int, done: bool = True) -> str:  # noqa: A002
    ok = ctx.db.set_todo_done(int(id), done is not False)
    ctx.emit("todos_changed", id=id)
    return ("Tâche terminée ✓" if done is not False else "Tâche rouverte.") if ok else "Tâche introuvable."


@tool("todo_delete", "Supprime une tâche.", {"id": p("integer", "Numéro")}, required=["id"], toolset="secretariat",
      risk="write")
def todo_delete(ctx: ToolContext, id: int) -> str:  # noqa: A002
    ok = ctx.db.delete_todo(int(id))
    ctx.emit("todos_changed", id=id)
    return "Tâche supprimée." if ok else "Tâche introuvable."


# =========================================================================== factures et devis
INVOICE_LABELS = {
    "fr": {"facture": "FACTURE", "devis": "DEVIS", "number": "N°", "date": "Date", "due": "Échéance",
           "valid": "Valable jusqu'au", "client": "Client", "desc": "Désignation", "qty": "Qté", "unit": "Prix unitaire",
           "total": "Total", "subtotal": "Total HT", "tax": "TVA", "grand": "Total TTC", "notes": "Conditions",
           "issuer": "Émetteur"},
    "en": {"facture": "INVOICE", "devis": "QUOTE", "number": "No.", "date": "Date", "due": "Due date",
           "valid": "Valid until", "client": "Bill to", "desc": "Description", "qty": "Qty", "unit": "Unit price",
           "total": "Amount", "subtotal": "Subtotal", "tax": "Tax", "grand": "Total due", "notes": "Terms",
           "issuer": "From"},
    "es": {"facture": "FACTURA", "devis": "PRESUPUESTO", "number": "N.º", "date": "Fecha", "due": "Vencimiento",
           "valid": "Válido hasta", "client": "Cliente", "desc": "Concepto", "qty": "Cant.", "unit": "Precio unitario",
           "total": "Importe", "subtotal": "Base imponible", "tax": "IVA", "grand": "Total", "notes": "Condiciones",
           "issuer": "Emisor"},
    "de": {"facture": "RECHNUNG", "devis": "ANGEBOT", "number": "Nr.", "date": "Datum", "due": "Fällig am",
           "valid": "Gültig bis", "client": "Kunde", "desc": "Beschreibung", "qty": "Menge", "unit": "Einzelpreis",
           "total": "Betrag", "subtotal": "Nettobetrag", "tax": "MwSt.", "grand": "Gesamtbetrag", "notes": "Bedingungen",
           "issuer": "Absender"},
}


def _money(v: Decimal, cur: str) -> str:
    q = v.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    s = f"{q:,.2f}".replace(",", " ").replace(".", ",")
    return f"{s} {cur}".strip()


def invoice_totals(items: list, tax_rate: float = 0) -> tuple[list[dict], Decimal, Decimal, Decimal]:
    rows, sub = [], Decimal("0")
    for it in items or []:
        if not isinstance(it, dict) or not str(it.get("description") or "").strip():
            continue
        qty = Decimal(str(it.get("quantity") if it.get("quantity") not in (None, "") else 1))
        unit = Decimal(str(it.get("unit_price") or 0))
        line = (qty * unit).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        rows.append({"description": str(it["description"]).strip(), "quantity": qty, "unit_price": unit, "total": line})
        sub += line
    tax = (sub * Decimal(str(tax_rate or 0)) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return rows, sub, tax, sub + tax


@tool("invoice_create", "Crée une facture ou un devis professionnel en Word (.docx), totaux calculés exactement, "
                        "en français, anglais, espagnol ou allemand.",
      {"kind": p("string", "facture ou devis", enum=["facture", "devis"]),
       "client": p("string", "Nom du client"), "client_details": p("string", "Adresse / coordonnées du client"),
       "items": p("array", "Lignes", items={"type": "object", "properties": {
           "description": {"type": "string"}, "quantity": {"type": "number"}, "unit_price": {"type": "number"}},
           "required": ["description", "unit_price"]}),
       "issuer": p("string", "Émetteur (ton nom ou ta société)"), "issuer_details": p("string", "Adresse, n° d'entreprise…"),
       "number": p("string", "Numéro (automatique si vide)"), "currency": p("string", "Devise : €, $, FC, CFA… (€)"),
       "tax_rate": p("number", "Taux de TVA en % (0)"), "due_days": p("integer", "Échéance / validité en jours (30)"),
       "notes": p("string", "Conditions de paiement, coordonnées bancaires, mentions"),
       "lang": p("string", "Langue : fr, en, es, de"), "path": p("string", "Fichier .docx de sortie (facultatif)")},
      required=["kind", "client", "items"], toolset="secretariat", risk="write")
def invoice_create(ctx: ToolContext, kind: str, client: str, items: list, client_details: str = "", issuer: str = "",
                   issuer_details: str = "", number: str = "", currency: str = "€", tax_rate: float = 0,
                   due_days: int = 30, notes: str = "", lang: str = "fr", path: str = "") -> ToolResult:
    from .office import write_docx
    kind = kind if kind in ("facture", "devis") else "facture"
    L = INVOICE_LABELS.get((lang or "fr")[:2].lower(), INVOICE_LABELS["fr"])
    rows, sub, tax, grand = invoice_totals(items, tax_rate)
    if not rows:
        return ToolResult.err("aucune ligne valable (description et unit_price obligatoires)")
    if not number:
        key = f"invoice_seq_{kind}_{_dt.date.today().year}"
        seq = int(ctx.db.kv_get(key, 0) or 0) + 1
        ctx.db.kv_set(key, seq)
        number = f"{'F' if kind == 'facture' else 'D'}{_dt.date.today().year}-{seq:03d}"
    today = _dt.date.today()
    limit = today + _dt.timedelta(days=max(0, int(due_days or 30)))
    issuer = issuer or ctx.cfg.owner_name or ""
    cur = currency or "€"
    md = []
    if issuer:
        md.append(f"**{issuer}**")
        md += [x for x in issuer_details.splitlines() if x.strip()]
        md.append("")
    md.append(f">>**{L['client']} :** {client}")
    md += [f">>{x}" for x in client_details.splitlines() if x.strip()]
    md += ["", f"**{L['number']}** {number}    **{L['date']} :** {today:%d/%m/%Y}    "
               f"**{L['due'] if kind == 'facture' else L['valid']} :** {limit:%d/%m/%Y}", ""]
    md.append(f"| {L['desc']} | {L['qty']} | {L['unit']} | {L['total']} |")
    md.append("|---|---|---|---|")
    for r in rows:
        q = f"{r['quantity'].normalize():f}".replace(".", ",")
        md.append(f"| {r['description']} | {q} | {_money(r['unit_price'], cur)} | {_money(r['total'], cur)} |")
    md.append(f"| **{L['subtotal']}** | | | **{_money(sub, cur)}** |")
    if tax_rate:
        md.append(f"| {L['tax']} {str(tax_rate).replace('.', ',')} % | | | {_money(tax, cur)} |")
        md.append(f"| **{L['grand']}** | | | **{_money(grand, cur)}** |")
    if notes:
        md += ["", f"## {L['notes']}"] + notes.splitlines()
    f = ctx.resolve(path or f"{'factures' if kind == 'facture' else 'devis'}/{number}_{slugify(client, 30)}.docx")
    if f.suffix.lower() != ".docx":
        f = f.with_suffix(".docx")
    f.parent.mkdir(parents=True, exist_ok=True)
    write_docx(f, "\n".join(md), f"{L[kind]} {number}")
    total = _money(grand if tax_rate else sub, cur)
    return ToolResult(f"{L[kind].capitalize()} {number} pour {client} : {len(rows)} ligne(s), total {total}. "
                      f"Fichier : {f}", files=[str(f)])
