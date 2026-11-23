"""Moteur de dossiers administratifs — le métier de NEO, en plus complet.

Une demande arrive (WhatsApp, Telegram, e-mail, ou saisie manuelle) → ZEUS identifie la démarche,
ouvre un dossier, reçoit les pièces, les lit (PDF, Word, photo + OCR), les classe, repère les pièces
expirées, trop anciennes, illisibles ou en double, calcule ce qui manque, prépare ou envoie les
relances, et passe la main à un agent humain pour la validation. Tout est tracé (journal par dossier).
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import html
import json
import re
import shutil
import time
import zipfile
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .util import fr_datetime, guess_mime, human_size, iso, is_image, jdump, log, norm, parse_json_loose, truncate

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

STATUS_LABELS = {
    "nouveau": "Nouveau", "incomplet": "Pièces manquantes", "complet": "Complet — à vérifier",
    "en_verification": "En vérification", "valide": "Validé", "rejete": "Rejeté", "cloture": "Clôturé",
    "besoin_humain": "Besoin d'un agent",
}
OPEN_STATUSES = ("nouveau", "incomplet", "complet", "en_verification", "besoin_humain")

DOC_TYPES: dict[str, dict[str, Any]] = {
    "piece_identite": {"label": "Pièce d'identité", "kw": [
        "carte d'identite", "carte nationale", "carte d'electeur", "identity card", "carte de sejour", "passeport",
        "passport", "nationalite", "date de naissance", "ne le", "nee le", "sexe", "date d'expiration",
        "republique", "commission electorale", "ceni", "numero de la carte"], "files": ["cni", "identite", "carte", "electeur", "id"]},
    "acte_naissance": {"label": "Acte de naissance", "kw": [
        "acte de naissance", "extrait d'acte", "copie integrale", "officier de l'etat civil", "etat civil",
        "fils de", "fille de", "est ne", "est nee", "registre des naissances", "declaration de naissance"],
        "files": ["naissance", "acte"]},
    "justificatif_domicile": {"label": "Justificatif de domicile", "kw": [
        "facture", "snel", "regideso", "quittance", "loyer", "bail", "attestation de residence",
        "certificat de residence", "domicile", "adresse", "abonne", "electricite", "eau", "consommation"],
        "files": ["facture", "domicile", "residence", "loyer"]},
    "photo_identite": {"label": "Photo d'identité", "kw": ["photo d'identite"], "files": ["photo", "portrait", "selfie"]},
    "diplome": {"label": "Diplôme", "kw": [
        "diplome", "baccalaureat", "examen d'etat", "licence", "master", "graduat", "doctorat", "universite",
        "certificat de fin d'etudes", "brevet", "decerne", "mention"], "files": ["diplome", "bac", "certificat"]},
    "bulletin": {"label": "Bulletin de notes", "kw": [
        "bulletin", "releve de notes", "moyenne", "trimestre", "semestre", "appreciation", "classe", "rang"],
        "files": ["bulletin", "notes", "releve"]},
    "casier_judiciaire": {"label": "Extrait de casier judiciaire", "kw": [
        "casier judiciaire", "extrait de casier", "bulletin n", "condamnation", "neant"], "files": ["casier"]},
    "cv": {"label": "CV", "kw": ["curriculum", "experience professionnelle", "competences", "formation",
                                "langues", "centres d'interet", "profil"], "files": ["cv", "resume"]},
    "lettre_motivation": {"label": "Lettre de motivation", "kw": [
        "lettre de motivation", "madame, monsieur", "je me permets", "candidature", "veuillez agreer",
        "objet :"], "files": ["lettre", "motivation"]},
    "formulaire": {"label": "Formulaire de demande", "kw": [
        "formulaire", "je soussigne", "signature du demandeur", "fait a", "demande de", "cadre reserve"],
        "files": ["formulaire", "demande", "form"]},
    "certificat_medical": {"label": "Certificat médical", "kw": [
        "certificat medical", "docteur", "medecin", "apte", "examen medical", "hopital", "clinique"],
        "files": ["medical", "sante"]},
    "recu_paiement": {"label": "Reçu de paiement des frais", "kw": [
        "recu", "quittance", "paiement", "montant", "frais", "bordereau", "transaction", "reference",
        "mpesa", "orange money", "airtel money", "payé", "paye"], "files": ["recu", "paiement", "bordereau", "frais"]},
    "acte_mariage": {"label": "Acte de mariage", "kw": ["acte de mariage", "mariage", "epoux", "epouse", "conjoint"],
                     "files": ["mariage"]},
    "certificat_nationalite": {"label": "Certificat de nationalité", "kw": ["certificat de nationalite"],
                               "files": ["nationalite"]},
    "attestation_travail": {"label": "Attestation de travail", "kw": [
        "attestation de travail", "attestation d'emploi", "employeur", "employe en qualite", "contrat de travail"],
        "files": ["attestation", "travail", "emploi"]},
    "releve_bancaire": {"label": "Relevé bancaire", "kw": ["releve de compte", "solde", "iban", "banque", "debit", "credit"],
                        "files": ["releve", "banque"]},
    "titre_propriete": {"label": "Titre de propriété", "kw": [
        "titre de propriete", "certificat d'enregistrement", "parcelle", "cadastre", "titre foncier", "contrat de location"],
        "files": ["titre", "parcelle", "propriete"]},
    "plan": {"label": "Plan", "kw": ["plan", "echelle", "facade", "coupe", "architecte", "niveau"], "files": ["plan"]},
    "permis_conduire": {"label": "Permis de conduire", "kw": ["permis de conduire", "driving licence", "categorie"],
                        "files": ["permis"]},
    "autre": {"label": "Autre document", "kw": [], "files": []},
}

MOIS = {"janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7, "aout": 8,
        "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12, "january": 1, "february": 2, "march": 3,
        "april": 4, "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
        "december": 12}
DATE_RE = re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b|"
                     r"\b(\d{1,2})(?:er)?\s+(" + "|".join(MOIS) + r")\s+(\d{4})\b")
EXPIRY_HINTS = ("expire", "expiration", "valable jusqu", "valide jusqu", "date of expiry", "valid until", "fin de validite")
ISSUE_HINTS = ("delivre le", "delivree le", "date de delivrance", "date d'emission", "emis le", "fait a", "date de facture",
               "date :", "du ", "periode")


def _parse_dates(text: str) -> list[tuple[int, _dt.date]]:
    out = []
    for m in DATE_RE.finditer(text):
        try:
            if m.group(1):
                d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                y = y + 2000 if y < 100 and y < 50 else (y + 1900 if y < 100 else y)
            elif m.group(4):
                y, mo, d = int(m.group(4)), int(m.group(5)), int(m.group(6))
            else:
                d, mo, y = int(m.group(7)), MOIS[m.group(8)], int(m.group(9))
            out.append((m.start(), _dt.date(y, mo, d)))
        except (ValueError, KeyError):
            continue
    return out


def extract_fields(text: str) -> dict:
    t = norm(text)
    f: dict[str, Any] = {}
    dates = _parse_dates(t)
    if dates:
        f["dates"] = [d.isoformat() for _, d in dates[:8]]
    for hint in EXPIRY_HINTS:
        i = t.find(hint)
        if i >= 0:
            after = [d for pos, d in dates if pos >= i and pos - i < 160]
            if after:
                f["date_expiration"] = after[0].isoformat()
                break
    for hint in ("delivre le", "delivree le", "date de delivrance", "date d'emission", "emis le", "date de facture"):
        i = t.find(hint)
        if i >= 0:
            after = [d for pos, d in dates if pos >= i and pos - i < 120]
            if after:
                f["date_emission"] = after[0].isoformat()
                break
    m = re.search(r"\bnom\s*[:：]\s*([a-z' -]{2,40})", t)
    if m:
        f["nom"] = m.group(1).strip().upper()
    m = re.search(r"\bpre?noms?\s*[:：]\s*([a-z' -]{2,60})", t)
    if m:
        f["prenoms"] = m.group(1).strip().title()
    m = re.search(r"\b(?:n°|no|numero|num)\s*[:.]?\s*([a-z0-9/-]{5,25})", t)
    if m:
        f["numero"] = m.group(1).upper()
    return f


class DossierEngine:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self._procs: dict[str, dict] = {}
        self.load_procedures()

    # ------------------------------------------------------------------ procédures
    @property
    def builtin_dir(self) -> Path:
        return Path(__file__).parent / "procedures"

    @property
    def custom_dir(self) -> Path:
        return self.zeus.config.dir("procedures")

    def load_procedures(self) -> None:
        procs: dict[str, dict] = {}
        for d in (self.builtin_dir, self.custom_dir):
            for f in sorted(d.glob("*.json")):
                try:
                    pr = json.loads(f.read_text(encoding="utf-8"))
                    pr.setdefault("id", f.stem)
                    pr["builtin"] = d == self.builtin_dir
                    procs[pr["id"]] = pr
                except Exception as e:  # noqa: BLE001
                    log.warning("procédure %s illisible : %s", f.name, e)
        self._procs = procs

    def procedures(self) -> dict[str, dict]:
        return self._procs

    def get_procedure(self, pid: str) -> dict | None:
        if pid in self._procs:
            return self._procs[pid]
        best = self.detect_procedure(pid)
        return self._procs.get(best[0]) if best[1] >= 2 else None

    def save_procedure(self, proc: dict) -> dict:
        pid = re.sub(r"[^a-z0-9_]+", "_", norm(proc.get("id") or proc.get("name") or "procedure")).strip("_")
        proc["id"] = pid
        for key in ("required", "optional"):
            items = []
            for it in proc.get(key) or []:
                if isinstance(it, str):
                    tp = it if it in DOC_TYPES else self._guess_type_from_label(it)
                    items.append({"type": tp, "label": it if tp == "autre" or it not in DOC_TYPES else DOC_TYPES[tp]["label"]})
                else:
                    items.append(it)
            proc[key] = items
        proc.pop("builtin", None)
        (self.custom_dir / f"{pid}.json").write_text(json.dumps(proc, ensure_ascii=False, indent=2), encoding="utf-8")
        self.load_procedures()
        return self._procs[pid]

    @staticmethod
    def _guess_type_from_label(label: str) -> str:
        ln = norm(label)
        best, score = "autre", 0
        for tp, info in DOC_TYPES.items():
            s = sum(2 for k in info["kw"] if k in ln) + sum(1 for k in info["files"] if k in ln)
            if norm(info["label"]) in ln:
                s += 4
            if s > score:
                best, score = tp, s
        return best

    def procedures_summary(self) -> str:
        lines = []
        for pid, pr in self._procs.items():
            req = ", ".join(r.get("label") or DOC_TYPES.get(r["type"], {}).get("label", r["type"]) for r in pr.get("required", []))
            lines.append(f"- {pid} : {pr.get('name')} — pièces : {req}")
        return "\n".join(lines) or "- (aucune démarche configurée)"

    def detect_procedure(self, text: str) -> tuple[str, int]:
        t = norm(text)
        best, score = "", 0
        for pid, pr in self._procs.items():
            s = 0
            for kw in [pr.get("name", "")] + list(pr.get("keywords") or []):
                k = norm(kw)
                if k and k in t:
                    s += 3 if len(k) > 8 else 2
            if pid.replace("_", " ") in t:
                s += 3
            if s > score:
                best, score = pid, s
        return best, score

    # ------------------------------------------------------------------ dossiers
    def dossier_dir(self, did: str) -> Path:
        return self.zeus.config.dir(f"dossiers/{did}")

    def create(self, procedure: str, applicant_name: str = "", channel: str = "manuel", contact: str = "",
               session_id: str = "", actor: str = "zeus", notes: str = "") -> dict:
        pr = self.get_procedure(procedure) or self._procs.get("generique") or {"id": procedure, "name": procedure}
        due = time.time() + float(pr.get("sla_days") or 7) * 86400
        d = self.zeus.db.create_dossier(pr["id"], pr.get("name", pr["id"]), applicant_name, channel, contact,
                                        session_id=session_id, due=due)
        if notes:
            self.zeus.db.update_dossier(d["id"], notes=notes)
        self.zeus.db.add_dossier_event(d["id"], "creation", actor, {"procedure": pr["id"], "channel": channel})
        self.refresh_status(d["id"], actor, notify=False)
        self.zeus.bus.publish("dossier_update", id=d["id"])
        return self.zeus.db.get_dossier(d["id"])  # type: ignore[return-value]

    def open_for(self, channel: str, contact: str) -> dict | None:
        rows = self.zeus.db.list_dossiers(status=",".join(OPEN_STATUSES), channel=channel, contact=contact, limit=5)
        return rows[0] if rows else None

    def attach(self, did: str, src: str | Path, filename: str = "", actor: str = "usager") -> dict:
        db = self.zeus.db
        d = db.get_dossier(did)
        if not d:
            raise ValueError(f"dossier {did} introuvable")
        src = Path(src)
        data = src.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        dup = next((x for x in db.list_documents(did) if x["sha256"] == sha), None)
        name = filename or src.name
        n = len(db.list_documents(did)) + 1
        dest = self.dossier_dir(did) / f"{n:02d}_{re.sub(r'[^A-Za-z0-9._-]+', '_', name)[-80:]}"
        shutil.copy2(src, dest)
        from .tools.documents import extract_text
        text, meta = extract_text(dest, 20000)
        pr = self.get_procedure(d["procedure"]) or {}
        tp, conf, reason = self.classify(text, name, pr, is_image(str(dest)))
        if conf < 0.55 and self.zeus.router.available():
            r = self.llm_classify(text, name, pr, dest if is_image(str(dest)) else None)
            if r and r[1] > conf:
                tp, conf, reason = r
        fields = extract_fields(text)
        problems = []
        if dup:
            problems.append(f"doublon de la pièce n°{dup['id']}")
        if not text.strip() and tp not in ("photo_identite",):
            problems.append("illisible ou sans texte (photo floue ? PDF scanné ?)" if not is_image(str(dest)) else
                            "texte non lisible : vérifier l'image à l'œil")
        today = _dt.date.today()
        req = next((r for r in (pr.get("required") or []) + (pr.get("optional") or []) if r.get("type") == tp), {})
        if fields.get("date_expiration"):
            exp = _dt.date.fromisoformat(fields["date_expiration"])
            if exp < today:
                problems.append(f"expirée depuis le {exp.strftime('%d/%m/%Y')}")
        if req.get("max_age_days") and (fields.get("date_emission") or fields.get("dates")):
            ref = fields.get("date_emission") or max(fields.get("dates") or [today.isoformat()])
            age = (today - _dt.date.fromisoformat(ref)).days
            if age > int(req["max_age_days"]):
                problems.append(f"trop ancienne ({age} jours, maximum {req['max_age_days']})")
        status = "a_verifier" if problems else ("ok" if conf >= 0.5 else "a_verifier")
        doc_id = db.add_document(did, filename=name, path=str(dest), sha256=sha, mime=guess_mime(str(dest)),
                                 size=len(data), doc_type=tp, confidence=round(conf, 2), text=text[:20000],
                                 fields=fields, status=status, problem="; ".join(problems))
        db.add_dossier_event(did, "piece", actor, {"doc": doc_id, "fichier": name, "type": tp,
                                                   "confiance": round(conf, 2), "raison": reason,
                                                   "problemes": problems})
        self.refresh_status(did, actor)
        self.zeus.bus.publish("dossier_update", id=did)
        return db.get_document(doc_id)  # type: ignore[return-value]

    # ------------------------------------------------------------------ classement
    def classify(self, text: str, filename: str, procedure: dict, image: bool) -> tuple[str, float, str]:
        t = norm(text)
        fn = norm(Path(filename).stem)
        wanted = [r["type"] for r in (procedure.get("required") or []) + (procedure.get("optional") or [])]
        scores: dict[str, float] = {}
        for tp, info in DOC_TYPES.items():
            if tp == "autre":
                continue
            s = 0.0
            for k in info["kw"]:
                if k in t:
                    s += 2.0 if len(k) > 10 else 1.0
            for k in info["files"]:
                if re.search(rf"(^|[^a-z]){re.escape(k)}([^a-z]|$)", fn):
                    s += 2.5
            if norm(info["label"]) in t[:300]:
                s += 3
            if tp in wanted and s > 0:
                s *= 1.35
            scores[tp] = s
        if image and len(t) < 25 and "photo_identite" in (wanted or ["photo_identite"]):
            scores["photo_identite"] = max(scores.get("photo_identite", 0), 3.2)
        best = max(scores.items(), key=lambda kv: kv[1]) if scores else ("autre", 0)
        if best[1] <= 0:
            return "autre", 0.1, "aucun indice"
        ordered = sorted(scores.values(), reverse=True)
        margin = ordered[0] - (ordered[1] if len(ordered) > 1 else 0)
        conf = min(0.95, 0.25 + best[1] / 10 + min(margin, 4) / 10)
        return best[0], conf, f"indices texte/nom (score {best[1]:.1f})"

    def llm_classify(self, text: str, filename: str, procedure: dict, image: Path | None) -> tuple[str, float, str] | None:
        types = {tp: info["label"] for tp, info in DOC_TYPES.items()}
        wanted = [r["type"] for r in (procedure.get("required") or [])]
        prompt = (f"Classe ce document administratif. Types possibles : {jdump(types)}.\n"
                  f"Pièces attendues pour la démarche : {', '.join(wanted) or '—'}.\nNom du fichier : {filename}\n"
                  f"Texte extrait (peut être vide ou bruité) :\n{truncate(text, 2500)}\n\n"
                  "Réponds UNIQUEMENT en JSON : {\"type\": \"…\", \"confiance\": 0.0-1.0, \"raison\": \"courte\"}")
        content: Any = prompt
        if image is not None and self.zeus.router.vision_available():
            content = [{"type": "text", "text": prompt}, {"type": "image", "path": str(image)}]
        try:
            r = self.zeus.router.chat([{"role": "system", "content": "Tu réponds uniquement en JSON valide."},
                                       {"role": "user", "content": content}], None, purpose="fast",
                                      max_tokens=200, temperature=0)
            j = parse_json_loose(r.text)
            tp = j.get("type")
            if tp in DOC_TYPES:
                return tp, float(j.get("confiance") or 0.6), "IA : " + str(j.get("raison") or "")[:120]
        except Exception as e:  # noqa: BLE001
            log.debug("classement IA impossible : %s", e)
        return None

    # ------------------------------------------------------------------ complétude
    def check(self, did: str) -> dict:
        db = self.zeus.db
        d = db.get_dossier(did)
        if not d:
            raise ValueError(f"dossier {did} introuvable")
        pr = self.get_procedure(d["procedure"]) or {}
        docs = db.list_documents(did)
        received, missing, problems = [], [], []
        used: set[int] = set()
        for req in pr.get("required") or []:
            cands = [x for x in docs if x["doc_type"] == req["type"] and x["id"] not in used and not x.get("rejected")]
            good = [x for x in cands if not x.get("problem")]
            pick = (good or cands or [None])[0]
            label = req.get("label") or DOC_TYPES.get(req["type"], {}).get("label", req["type"])
            count = int(req.get("count") or 1)
            if pick and count > 1:
                same = [x for x in docs if x["doc_type"] == req["type"]]
                if len(same) < count:
                    missing.append({"type": req["type"], "label": f"{label} ({count - len(same)} de plus)",
                                    "note": req.get("note", "")})
            if pick:
                used.add(pick["id"])
                received.append({"type": req["type"], "label": label, "doc": pick["id"], "file": pick["filename"]})
                if pick.get("problem"):
                    problems.append({"type": req["type"], "label": label, "doc": pick["id"], "problem": pick["problem"]})
            else:
                missing.append({"type": req["type"], "label": label, "note": req.get("note", "")})
        optional_missing = [r.get("label") or DOC_TYPES.get(r["type"], {}).get("label", r["type"])
                            for r in pr.get("optional") or [] if not any(x["doc_type"] == r["type"] for x in docs)]
        extra = [x for x in docs if x["id"] not in used]
        return {"complete": not missing and not problems, "received": received, "missing": missing,
                "problems": problems, "optional_missing": optional_missing,
                "extra": [{"doc": x["id"], "file": x["filename"], "type": x["doc_type"]} for x in extra],
                "procedure": pr.get("name", d["procedure"])}

    def refresh_status(self, did: str, actor: str = "zeus", notify: bool = True) -> str:
        db = self.zeus.db
        d = db.get_dossier(did)
        if not d or d["status"] in ("en_verification", "valide", "rejete", "cloture", "besoin_humain"):
            return d["status"] if d else ""
        c = self.check(did)
        new = "complet" if c["complete"] else ("incomplet" if db.list_documents(did) else "nouveau")
        if new != d["status"]:
            db.update_dossier(did, status=new)
            db.add_dossier_event(did, "statut", actor, {"de": d["status"], "vers": new})
            if new == "complet" and notify:
                self.zeus.notify_owner(f"📁 Dossier {did} complet — {d['title']} ({d['applicant_name'] or d['contact']}). "
                                       f"À vérifier dans ZEUS → Dossiers.")
        return new

    def set_status(self, did: str, status: str, note: str = "", actor: str = "agent", notify: bool = True) -> dict:
        db = self.zeus.db
        d = db.get_dossier(did)
        if not d:
            raise ValueError(f"dossier {did} introuvable")
        if status not in STATUS_LABELS:
            raise ValueError(f"statut inconnu : {status} (possibles : {', '.join(STATUS_LABELS)})")
        db.update_dossier(did, status=status, notes=(d.get("notes") or "") + (f"\n[{iso(time.time())}] {note}" if note else ""))
        db.add_dossier_event(did, "statut", actor, {"de": d["status"], "vers": status, "note": note})
        if notify and status in ("valide", "rejete", "en_verification"):
            msg = {
                "valide": f"✅ Bonne nouvelle : votre dossier {did} ({d['title']}) est validé.{(' ' + note) if note else ''}",
                "rejete": f"Votre dossier {did} ({d['title']}) n'a pas pu être validé : {note or 'voir avec le service'}. "
                          f"Vous pouvez renvoyer ici les pièces corrigées.",
                "en_verification": f"Votre dossier {did} est complet et en cours de vérification par un agent. "
                                   f"Vous serez informé ici.",
            }[status]
            self.send_to_applicant(d, msg)
        self.zeus.bus.publish("dossier_update", id=did)
        return db.get_dossier(did)  # type: ignore[return-value]

    # ------------------------------------------------------------------ relances
    def relance_text(self, d: dict, c: dict | None = None) -> str:
        c = c or self.check(d["id"])
        org = self.zeus.config.get("guichet.organisation") or "notre service"
        lines = [f"Bonjour{(' ' + d['applicant_name'].split()[0]) if d.get('applicant_name') else ''}, ici l'assistant de {org}.",
                 f"Pour votre dossier {d['id']} ({d['title']}), il nous manque encore :"]
        for m in c["missing"]:
            lines.append(f"• {m['label']}{(' — ' + m['note']) if m.get('note') else ''}")
        for pb in c["problems"]:
            lines.append(f"• {pb['label']} à renvoyer : {pb['problem']}")
        lines.append("Vous pouvez envoyer une photo nette ou un PDF directement ici. Merci !")
        return "\n".join(lines)

    def send_to_applicant(self, d: dict, text: str) -> bool:
        ch = self.zeus.channels.get(d.get("channel") or "")
        if not ch or not d.get("contact"):
            return False
        try:
            ch.send(d["contact"], text, [])
            self.zeus.db.add_dossier_event(d["id"], "message", "zeus", {"texte": truncate(text, 800)})
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("message à l'usager impossible : %s", e)
            self.zeus.db.add_dossier_event(d["id"], "erreur", "zeus", {"envoi": str(e)})
            return False

    def due_relances(self) -> list[dict]:
        cfg = self.zeus.config
        hours = float(cfg.get("guichet.relance_hours", 48))
        maxn = int(cfg.get("guichet.max_relances", 3))
        out = []
        for d in self.zeus.db.list_dossiers(status="incomplet,nouveau", limit=500):
            last = max(d.get("last_relance") or 0, d.get("updated") or 0)
            if (d.get("relances") or 0) < maxn and time.time() - last > hours * 3600 and d.get("contact"):
                out.append(d)
        return out

    def relance(self, did: str, send: bool, custom: str = "", actor: str = "zeus") -> tuple[bool, str]:
        db = self.zeus.db
        d = db.get_dossier(did)
        if not d:
            raise ValueError(f"dossier {did} introuvable")
        c = self.check(did)
        if c["complete"]:
            return False, "Le dossier est complet : pas de relance."
        text = custom or self.relance_text(d, c)
        if not send:
            db.add_dossier_event(did, "relance_brouillon", actor, {"texte": text})
            return False, text
        ok = self.send_to_applicant(d, text)
        if ok:
            db.update_dossier(did, last_relance=time.time(), relances=(d.get("relances") or 0) + 1)
            db.add_dossier_event(did, "relance", actor, {"texte": text})
        self.zeus.bus.publish("dossier_update", id=did)
        return ok, text

    def run_relances(self) -> str:
        due = self.due_relances()
        if not due:
            return "Aucune relance à faire."
        auto = bool(self.zeus.config.get("guichet.auto_relance"))
        sent, drafts = [], []
        for d in due:
            ok, _ = self.relance(d["id"], send=auto, actor="planificateur")
            (sent if ok else drafts).append(d["id"])
            if not auto:
                self.zeus.db.update_dossier(d["id"], last_relance=time.time())
        msg = []
        if sent:
            msg.append(f"Relances envoyées : {', '.join(sent)}")
        if drafts:
            msg.append(f"Relances prêtes à envoyer (ZEUS → Dossiers) : {', '.join(drafts)}")
            self.zeus.notify_owner("📨 " + msg[-1])
        return " · ".join(msg)

    def ensure_system_jobs(self) -> None:
        db = self.zeus.db
        if self.zeus.config.get("guichet.enabled", True):
            if not any(s["kind"] == "system:relances" for s in db.list_schedules()):
                db.add_schedule("Relances des dossiers incomplets", "relances", "every 1h", time.time() + 600,
                                kind="system:relances")

    # ------------------------------------------------------------------ canaux (guichet)
    def ingest_from_channel(self, session_id: str, channel: str, contact: str, name: str,
                            attachments: list[str], text: str) -> str:
        """Appelé à chaque message d'un usager externe : classe les pièces jointes, résume l'état."""
        d = self.open_for(channel, contact)
        notes: list[str] = []
        if attachments:
            if not d:
                pid, score = self.detect_procedure(text)
                d = self.create(pid if score >= 2 else "generique", name, channel, contact, session_id, actor="usager")
                notes.append(f"Dossier {d['id']} ouvert automatiquement ({d['title']}) pour ranger les pièces reçues.")
            for a in attachments:
                try:
                    doc = self.attach(d["id"], a, actor="usager")
                    lab = DOC_TYPES.get(doc["doc_type"], {}).get("label", doc["doc_type"])
                    notes.append(f"Pièce reçue « {doc['filename']} » → classée : {lab} (confiance {doc['confidence']:.0%})"
                                 + (f" ⚠️ {doc['problem']}" if doc.get("problem") else ""))
                except Exception as e:  # noqa: BLE001
                    notes.append(f"Pièce « {Path(a).name} » non traitée : {e}")
        if d:
            c = self.check(d["id"])
            d = self.zeus.db.get_dossier(d["id"]) or d
            state = "COMPLET (à annoncer : vérification par un agent)" if c["complete"] else "incomplet"
            notes.append(f"Dossier en cours : {d['id']} — {d['title']} — statut : {STATUS_LABELS.get(d['status'], d['status'])} — {state}.")
            if c["missing"]:
                notes.append("Pièces manquantes : " + "; ".join(m["label"] for m in c["missing"]))
            if c["problems"]:
                notes.append("Pièces à refaire : " + "; ".join(f"{pb['label']} ({pb['problem']})" for pb in c["problems"]))
        if not notes:
            return ""
        return "## Informations du système (fiables)\n" + "\n".join(f"- {n}" for n in notes)

    # ------------------------------------------------------------------ rendu
    def summary_text(self, did: str, with_text: bool = False) -> str:
        db = self.zeus.db
        d = db.get_dossier(did)
        if not d:
            return f"Dossier {did} introuvable."
        c = self.check(did)
        docs = db.list_documents(did)
        lines = [f"Dossier {d['id']} — {d['title']}",
                 f"Demandeur : {d['applicant_name'] or '—'} ({d['channel']} {d['contact'] or ''})",
                 f"Statut : {STATUS_LABELS.get(d['status'], d['status'])} · créé {fr_datetime(d['created'])}"
                 + (f" · échéance {fr_datetime(d['due'])}" if d.get("due") else ""),
                 f"Complet : {'oui' if c['complete'] else 'non'}"]
        if c["missing"]:
            lines.append("Manquant : " + "; ".join(m["label"] for m in c["missing"]))
        if c["problems"]:
            lines.append("Problèmes : " + "; ".join(f"{pb['label']} — {pb['problem']}" for pb in c["problems"]))
        if docs:
            lines.append("Pièces :")
            for x in docs:
                lab = DOC_TYPES.get(x["doc_type"], {}).get("label", x["doc_type"])
                lines.append(f"  #{x['id']} {x['filename']} → {lab} ({x['confidence']:.0%})"
                             + (f" ⚠️ {x['problem']}" if x.get("problem") else "")
                             + (f"\n     extrait : {truncate(x['text'] or '', 300)}" if with_text else ""))
        if d.get("notes"):
            lines.append("Notes : " + truncate(d["notes"], 1200))
        if d.get("fields"):
            lines.append("Infos : " + jdump(d["fields"]))
        return "\n".join(lines)

    def export(self, did: str) -> Path:
        db = self.zeus.db
        d = db.get_dossier(did)
        if not d:
            raise ValueError(f"dossier {did} introuvable")
        out = self.zeus.config.dir("exports") / f"{did}_{time.strftime('%Y%m%d-%H%M')}.zip"
        summary = self.summary_text(did, with_text=True)
        events = db.list_dossier_events(did)
        rows = "".join(f"<tr><td>{iso(e['ts'])}</td><td>{html.escape(e['kind'])}</td><td>{html.escape(e['actor'] or '')}</td>"
                       f"<td>{html.escape(truncate(e['detail'] or '', 400))}</td></tr>" for e in events)
        page = (f"<!doctype html><meta charset='utf-8'><title>{did}</title><style>body{{font-family:system-ui;max-width:900px;"
                f"margin:2em auto;padding:0 1em}}pre{{white-space:pre-wrap;background:#f5f5f5;padding:1em}}td{{border-top:1px solid #ddd;"
                f"padding:4px 8px;vertical-align:top;font-size:13px}}</style><h1>Dossier {did}</h1><pre>{html.escape(summary)}</pre>"
                f"<h2>Journal</h2><table>{rows}</table>")
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("resume.txt", summary)
            z.writestr("resume.html", page)
            for x in db.list_documents(did):
                pth = Path(x["path"])
                if pth.exists():
                    z.write(pth, f"pieces/{pth.name}")
        db.add_dossier_event(did, "export", "zeus", {"fichier": out.name, "taille": human_size(out.stat().st_size)})
        return out
