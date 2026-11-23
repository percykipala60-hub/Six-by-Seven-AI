"""Outils dossiers (propriétaire / agent administratif) et outils du guichet (usagers externes)."""

from __future__ import annotations

from ..dossiers import DOC_TYPES, OPEN_STATUSES, STATUS_LABELS
from ..util import fr_datetime, truncate
from . import ToolContext, ToolResult, p, tool


def _eng(ctx: ToolContext):
    return ctx.zeus.dossiers


def _fmt_check(c: dict) -> str:
    out = [f"Complet : {'OUI' if c['complete'] else 'non'}"]
    if c["received"]:
        out.append("Reçu : " + "; ".join(r["label"] for r in c["received"]))
    if c["missing"]:
        out.append("Manquant : " + "; ".join(m["label"] + (f" ({m['note']})" if m.get("note") else "") for m in c["missing"]))
    if c["problems"]:
        out.append("À refaire : " + "; ".join(f"{pb['label']} — {pb['problem']}" for pb in c["problems"]))
    if c.get("optional_missing"):
        out.append("Facultatif non fourni : " + "; ".join(c["optional_missing"]))
    return "\n".join(out)


# =========================================================================== propriétaire
@tool("dossier_create", "Ouvre un dossier administratif pour un demandeur.",
      {"procedure": p("string", "Identifiant de la démarche (voir procedure_list)"),
       "applicant_name": p("string", "Nom du demandeur"), "contact": p("string", "Numéro WhatsApp, chat Telegram ou e-mail"),
       "channel": p("string", "Canal du demandeur", enum=["whatsapp", "telegram", "email", "manuel"]),
       "notes": p("string")}, required=["procedure"], risk="write", toolset="dossiers")
def dossier_create(ctx: ToolContext, procedure: str, applicant_name: str = "", contact: str = "",
                   channel: str = "manuel", notes: str = "") -> str:
    d = _eng(ctx).create(procedure, applicant_name, channel, contact, actor="agent", notes=notes)
    return f"Dossier {d['id']} ouvert ({d['title']}).\n" + _fmt_check(_eng(ctx).check(d["id"]))


@tool("dossier_list", "Liste les dossiers (filtre par statut ou recherche).",
      {"status": p("string", "Statut(s) séparés par des virgules : " + ", ".join(STATUS_LABELS)),
       "query": p("string", "Nom, numéro, identifiant…")}, toolset="dossiers")
def dossier_list(ctx: ToolContext, status: str = "", query: str = "") -> str:
    rows = ctx.db.list_dossiers(status=status, query=query, limit=60)
    if not rows:
        return "Aucun dossier."
    return "\n".join(f"- {d['id']} · {STATUS_LABELS.get(d['status'], d['status'])} · {d['title']} · "
                     f"{d['applicant_name'] or d['contact'] or '—'} · màj {fr_datetime(d['updated'])}" for d in rows)


@tool("dossier_get", "Détail d'un dossier : pièces, ce qui manque, problèmes, notes (extraits de texte en option).",
      {"id": p("string", "Identifiant, ex. D-2026-0001"), "with_text": p("boolean", "Inclure les extraits")},
      required=["id"], toolset="dossiers")
def dossier_get(ctx: ToolContext, id: str, with_text: bool = False) -> str:  # noqa: A002
    return _eng(ctx).summary_text(id.strip().upper(), with_text=with_text)


@tool("dossier_attach", "Ajoute une pièce (fichier local) à un dossier : lecture, classement et contrôle automatiques.",
      {"id": p("string"), "path": p("string", "Chemin du fichier")}, required=["id", "path"], risk="write",
      toolset="dossiers")
def dossier_attach(ctx: ToolContext, id: str, path: str) -> ToolResult | str:  # noqa: A002
    f = ctx.resolve(path)
    if not f.exists():
        return ToolResult.err(f"fichier introuvable : {f}")
    doc = _eng(ctx).attach(id.strip().upper(), f, actor="agent")
    lab = DOC_TYPES.get(doc["doc_type"], {}).get("label", doc["doc_type"])
    return (f"Pièce #{doc['id']} ajoutée → {lab} ({doc['confidence']:.0%})" +
            (f" ⚠️ {doc['problem']}" if doc.get("problem") else "") + "\n" + _fmt_check(_eng(ctx).check(id.strip().upper())))


@tool("dossier_check", "Vérifie la complétude d'un dossier.", {"id": p("string")}, required=["id"], toolset="dossiers")
def dossier_check(ctx: ToolContext, id: str) -> str:  # noqa: A002
    return _fmt_check(_eng(ctx).check(id.strip().upper()))


@tool("dossier_update", "Change le statut, ajoute une note, corrige le type d'une pièce ou des informations.",
      {"id": p("string"), "status": p("string", "Nouveau statut : " + ", ".join(STATUS_LABELS)),
       "note": p("string", "Note (motif de rejet, remarque…)"),
       "fields": p("object", "Informations à enregistrer (nom, date de naissance…)"),
       "doc_id": p("integer", "Pièce à reclasser"), "doc_type": p("string", "Nouveau type : " + ", ".join(DOC_TYPES)),
       "notify": p("boolean", "Prévenir le demandeur (validé / rejeté / en vérification)")},
      required=["id"], risk="write", toolset="dossiers",
      risk_fn=lambda c, a: "external" if a.get("notify") and a.get("status") else "write")
