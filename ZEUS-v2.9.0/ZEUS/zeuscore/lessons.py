"""ZEUS apprend de chaque conversation.

1. Bilan de conversation : toutes les 3 questions du propriétaire, ZEUS relit en arrière-plan les derniers échanges et
   retient au plus 3 faits durables (préférences, projets, proches, décisions). Rien n'est retenu s'il n'y a rien
   d'utile ; jamais de secret.
2. Leçons des erreurs : chaque « ZEUS s'est trompé » avec la réponse attendue devient une leçon. Quand une question
   proche revient, la leçon est rappelée à ZEUS avant qu'il réponde. « Trop long » devient une préférence durable.
"""

from __future__ import annotations

import json
import re
import threading
from typing import TYPE_CHECKING

from .util import keywords, log, parse_json_loose, truncate

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

RECAP_EVERY = 3          # questions du propriétaire entre deux bilans
RECAP_CHARS = 6000       # taille maximale des échanges relus
SECRET = re.compile(r"\b(pin|mot de passe|password|code secret|cvv|iban|\d{4,}\s*#)", re.I)
_running: set[str] = set()
_lock = threading.Lock()


def _text(m: dict) -> str:
    c = m.get("content")
    if isinstance(c, list):
        c = " ".join(p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text")
    return re.sub(r"\s+", " ", str(c or "")).strip()


# --------------------------------------------------------------------------- 1. bilan de conversation
def maybe_recap(zeus: "Zeus", session_id: str, wait: bool = False) -> bool:
    """Lance le bilan si au moins RECAP_EVERY nouvelles questions depuis le dernier. Renvoie True s'il est lancé."""
    if zeus.config.get("agent.auto_learn", True) is False:
        return False
    session = zeus.db.get_session(session_id) or {}
    if session.get("trust", "owner") != "owner":
        return False
    meta = session.get("meta") or {}
    done = int(meta.get("learned_upto") or 0)
    msgs = [m for m in zeus.db.get_messages(session_id) if m["id"] > done]
    users = [m for m in msgs if m["role"] == "user" and not (m.get("meta") or {}).get("auto")]
    if len(users) < RECAP_EVERY:
        return False
    with _lock:
        if session_id in _running:
            return False
        _running.add(session_id)
    meta["learned_upto"] = msgs[-1]["id"]
    zeus.db.update_session(session_id, meta=meta)
    t = threading.Thread(target=_recap, args=(zeus, session_id, msgs), daemon=True, name="bilan-conversation")
    t.start()
    if wait:
        t.join(60)
    return True


def _recap(zeus: "Zeus", session_id: str, msgs: list[dict]) -> None:
    try:
        owner = zeus.config.owner_name or "le propriétaire"
        lines = []
        for m in msgs:
            if m["role"] == "user" and not (m.get("meta") or {}).get("auto"):
                lines.append(f"{owner} : {truncate(_text(m), 800)}")
            elif m["role"] == "assistant" and not m.get("tool_calls") and _text(m):
                lines.append(f"ZEUS : {truncate(_text(m), 500)}")
        talk = "\n".join(lines)[-RECAP_CHARS:]
        known = "\n".join(f"- {m['content']}" for m in zeus.db.core_memories(15)) or "- (rien)"
        prompt = (f"Voici les derniers échanges entre {owner} et son assistant ZEUS.\n\n{talk}\n\n"
                  f"Ce que ZEUS sait déjà de {owner} :\n{known}\n\n"
                  "Quels faits NOUVEAUX et DURABLES ZEUS doit-il retenir pour mieux aider à l'avenir ? Préférences, "
                  "projets, études, travail, proches, habitudes, décisions prises. 0 à 3 faits, courts, à la 3e personne. "
                  "Pas de fait déjà connu, rien de passager (la question du jour), jamais de mot de passe, code ni "
                  "donnée bancaire, ni santé, religion ou politique sauf demande explicite.\n"
                  'Réponds UNIQUEMENT en JSON : {"memories": [{"content": "…", "kind": "preference|profil|contact|fait", '
                  '"importance": 1-5}]}')
        r = zeus.router.chat([{"role": "system", "content": "Tu réponds uniquement en JSON valide."},
                              {"role": "user", "content": prompt}], None, purpose="fast", max_tokens=500,
                             temperature=0.1)
        data = parse_json_loose(r.text)
        for m in (data.get("memories") if isinstance(data, dict) else None) or []:
            c = str((m or {}).get("content") or "").strip()
            if not c or SECRET.search(c) or len(c) > 300:
                continue
            kind = str(m.get("kind") or "fait")[:20]
            mid, created = zeus.db.add_memory(c, kind if kind in ("preference", "profil", "contact", "fait") else "fait",
                                              "bilan", max(1, min(5, int(m.get("importance") or 3))), source="bilan")
            if created:
                zeus.bus.publish("memory_added", id=mid, content=c)
    except Exception as e:  # noqa: BLE001 — un bilan raté ne gêne rien
        log.debug("bilan de conversation ignoré : %s", e)
    finally:
        with _lock:
            _running.discard(session_id)


# --------------------------------------------------------------------------- 2. leçons des erreurs signalées
def on_feedback(zeus: "Zeus", case: dict) -> None:
    """Appelé quand une erreur est signalée : certaines remarques deviennent tout de suite des préférences."""
    if case.get("kind") == "long":
        zeus.db.add_memory("Préfère des réponses plus courtes et directes", "preference", "lecon", 4, source="lecon")
    elif case.get("kind") == "langue" and case.get("comment"):
        zeus.db.add_memory(f"Langue ou ton souhaité : {truncate(case['comment'], 200)}", "preference", "lecon", 4,
                           source="lecon")


def relevant(zeus: "Zeus", query: str, limit: int = 2) -> list[dict]:
    """Les erreurs signalées dont la question ressemble à la demande actuelle (et qui ont une réponse attendue)."""
    words = set(keywords(query or "", 16))
    if len(words) < 2:
        return []
    try:
        rows = zeus.db.q("SELECT id, kind, expected, comment, case_json FROM feedback WHERE status IN ('nouveau','test') "
                         "AND (expected != '' OR comment != '') ORDER BY id DESC LIMIT 200")
    except Exception:  # noqa: BLE001 — base ancienne sans table feedback
        return []
    scored = []
    for r in rows:
        try:
            case = json.loads(r.get("case_json") or "{}")
        except ValueError:
            continue
        common = words & set(keywords(case.get("question", ""), 16))
        if len(common) >= 2 and len(common) / max(3, len(words)) >= 0.34:
            scored.append((len(common), r["id"], case, r))
    scored.sort(key=lambda x: (-x[0], -x[1]))
    return [{"id": i, "question": c.get("question", ""), "answer": c.get("answer", ""), "kind": r["kind"],
             "expected": r.get("expected") or "", "comment": r.get("comment") or ""} for _, i, c, r in scored[:limit]]


def note(zeus: "Zeus", query: str) -> str:
    """Rappel à glisser dans le contexte du moment (prompts.volatile_note)."""
    items = relevant(zeus, query)
    if not items:
        return ""
    lines = ["Leçons de tes erreurs passées (corrigées par le propriétaire) — ne les refais pas :"]
    for it in items:
        want = it["expected"] or it["comment"]
        lines.append(f"- Question proche : « {truncate(it['question'], 160)} » ; tu avais répondu « "
                     f"{truncate(it['answer'], 160)} » ; il attendait : {truncate(want, 300)}")
    return "\n".join(lines)


__all__ = ["maybe_recap", "on_feedback", "relevant", "note"]
