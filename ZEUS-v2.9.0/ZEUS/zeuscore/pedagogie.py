"""Banc d'essai du professeur de langue : python zeus.py pedagogie

Des phrases d'élève dont on connaît les erreurs à l'avance sont envoyées au vrai professeur de ZEUS (rôle
prof_langue, avec ton ordre de modèles habituel). On compare ce qu'il corrige à ce qu'il fallait corriger :
- erreurs trouvées (et bien corrigées) sur le total des erreurs connues ;
- fausses corrections : ce qu'il « corrige » alors que c'était juste, surtout sur les phrases pièges sans faute ;
- forme de la réponse : section ✏️ Corrections présente seulement s'il y a des corrections, réponse dans la langue
  enseignée, question de relance.

Tout se passe dans un ZEUS temporaire : tes cartes mémoire, ton journal d'erreurs et tes conversations ne sont pas
touchés. Résultat : data/logs/pedagogie-AAAAMMJJ-HHMM.json.
"""

from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from . import modes
from .costs import model_prices
from .tools.learning import lesson_speech
from .util import estimate_tokens

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus


def E(wrong: str, *right: str, cat: str = "", case: bool = False) -> dict:
    """Erreur attendue : le passage fautif (tel qu'écrit) et les corrections acceptées (une suffit)."""
    return {"wrong": wrong, "right": list(right), "cat": cat, "case": case}