def dossier_update(ctx: ToolContext, id: str, status: str = "", note: str = "", fields: dict | None = None,  # noqa: A002
                   doc_id: int | None = None, doc_type: str = "", notify: bool = False) -> ToolResult | str:
    did = id.strip().upper()
    eng = _eng(ctx)
    d = ctx.db.get_dossier(did)
    if not d:
        return ToolResult.err(f"dossier {did} introuvable")
    out = []
    if doc_id and doc_type:
        if doc_type not in DOC_TYPES:
            return ToolResult.err(f"type inconnu : {doc_type}")
        ctx.db.update_document(int(doc_id), doc_type=doc_type, confidence=1.0, status="ok")
        ctx.db.add_dossier_event(did, "reclassement", "agent", {"doc": doc_id, "type": doc_type})
        out.append(f"Pièce #{doc_id} reclassée en {DOC_TYPES[doc_type]['label']}.")
    if fields:
        merged = {**(d.get("fields") or {}), **fields}
        ctx.db.update_dossier(did, fields=merged)
        out.append("Informations enregistrées.")
    if status:
        eng.set_status(did, status, note, actor="agent", notify=notify)
        out.append(f"Statut → {STATUS_LABELS.get(status, status)}{' (demandeur prévenu)' if notify else ''}.")
    elif note:
        ctx.db.update_dossier(did, notes=(d.get("notes") or "") + "\n" + note)
        ctx.db.add_dossier_event(did, "note", "agent", {"note": note})
        out.append("Note ajoutée.")
    if not status:
        eng.refresh_status(did, "agent")
    ctx.zeus.bus.publish("dossier_update", id=did)
    return " ".join(out) or "Rien à modifier."


@tool("dossier_relance", "Prépare (send=false) ou envoie (send=true) une relance au demandeur pour les pièces manquantes.",
      {"id": p("string"), "send": p("boolean", "Envoyer réellement"), "message": p("string", "Texte personnalisé")},
      required=["id"], toolset="dossiers", risk_fn=lambda c, a: "external" if a.get("send") else "read",
      summary=lambda a: f"Relancer le demandeur du dossier {a.get('id')}")
def dossier_relance(ctx: ToolContext, id: str, send: bool = False, message: str = "") -> str:  # noqa: A002
    ok, text = _eng(ctx).relance(id.strip().upper(), send=send, custom=message, actor="agent")
    if send:
        return ("Relance envoyée :\n" if ok else "Relance NON envoyée (canal du demandeur indisponible) :\n") + text
    return "Brouillon de relance :\n" + text


@tool("dossier_export", "Exporte un dossier complet (ZIP : pièces + résumé + journal).", {"id": p("string")},
      required=["id"], toolset="dossiers")
def dossier_export(ctx: ToolContext, id: str) -> ToolResult:  # noqa: A002
    f = _eng(ctx).export(id.strip().upper())
    return ToolResult(text=f"Export prêt : {f}", files=[str(f)])


@tool("procedure_list", "Liste les démarches administratives configurées et leurs pièces.", {}, toolset="dossiers")
def procedure_list(ctx: ToolContext) -> str:
    return _eng(ctx).procedures_summary()


@tool("procedure_save", "Crée ou modifie une démarche (pièces requises / facultatives, informations à recueillir).",
      {"id": p("string", "identifiant_court"), "name": p("string", "Nom lisible"), "description": p("string"),
       "keywords": p("array", "Mots qui la font reconnaître", items={"type": "string"}),
       "required": p("array", "Pièces obligatoires (types : " + ", ".join(DOC_TYPES) + ", ou libellés)",
                     items={"type": "string"}),
       "optional": p("array", "Pièces facultatives", items={"type": "string"}),
       "fields": p("array", "Informations à recueillir", items={"type": "string"}),
       "sla_days": p("integer", "Délai de traitement visé (jours)")},
      required=["id", "name", "required"], risk="write", toolset="dossiers")
def procedure_save(ctx: ToolContext, id: str, name: str, required: list, description: str = "",  # noqa: A002
                   keywords: list | None = None, optional: list | None = None, fields: list | None = None,
                   sla_days: int = 7) -> str:
    pr = _eng(ctx).save_procedure({"id": id, "name": name, "description": description, "keywords": keywords or [],
                                   "required": required, "optional": optional or [], "fields": fields or [],
                                   "sla_days": sla_days})
    return f"Démarche « {pr['name']} » enregistrée ({pr['id']}) : " + ", ".join(r["label"] for r in pr["required"])


# =========================================================================== guichet (usagers externes)
def _mine(ctx: ToolContext) -> list[dict]:
    return ctx.db.list_dossiers(channel=ctx.channel, contact=ctx.peer, limit=10)


@tool("guichet_procedures", "Liste les démarches possibles et les pièces demandées.", {}, toolset="guichet",
      trust=("external",))
