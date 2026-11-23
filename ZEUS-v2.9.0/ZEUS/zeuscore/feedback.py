"""« ZEUS s'est trompé » : chaque erreur signalée devient un cas enregistré, prêt à devenir un test.

Un cas garde la question, la réponse fautive, les outils appelés, le modèle, le rôle, ce qui n'allait pas et ce que
le propriétaire attendait. Il est rangé dans la base et dans data/cas/AAAAMMJJ-n.json. Aucune clé ne s'y trouve
(les secrets reconnaissables sont masqués) et les pièces jointes ne sont citées que par leur nom.
"""

from __future__ import annotations

import json
import re
import time
from typing import TYPE_CHECKING, Any

from . import __version__
from .util import truncate

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

KINDS = {
    "faux": "réponse fausse",
    "incomplet": "réponse incomplète ou trop vague",
    "long": "trop long",
    "compris": "ZEUS n'a pas compris la demande",
    "action": "action non voulue ou mauvaise action",
    "langue": "mauvaise langue ou mauvais ton",
    "autre": "autre",
}
STATUSES = ("nouveau", "test", "traite", "ignore")

_SECRET_RE = re.compile(r"(gsk_[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9_\-]{16,}|sk-[A-Za-z0-9_\-]{20,}|AIza[0-9A-Za-z_\-]{30,}"
                        r"|\b\d{8,10}:[A-Za-z0-9_\-]{30,}\b|xox[abp]-[A-Za-z0-9\-]{10,})")


def scrub(text: Any) -> str:
    """Masque les clés d'API reconnaissables dans un texte."""
    return _SECRET_RE.sub(lambda m: m.group(0)[:4] + "••••", str(text or ""))


def _text(m: dict) -> str:
    c = m.get("content")
    if isinstance(c, list):
        parts = []
        for p in c:
            if p.get("type") == "text":
                parts.append(p.get("text", ""))
            elif p.get("type") == "image":
                parts.append(f"[image : {str(p.get('path', '')).replace(chr(92), '/').rsplit('/', 1)[-1]}]")
        return "\n".join(parts)
    return str(c or "")


def build_case(zeus: "Zeus", sid: str, message_id: int | None = None) -> dict:
    """Rassemble le contexte d'une réponse de ZEUS (la dernière si message_id est vide)."""
    msgs = zeus.db.get_messages(sid, include_archived=True)
    answers = [m for m in msgs if m["role"] == "assistant" and not m.get("tool_calls")]
    if message_id:
        target = next((m for m in answers if m["id"] == int(message_id)), None)
    else:
        target = answers[-1] if answers else None
    if not target:
        raise KeyError("réponse de ZEUS introuvable dans cette conversation")
    idx = next(i for i, m in enumerate(msgs) if m["id"] == target["id"])
    question, tools = "", []
    for m in reversed(msgs[:idx]):
        if m["role"] == "user" and not (m.get("meta") or {}).get("auto"):
            question = _text(m)
            break
        if m["role"] == "assistant" and m.get("tool_calls"):
            for tc in m["tool_calls"]:
                tools.insert(0, {"name": tc.get("name"), "args": truncate(scrub(json.dumps(tc.get("arguments"),
                                                                                         ensure_ascii=False)), 300)})
    session = zeus.db.get_session(sid) or {}
    meta = target.get("meta") or {}
    return {"question": truncate(scrub(question), 4000), "answer": truncate(scrub(_text(target)), 6000),
            "tools": tools, "model": meta.get("model") or "", "message_id": target["id"],
            "role": ((session.get("meta") or {}).get("mode") or {}).get("id", "assistant"),
            "channel": session.get("channel", ""), "version": __version__}


def record(zeus: "Zeus", sid: str, message_id: int | None = None, kind: str = "autre", comment: str = "",
           expected: str = "") -> dict:
    case = build_case(zeus, sid, message_id)
    kind = kind if kind in KINDS else "autre"
    case.update(kind=kind, kind_label=KINDS[kind], comment=truncate(scrub(comment), 2000),
                expected=truncate(scrub(expected), 4000), session_id=sid, ts=time.time())
    fid = zeus.db.x("INSERT INTO feedback(ts,session_id,message_id,kind,comment,expected,status,model,role,case_json) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (case["ts"], sid, case["message_id"], kind, case["comment"], case["expected"], "nouveau",
                     case["model"], case["role"], json.dumps(case, ensure_ascii=False)))
    if not isinstance(fid, int) or fid <= 0:
        row = zeus.db.one("SELECT MAX(id) id FROM feedback") or {}
        fid = int(row.get("id") or 0)
    case["id"] = fid
    folder = zeus.config.dir("cas")
    day = time.strftime("%Y%m%d", time.localtime(case["ts"]))
    path = folder / f"{day}-{fid}.json"
    path.write_text(json.dumps(case, ensure_ascii=False, indent=2), encoding="utf-8")
    zeus.db.x("UPDATE feedback SET path=? WHERE id=?", (str(path), fid))
    zeus.bus.publish("feedback_added", id=fid)
    try:
        from . import lessons
        lessons.on_feedback(zeus, case)
    except Exception:  # noqa: BLE001 — la leçon est un bonus : le cas reste enregistré
        pass
    return {**case, "path": str(path)}


def list_cases(zeus: "Zeus", status: str = "", limit: int = 100) -> list[dict]:
    if status:
        rows = zeus.db.q("SELECT * FROM feedback WHERE status=? ORDER BY id DESC LIMIT ?", (status, limit))
    else:
        rows = zeus.db.q("SELECT * FROM feedback ORDER BY id DESC LIMIT ?", (limit,))
    for r in rows:
        try:
            r["case"] = json.loads(r.pop("case_json") or "{}")
        except ValueError:
            r["case"] = {}
    return rows


def set_status(zeus: "Zeus", fid: int, status: str) -> bool:
    if status not in STATUSES:
        raise ValueError(f"statut inconnu : {status} ({', '.join(STATUSES)})")
    if not zeus.db.one("SELECT id FROM feedback WHERE id=?", (int(fid),)):
        return False
    zeus.db.x("UPDATE feedback SET status=? WHERE id=?", (status, int(fid)))
    return True


__all__ = ["record", "build_case", "list_cases", "set_status", "scrub", "KINDS", "STATUSES"]