# Chaque cas : langue enseignée, niveau, langue maternelle de l'élève, message, erreurs attendues.
# errors = [] → phrase PIÈGE, correcte : aucune correction attendue. native_msg → l'élève écrit dans sa langue.
CASES: list[dict[str, Any]] = [
    # ------------------------------------------------------------------ anglais (élève francophone)
    {"id": "en-perfect-since", "lang": "en", "level": "B1", "text": "I am living in Kinshasa since 2019.",
     "errors": [E("am living", "have been living", "have lived", "'ve been living", "'ve lived",
                  cat="en.present_perfect")]},
    {"id": "en-3e-personne", "lang": "en", "level": "A2",
     "text": "She don't like football but she play basketball every week.",
     "errors": [E("don't", "doesn't", "does not", cat="en.auxiliaire"), E("play", "plays", cat="en.3e_personne")]},
    {"id": "en-agree-depend", "lang": "en", "level": "B1", "text": "I'm agree with you, it depends of the weather.",
     "errors": [E("I'm agree", "I agree", cat="en.calque"), E("depends of", "depends on", cat="en.preposition")]},
    {"id": "en-preterit", "lang": "en", "level": "B1", "text": "Yesterday I have seen a very good film.",
     "errors": [E("have seen", "saw", cat="en.preterit")]},
    {"id": "en-faux-ami", "lang": "en", "level": "B1", "text": "Last week I assisted to a conference about robotics.",
     "errors": [E("assisted to", "attended", cat="en.faux_ami")]},
    {"id": "en-piege-phrasal", "lang": "en", "level": "B2",
     "text": "I've been meaning to call you, but I kept putting it off.", "errors": []},
    {"id": "en-piege-conditionnel", "lang": "en", "level": "B1",
     "text": "If I had more time, I would learn to play the guitar.", "errors": []},
    {"id": "en-piege-ponctuation", "lang": "en", "level": "A2",
     "text": "yesterday we watched a movie at home and it was great", "errors": []},
    {"id": "en-langue-maternelle", "lang": "en", "level": "B1", "text": "Comment on dit « j'ai hâte » en anglais ?",
     "errors": [], "native_msg": True},
    # ------------------------------------------------------------------ espagnol (élève francophone)
    {"id": "es-ser-estar", "lang": "es", "level": "B1", "text": "Hoy soy muy cansado porque trabajé mucho.",
     "errors": [E("soy", "estoy", cat="es.ser_estar")]},
    {"id": "es-gustar", "lang": "es", "level": "B1", "text": "Me gusta mucho los deportes de equipo.",
     "errors": [E("gusta", "gustan", cat="es.gustar")]},
    {"id": "es-subjonctif", "lang": "es", "level": "B1", "text": "Quiero que vienes a mi fiesta el sábado.",
     "errors": [E("vienes", "vengas", cat="es.subjuntivo")]},
    {"id": "es-preterito", "lang": "es", "level": "A2", "text": "Ayer voy al mercado con mi madre.",
     "errors": [E("voy", "fui", cat="es.preterito")]},
    {"id": "es-por-para", "lang": "es", "level": "B1", "text": "Estudio español por trabajar en Madrid el año próximo.",
     "errors": [E("por trabajar", "para trabajar", cat="es.por_para")]},
    {"id": "es-piege-constipado", "lang": "es", "level": "B1", "text": "Estoy constipado, tengo la nariz tapada.",
     "errors": []},
    {"id": "es-piege-cuando", "lang": "es", "level": "B1", "text": "Cuando tenga tiempo, te llamaré.", "errors": []},
    {"id": "es-langue-maternelle", "lang": "es", "level": "A2",
     "text": "Je ne sais pas comment dire « je suis fatigué » en espagnol.", "errors": [], "native_msg": True},
    # ------------------------------------------------------------------ allemand (élève francophone)
    {"id": "de-weil", "lang": "de", "level": "B1",
     "text": "Ich fahre nach Berlin, weil ich will die Stadt sehen.",
     "errors": [E("ich will die Stadt sehen", "die Stadt sehen will", cat="de.ordre_subordonnee")]},
    {"id": "de-inversion", "lang": "de", "level": "A2", "text": "Gestern ich habe ein Buch gelesen.",
     "errors": [E("Gestern ich habe", "Gestern habe ich", cat="de.verbe_2e_position")]},
    {"id": "de-datif", "lang": "de", "level": "A2", "text": "Ich bin mit der Bus gefahren.",
     "errors": [E("der Bus", "dem Bus", cat="de.cas.datif")]},
    {"id": "de-sein", "lang": "de", "level": "B1", "text": "Ich habe nach Hause gegangen.",
     "errors": [E("habe", "bin", cat="de.perfekt_sein")]},
    {"id": "de-majuscule", "lang": "de", "level": "A2", "text": "Ich trinke am Morgen gern kaffee.",
     "errors": [E("kaffee", "Kaffee", cat="de.majuscule", case=True)]},
    {"id": "de-piege-weil", "lang": "de", "level": "B1",
     "text": "Ich freue mich auf das Wochenende, weil wir ans Meer fahren.", "errors": []},
    {"id": "de-piege-bekommen", "lang": "de", "level": "B2",
     "text": "Ich habe das Geschenk bekommen, das du mir geschickt hast.", "errors": []},
    {"id": "de-langue-maternelle", "lang": "de", "level": "A2", "text": "Comment on dit « bon appétit » en allemand ?",
     "errors": [], "native_msg": True},
    # ------------------------------------------------------------------ français (élève anglophone)
    {"id": "fr-accord-etre", "lang": "fr", "native": "en", "level": "A2", "text": "Elle est allé au marché hier.",
     "errors": [E("allé", "allée", cat="fr.accord_participe")]},
    {"id": "fr-subjonctif", "lang": "fr", "native": "en", "level": "B1", "text": "Il faut que tu viens demain.",
     "errors": [E("viens", "viennes", cat="fr.subjonctif")]},
    {"id": "fr-preposition-pays", "lang": "fr", "native": "en", "level": "B1",
     "text": "J'habite en Canada depuis trois ans.", "errors": [E("en Canada", "au Canada", cat="fr.preposition")]},
    {"id": "fr-piege-imparfait", "lang": "fr", "native": "en", "level": "B1",
     "text": "Hier, il pleuvait quand je suis sorti.", "errors": []},
    {"id": "fr-piege-passe-compose", "lang": "fr", "native": "en", "level": "A2",
     "text": "Je suis allé à la plage avec mes amis et nous avons nagé.", "errors": []},
    {"id": "fr-langue-maternelle", "lang": "fr", "native": "en", "level": "A2",
     "text": "How do you say 'I can't wait' in French?", "errors": [], "native_msg": True},
]


