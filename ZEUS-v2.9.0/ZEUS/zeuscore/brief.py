"""Brief du matin : météo, messages importants reçus sur le téléphone, agenda, dossiers, priorités du jour.

Livré comme une compétence de base (modifiable) + une tâche quotidienne facultative.
"""

from __future__ import annotations

import re
import time
from typing import TYPE_CHECKING

from .scheduler import next_run

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

SKILL_NAME = "brief_du_matin"
SKILL_DESC = "Préparer le brief du matin : météo, messages importants, agenda, dossiers, priorités du jour"
SKILL_STEPS = """1. Météo : web_search « météo <ville> aujourd'hui » (ville indiquée dans la demande ; sinon demande-la une fois
   et retiens-la avec remember). Donne le minimum, le maximum et le risque de pluie.
2. Téléphone (s'il est connecté) : phone_notifications → messages importants reçus depuis la veille au soir
   (proches, travail, banque, Mobile Money). Ignore la publicité et les réseaux sociaux. Pour l'argent :
   résume seulement (montant, expéditeur) — ne lance jamais d'opération.
3. Agenda : rendez-vous et rappels du jour (list_tasks, mémoire).
4. Guichet : dossiers en attente ou incomplets (dossier_list), s'il y en a.
5. Batterie du téléphone si elle est sous 30 % (phone_status).
6. Termine par « ✅ Priorités du jour » : 3 points maximum.
Format : court, petits titres avec emojis (☀️ 📱 📅 🗂️ ✅), lisible sur un téléphone.
N'envoie rien, ne paie rien, ne supprime rien : c'est un compte rendu."""
SCHEDULE_NAME = "☀️ Brief du matin"


def ensure_skill(zeus: "Zeus") -> None:
    """Installe la compétence de base si elle n'existe pas (on ne touche jamais à ta version modifiée)."""
    if not zeus.db.one("SELECT id FROM skills WHERE name=?", (SKILL_NAME,)):
        zeus.db.upsert_skill(SKILL_NAME, SKILL_DESC, SKILL_STEPS, source="zeus-base")


def prompt(zeus: "Zeus") -> str:
    city = (zeus.config.get("owner.city") or "").strip()
    return (f"Fais mon brief du matin (compétence {SKILL_NAME}) : météo, notifications du téléphone, agenda, "
            f"dossiers du guichet, priorités du jour." + (f" Ville : {city}." if city else ""))


def _find(zeus: "Zeus") -> dict | None:
    return next((s for s in zeus.db.list_schedules() if s.get("name") == SCHEDULE_NAME), None)


def schedule(zeus: "Zeus", hhmm: str = "07:00", enabled: bool = True) -> dict:
    m = re.match(r"^\s*(\d{1,2})\s*[:hH]\s*(\d{2})?\s*$", hhmm or "")
    if not m or int(m.group(1)) > 23 or int(m.group(2) or 0) > 59:
        raise ValueError("heure attendue, ex. 07:00")
    spec = f"daily {int(m.group(1)):02d}:{int(m.group(2) or 0):02d}"
    nxt = next_run(spec, time.time())
    cur = _find(zeus)
    if cur:
        zeus.db.update_schedule(cur["id"], spec=spec, next_run=nxt, enabled=1 if enabled else 0, prompt=prompt(zeus))
        sid = cur["id"]
    else:
        sid = zeus.db.add_schedule(SCHEDULE_NAME, prompt(zeus), spec, nxt, deliver="owner", kind="agent")
        if not enabled:
            zeus.db.update_schedule(sid, enabled=0)
    zeus.bus.publish("schedule_changed", id=sid)
    return status(zeus)


def unschedule(zeus: "Zeus") -> bool:
    cur = _find(zeus)
    if not cur:
        return False
    zeus.db.delete_schedule(cur["id"])
    zeus.bus.publish("schedule_changed", id=cur["id"])
    return True


def status(zeus: "Zeus") -> dict:
    cur = _find(zeus)
    if not cur:
        return {"scheduled": False, "time": "07:00", "enabled": False, "id": None, "city": zeus.config.get("owner.city") or ""}
    return {"scheduled": True, "time": (cur.get("spec") or "daily 07:00").split()[-1], "enabled": bool(cur.get("enabled")),
            "id": cur["id"], "next_run": cur.get("next_run"), "city": zeus.config.get("owner.city") or ""}