def guichet_procedures(ctx: ToolContext) -> str:
    return _eng(ctx).procedures_summary()


@tool("guichet_open", "Ouvre (ou reprend) le dossier de l'usager pour une démarche et renvoie les pièces à fournir.",
      {"procedure": p("string", "Identifiant de la démarche"), "nom": p("string", "Nom complet de l'usager")},
      required=["procedure"], toolset="guichet", trust=("external",), parallel_safe=False)
def guichet_open(ctx: ToolContext, procedure: str, nom: str = "") -> ToolResult | str:
    eng = _eng(ctx)
    pr = eng.get_procedure(procedure)
    if not pr:
        return ToolResult.err(f"démarche « {procedure} » inconnue. Démarches : " + ", ".join(eng.procedures()))
    current = next((d for d in _mine(ctx) if d["status"] in OPEN_STATUSES and d["procedure"] == pr["id"]), None)
    if current:
        d = current
        msg = f"Dossier existant repris : {d['id']}."
    else:
        generic = next((d for d in _mine(ctx) if d["status"] in OPEN_STATUSES and d["procedure"] == "generique"), None)
        if generic and pr["id"] != "generique":
            ctx.db.update_dossier(generic["id"], procedure=pr["id"], title=pr["name"])
            ctx.db.add_dossier_event(generic["id"], "procedure", "usager", {"vers": pr["id"]})
            d = ctx.db.get_dossier(generic["id"])  # type: ignore[assignment]
            msg = f"Dossier {d['id']} rattaché à la démarche « {pr['name']} »."
            eng.refresh_status(d["id"], "usager")
        else:
            d = eng.create(pr["id"], nom or ctx.session.get("peer_name") or "", ctx.channel, ctx.peer,
                           ctx.session.get("id", ""), actor="usager")
            msg = f"Dossier {d['id']} ouvert."
    if nom and not d.get("applicant_name"):
        ctx.db.update_dossier(d["id"], applicant_name=nom)
    c = eng.check(d["id"])
    infos = pr.get("fields") or []
    return (f"{msg} Démarche : {pr['name']}.\n{_fmt_check(c)}" +
            (f"\nInformations à demander à l'usager : {', '.join(infos)}" if infos else ""))


@tool("guichet_status", "État des dossiers de l'usager : pièces reçues, manquantes, problèmes.", {}, toolset="guichet",
      trust=("external",))
def guichet_status(ctx: ToolContext) -> str:
    rows = _mine(ctx)
    if not rows:
        return "Aucun dossier pour cet usager."
    out = []
    for d in rows[:3]:
        c = _eng(ctx).check(d["id"])
        out.append(f"{d['id']} — {d['title']} — {STATUS_LABELS.get(d['status'], d['status'])}\n{_fmt_check(c)}")
    return "\n\n".join(out)


@tool("guichet_note", "Enregistre une information donnée par l'usager dans son dossier (nom, date de naissance…).",
      {"info": p("string", "Information, ex. « date_naissance = 12/03/1998 »")}, required=["info"],
      toolset="guichet", trust=("external",))
def guichet_note(ctx: ToolContext, info: str) -> ToolResult | str:
    rows = [d for d in _mine(ctx) if d["status"] in OPEN_STATUSES]
    if not rows:
        return ToolResult.err("aucun dossier ouvert : utilise guichet_open d'abord")
    d = rows[0]
    fields = d.get("fields") or {}
    if "=" in info or ":" in info:
        k, v = info.split("=" if "=" in info else ":", 1)
        fields[k.strip().lower().replace(" ", "_")[:40]] = v.strip()[:300]
        ctx.db.update_dossier(d["id"], fields=fields)
    else:
        ctx.db.update_dossier(d["id"], notes=(d.get("notes") or "") + "\n[usager] " + truncate(info, 500))
    ctx.db.add_dossier_event(d["id"], "info", "usager", {"info": truncate(info, 500)})
    ctx.zeus.bus.publish("dossier_update", id=d["id"])
    return f"Noté dans le dossier {d['id']}."


@tool("guichet_handoff", "Passe la main à un agent humain (doute, réclamation, cas particulier, urgence).",
      {"reason": p("string", "Motif, en une phrase")}, required=["reason"], toolset="guichet", trust=("external",))
def guichet_handoff(ctx: ToolContext, reason: str) -> str:
    rows = [d for d in _mine(ctx) if d["status"] in OPEN_STATUSES]
    who = ctx.session.get("peer_name") or ctx.peer
    if rows:
        d = rows[0]
        _eng(ctx).set_status(d["id"], "besoin_humain", reason, actor="zeus", notify=False)
        ref = d["id"]
    else:
        ref = "(sans dossier)"
    ctx.zeus.notify_owner(f"🙋 Un usager a besoin d'un agent — {who} via {ctx.channel} — dossier {ref} : {reason}")
    ctx.db.audit("zeus", "transfert humain", {"peer": ctx.peer, "channel": ctx.channel, "reason": reason})
    return "Un agent humain a été prévenu et reprendra la conversation."