# --------------------------------------------------------------------------- comparaison
def _clean(s: str, case: bool = False) -> str:
    s = (s or "").replace("’", "'")
    s = re.sub(r"[«»\"“”.,!?¡¿;:()\[\]]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s if case else s.lower()


def matches(expected: dict, correction: dict) -> bool:
    """La correction proposée vise-t-elle ce passage fautif, et le corrige-t-elle comme attendu ?"""
    case = bool(expected.get("case"))
    err = f" {_clean(correction.get('error', ''), case)} "
    if f" {_clean(expected['wrong'], case)} " not in err:
        return False
    fixed = _clean(correction.get("correction", ""), case)
    return any(_clean(r, case) in fixed for r in expected["right"])


def score_case(case: dict, kept: list[dict]) -> dict:
    """Erreurs trouvées et fausses corrections, pour une liste de corrections (après ou avant le correcteur)."""
    found = [e["wrong"] for e in case["errors"] if any(matches(e, c) for c in kept)]
    false = [c for c in kept if not any(matches(e, c) for e in case["errors"])]
    return {"expected": len(case["errors"]), "found": found, "false": false}


_KEPT_LINE = re.compile(r"^- « (.+?) » → « (.+?) »", re.M)


def parse_kept(tool_result: str) -> list[dict]:
    """Les corrections gardées, lues dans le retour de corrections_log (après la seconde lecture)."""
    return [{"error": a, "correction": b} for a, b in _KEPT_LINE.findall(tool_result or "")]


# --------------------------------------------------------------------------- exécution
def _session(zeus: "Zeus", case: dict) -> str:
    mode = modes.normalize({"id": "prof_langue", "lang": case["lang"], "level": case.get("level", ""),
                            "native": case.get("native", "fr")})
    return zeus.db.create_session("web", "pedagogie-" + case["id"], "owner", title="🧪 " + case["id"],
                                  meta={"mode": mode, "toolsets": ["learning"]})


def run_case(zeus: "Zeus", case: dict, timeout: float = 300) -> dict:
    sid = _session(zeus, case)
    res: dict[str, Any] = {}
    t0 = time.perf_counter()
    th = threading.Thread(target=lambda: res.update(r=zeus.chat(sid, case["text"])), daemon=True)
    th.start()
    th.join(timeout)
    if th.is_alive():
        zeus.stop_run(sid)
        th.join(10)
    seconds = round(time.perf_counter() - t0, 1)
    try:
        msgs = zeus.db.get_messages(sid) or []
    finally:
        try:
            zeus.db.delete_session(sid)
        except Exception:  # noqa: BLE001
            pass
    proposed: list[dict] = []
    kept: list[dict] = []
    called = False
    model = ""
    for m in msgs:
        if m.get("role") == "assistant":
            model = (m.get("meta") or {}).get("model") or model
            for tc in m.get("tool_calls") or []:
                if tc.get("name") == "corrections_log":
                    called = True
                    args = tc.get("arguments") or {}
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except ValueError:
                            args = {}
                    proposed = [c for c in args.get("corrections") or [] if isinstance(c, dict)]
        elif m.get("role") == "tool" and m.get("name") == "corrections_log":
            kept = parse_kept(str(m.get("content") or ""))
    r = res.get("r")
    reply = (r.text if r else "") or ""
    speech = lesson_speech(reply)
    final = score_case(case, kept)
    raw = score_case(case, proposed)
    out = {
        "id": case["id"], "lang": case["lang"], "level": case.get("level"), "text": case["text"],
        "ok": bool(r and r.ok), "seconds": seconds, "model": model, "tool_called": called,
        "expected": final["expected"], "found": final["found"],
        "false_corrections": final["false"], "kept": kept,
        "proposed_found": raw["found"], "proposed_false": raw["false"],
        "section_ok": ("✏️" in reply) == bool(kept),
        "question": "?" in speech,
        "reply": reply[:600],
    }
    if not case.get("native_msg"):
        out["reply_lang"] = modes.detect_lang(speech, "")
        out["lang_ok"] = out["reply_lang"] == case["lang"]
    return out


def estimate(zeus: "Zeus", cases: list[dict]) -> tuple[int, float]:
    """Taille réelle d'une requête du professeur, et coût maximal estimé (modèle principal, sans le cache)."""
    sid = _session(zeus, cases[0])
    try:
        from .bench import zeus_context
        msgs, tools = zeus_context(zeus, sid, cases[0]["text"])
    finally:
        zeus.db.delete_session(sid)
    ctx = estimate_tokens(json.dumps(msgs, ensure_ascii=False) + json.dumps(tools, ensure_ascii=False))
    primary = zeus.router.primary()
    p = model_prices(primary.cfg) if primary else None
    cost = 0.0
    if p:  # par cas : 2 appels du professeur (outil, puis réponse) + la seconde lecture
        cost = len(cases) * (2 * ctx * 1.25 * p[0] + 1500 * p[0] + 1000 * p[1]) / 1e6
    return ctx, round(cost, 2)


def _pct(a: int, b: int) -> str:
    return f"{a}/{b} ({round(100 * a / b)} %)" if b else "—"


def summarize(results: list[dict]) -> dict:
    errs = [r for r in results if r["expected"]]
    traps = [r for r in results if not r["expected"]]
    exp = sum(r["expected"] for r in results)
    found = sum(len(r["found"]) for r in results)
    raw_found = sum(len(r["proposed_found"]) for r in results)
    false = sum(len(r["false_corrections"]) for r in results)
    raw_false = sum(len(r["proposed_false"]) for r in results)
    lang = [r for r in results if "lang_ok" in r]
    by_lang: dict[str, dict[str, int]] = {}
    for r in results:
        d = by_lang.setdefault(r["lang"], {"expected": 0, "found": 0, "false": 0})
        d["expected"] += r["expected"]
        d["found"] += len(r["found"])
        d["false"] += len(r["false_corrections"])
    return {
        "cases": len(results), "failed_runs": sum(not r["ok"] for r in results),
        "errors_expected": exp, "errors_found": found, "errors_found_before_check": raw_found,
        "false_corrections": false, "false_corrections_before_check": raw_false,
        "traps": len(traps), "traps_clean": sum(not r["false_corrections"] for r in traps),
        "error_cases_perfect": sum(len(r["found"]) == r["expected"] and not r["false_corrections"] for r in errs),
        "error_cases": len(errs),
        "section_ok": sum(r["section_ok"] for r in results), "question": sum(r["question"] for r in results),
        "lang_ok": sum(r["lang_ok"] for r in lang), "lang_checked": len(lang),
        "by_lang": by_lang, "models": sorted({r["model"] for r in results if r["model"]}),
    }


def online_blocked_until(zeus: "Zeus", min_wait: float = 300) -> float | None:
    """Heure de fin si TOUS les modèles en ligne sont en pause pour plus de min_wait secondes (limite du jour)."""
    online = [h for h in zeus.router.handles if not h.is_local]
    now = time.time()
    if online and all(h.cooldown_until - now > min_wait for h in online):
        return min(h.cooldown_until for h in online)
    return None


def run_eval(zeus: "Zeus", cases: list[dict] | None = None, confirm: Callable[[str], bool] | None = None,
             say: Callable[[str], None] = print) -> dict:
    cases = cases if cases is not None else CASES
    report: dict[str, Any] = {"date": time.strftime("%Y-%m-%d %H:%M"), "results": []}
    if not cases:
        say("Aucun cas à essayer.")
        return report
    ctx, cost = estimate(zeus, cases)
    report["context_tokens_estimate"], report["cost_estimate_max"] = ctx, cost
    say(f"{len(cases)} phrases d'élève, requête du professeur ≈ {ctx} jetons.")
    if cost > 0 and confirm is not None and not confirm(
            f"Coût maximal estimé avec le modèle principal (sans le cache, qui le réduit) : ≈ {cost:.2f} $. Continuer ?"):
        say("Essai annulé : rien n'a été dépensé.")
        report["cancelled"] = True
        return report
    for i, case in enumerate(cases, 1):
        r = run_case(zeus, case)
        report["results"].append(r)
        mark = "✅" if (len(r["found"]) == r["expected"] and not r["false_corrections"] and r["ok"]) else "❌"
        what = (f"{len(r['found'])}/{r['expected']} erreur(s) trouvée(s)" if r["expected"] else "phrase piège")
        extra = []
        missed = [e["wrong"] for e in case["errors"] if e["wrong"] not in r["found"]]
        if missed:
            extra.append("manquée(s) : " + ", ".join(f"« {m} »" for m in missed))
        if r["false_corrections"]:
            extra.append("fausse(s) correction(s) : " + ", ".join(
                f"« {c['error']} » → « {c['correction']} »" for c in r["false_corrections"]))
        if not r["ok"]:
            extra.append("pas de réponse : " + r["reply"][:100])
        if not r["section_ok"]:
            extra.append("corrige dans le texte sans passer par l'outil (rien n'entre au journal d'erreurs)"
                         if not r["tool_called"] else "section ✏️ incohérente avec les corrections vérifiées")
        if r.get("lang_ok") is False:
            extra.append(f"réponse en {r.get('reply_lang') or '?'}")
        say(f"  {mark} {i:>2}. [{case['lang']} {case.get('level', '')}] {case['id']} : {what}, {r['seconds']} s"
            + (f" — {' ; '.join(extra)}" if extra else ""))
        blocked = online_blocked_until(zeus)
        if blocked and i < len(cases):
            report["stopped"] = f"limite atteinte jusqu'à {time.strftime('%H:%M', time.localtime(blocked))}"
            say(f"\n  ⏸️  Tous les modèles en ligne sont à leur limite jusqu'à {time.strftime('%H:%M', time.localtime(blocked))} "
                f"(souvent la limite du jour de Groq gratuit). J'arrête ici plutôt que d'attendre le modèle local, "
                f"bien trop lent sur ce PC. Bilan sur les {i} phrases faites ; relance plus tard ou ajoute une clé Claude.")
            break
    s = summarize(report["results"])
    report["summary"] = s
    say("\nBilan")
    say(f"  erreurs trouvées et bien corrigées : {_pct(s['errors_found'], s['errors_expected'])}"
        f"   (avant le correcteur : {s['errors_found_before_check']})")
    say(f"  fausses corrections : {s['false_corrections']}   (avant le correcteur : "
        f"{s['false_corrections_before_check']})")
    say(f"  phrases pièges laissées tranquilles : {_pct(s['traps_clean'], s['traps'])}")
    say(f"  phrases fautives parfaitement traitées : {_pct(s['error_cases_perfect'], s['error_cases'])}")
    say(f"  section ✏️ cohérente : {_pct(s['section_ok'], s['cases'])} ; question de relance : "
        f"{_pct(s['question'], s['cases'])} ; réponse dans la langue enseignée : {_pct(s['lang_ok'], s['lang_checked'])}")
    for lang, d in s["by_lang"].items():
        say(f"  {modes.lang_name(lang)} : {d['found']}/{d['expected']} erreurs, {d['false']} fausse(s) correction(s)")
    if s["models"]:
        say(f"  modèle(s) qui ont répondu : {', '.join(s['models'])}")
    return report


def save_report(logs_dir: Path, report: dict) -> Path:
    logs_dir.mkdir(parents=True, exist_ok=True)
    p = logs_dir / f"pedagogie-{time.strftime('%Y%m%d-%H%M')}.json"
    p.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return p
