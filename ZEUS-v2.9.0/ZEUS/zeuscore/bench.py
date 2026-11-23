"""Mesure de vitesse réelle des cerveaux de ZEUS : python zeus.py mesure

Pour chaque modèle en ligne (et les modèles locaux avec --local), trois mesures :
1. Réseau : temps pour ouvrir une connexion sécurisée vers le fournisseur (DNS + TCP + TLS), sans clé ni coût.
2. Question courte (« Réponds seulement : OK ») : la latence minimale du service.
3. Vraie requête ZEUS (consignes complètes + outils + une question) : ce que tu attends vraiment. La 1re fois
   est « à froid » ; les suivantes profitent du cache (Claude, Ollama) : « à chaud ».
Puis un essai de bout en bout dans ZEUS (avec ton ordre de bascule habituel), comme depuis l'interface.

Chiffres : délai avant le premier mot affiché, durée totale, jetons produits par seconde. Résultat enregistré dans
data/logs/mesure-AAAAMMJJ-HHMM.json.
"""

from __future__ import annotations

import json
import socket
import ssl
import statistics
import threading
import time
import urllib.parse
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from .costs import estimate_cost, model_prices, usage_tokens
from .llm import LLMError, LLMRouter, ModelHandle
from .util import estimate_tokens

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

QUESTION = "Présente-toi en deux phrases : qui es-tu et que peux-tu faire pour moi ?"
SHORT = [{"role": "system", "content": "Tu es un test de connexion."},
         {"role": "user", "content": "Réponds seulement : OK"}]


def network_probe(base_url: str, tries: int = 3, timeout: float = 10) -> dict:
    """Temps d'ouverture d'une connexion HTTPS (DNS + TCP + TLS) vers le fournisseur. Sans clé, sans coût."""
    u = urllib.parse.urlparse(base_url)
    host, port = u.hostname or "", u.port or (443 if u.scheme == "https" else 80)
    out: list[float] = []
    err = ""
    for _ in range(tries):
        t0 = time.perf_counter()
        try:
            with socket.create_connection((host, port), timeout=timeout) as sock:
                if u.scheme == "https":
                    with ssl.create_default_context().wrap_socket(sock, server_hostname=host):
                        pass
            out.append(time.perf_counter() - t0)
        except OSError as e:
            err = f"{type(e).__name__} : {e}"
    return {"host": host, "ok": bool(out), "seconds": [round(x, 3) for x in out],
            "median": round(statistics.median(out), 3) if out else None, "error": err}


def timed_call(handle: ModelHandle, messages: list[dict], tools: list[dict] | None, max_tokens: int,
               tracker: Any = None) -> dict:
    """Un appel à CE modèle seulement (pas de bascule), chronométré."""
    router = LLMRouter(handles=[handle])
    router.tracker = tracker
    first: list[float] = []
    chars = [0]

    def cb(delta: str | None) -> None:
        if delta:
            if not first:
                first.append(time.perf_counter())
            chars[0] += len(delta)

    t0 = time.perf_counter()
    try:
        r = router.chat(messages, tools, stream_cb=cb, max_tokens=max_tokens, temperature=0.2)
    except LLMError as e:
        return {"ok": False, "error": str(e)[:300], "total": round(time.perf_counter() - t0, 2)}
    total = time.perf_counter() - t0
    tok = usage_tokens(r.usage)
    out_tokens, estimated = tok["out"], False
    if not out_tokens:  # certains serveurs ne renvoient pas les compteurs en flux : estimation (≈ 1 jeton / 4 car.)
        out_tokens, estimated = max(1, (chars[0] or len(r.text)) // 4), True
    ttft = (first[0] - t0) if first else None
    gen = total - ttft if ttft is not None else total
    return {"ok": True, "ttft": round(ttft, 2) if ttft is not None else None, "total": round(total, 2),
            "out_tokens": out_tokens, "tokens_estimated": estimated,
            "tok_s": round(out_tokens / gen, 1) if gen > 0.05 else None,
            "in_tokens": tok["in"], "cache_read": tok["cache_read"], "cache_write": tok["cache_write"],
            "tool_calls": [c.name for c in r.tool_calls], "reply": r.text[:120],
            "cost": round(r.cost, 5) if r.cost else (round(estimate_cost(handle.cfg, r.usage) or 0, 5) or None)}


def zeus_context(zeus: "Zeus", sid: str, question: str = QUESTION) -> tuple[list[dict], list[dict]]:
    """Les vrais messages et outils qu'envoie l'agent de ZEUS pour une question de l'utilisateur."""
    from .agent import Run
    agent = zeus.agent
    session = zeus.db.get_session(sid) or {}
    run = Run(sid, "owner", query=question)
    run.toolsets = agent._initial_toolsets("owner", session, question, None)
    tools = zeus.registry.schemas(agent._tool_names(run, "owner", "owner"))
    zeus.db.add_message(sid, {"role": "user", "content": question})
    msgs = agent._context(sid, "owner", run, tools, "", "")
    return msgs, tools


def end_to_end(zeus: "Zeus", question: str = QUESTION, timeout: float = 900) -> dict:
    """Un vrai message dans ZEUS, avec ton ordre de bascule : délai avant le premier mot, durée, modèle utilisé."""
    sid = zeus.db.create_session("web", "mesure-" + str(int(time.time())), "owner", title="🧪 Mesure de vitesse")
    q = zeus.bus.subscribe()
    t0 = time.perf_counter()
    res: dict[str, Any] = {}
    th = threading.Thread(target=lambda: res.update(r=zeus.chat(sid, question)), daemon=True)
    th.start()
    first = None
    notices: list[str] = []
    try:
        while th.is_alive() or not q.empty():
            try:
                ev = q.get(timeout=0.2)
            except Exception:  # noqa: BLE001 — file vide
                if time.perf_counter() - t0 > timeout:
                    zeus.stop_run(sid)
                    break
                continue
            if ev.get("session_id") != sid:
                continue
            if ev["type"] == "assistant_delta" and first is None and not ev.get("depth"):
                first = time.perf_counter() - t0
            elif ev["type"] == "model_notice":
                notices.append(ev.get("text", ""))
        total = time.perf_counter() - t0
        msgs = zeus.db.get_messages(sid)
        last = msgs[-1] if msgs else {}
        r = res.get("r")
        return {"ok": bool(r and r.ok), "ttft": round(first, 2) if first is not None else None,
                "total": round(total, 2), "model": (last.get("meta") or {}).get("model"),
                "reply": (r.text if r else "")[:160], "notices": notices}
    finally:
        zeus.bus.unsubscribe(q)
        try:
            zeus.db.delete_session(sid)
        except Exception:  # noqa: BLE001
            pass


def _fmt(x: Any, unit: str = " s") -> str:
    return "—" if x is None else f"{x}{unit}"


def _med(rows: list[dict], key: str) -> Any:
    vals = [r[key] for r in rows if r.get("ok") and r.get(key) is not None]
    return round(statistics.median(vals), 2) if vals else None


def run_benchmark(zeus: "Zeus", models: list[str] | None = None, reps: int = 3, include_local: bool = False,
                  confirm: Callable[[str], bool] | None = None, e2e: bool = True,
                  say: Callable[[str], None] = print) -> dict:
    handles = [h for h in zeus.router.handles if (not models or h.id in models)]
    skipped = [h.id for h in handles if h.is_local and not include_local]
    handles = [h for h in handles if include_local or not h.is_local]
    report: dict[str, Any] = {"date": time.strftime("%Y-%m-%d %H:%M"), "reps": reps, "models": {},
                              "skipped_local": skipped}
    if not handles:
        say("Aucun modèle à mesurer." + (f" (Modèles locaux ignorés : {', '.join(skipped)} — ajoute --local.)"
                                          if skipped else ""))
        return report

    sid = zeus.db.create_session("web", "mesure-ctx", "owner", title="🧪 Mesure de vitesse")
    try:
        msgs, tools = zeus_context(zeus, sid)
    finally:
        zeus.db.delete_session(sid)
    ctx_tokens = estimate_tokens(json.dumps(msgs, ensure_ascii=False) + json.dumps(tools, ensure_ascii=False))
    report["context_tokens_estimate"] = ctx_tokens
    say(f"Requête ZEUS réelle : ≈ {ctx_tokens} jetons (consignes + {len(tools)} outils + la question).")

    # coût prévisible avant de dépenser quoi que ce soit
    cost = 0.0
    for h in handles:
        p = model_prices(h.cfg)
        if p and (p[0] or p[1]):
            calls_ctx = reps
            cost += (calls_ctx * ctx_tokens * p[0] * 1.25 + reps * 30 * p[0] + reps * (300 + 10) * p[1]) / 1e6
    if e2e:
        p = model_prices(zeus.router.primary().cfg) if zeus.router.primary() else None
        if p:
            cost += 2 * (ctx_tokens * p[0] * 1.25 + 300 * p[1]) / 1e6
    report["cost_estimate_max"] = round(cost, 3)
    if cost > 0 and confirm is not None:
        if not confirm(f"Coût maximal estimé (modèles payants, sans compter le cache qui le réduit) : ≈ {cost:.2f} $. "
                       "Continuer ?"):
            say("Mesure annulée : rien n'a été dépensé.")
            report["cancelled"] = True
            return report

    for h in handles:
        say(f"\n▶ {h.label}")
        entry: dict[str, Any] = {"provider": h.cfg.get("provider"), "model": h.cfg.get("model"),
                                 "local": h.is_local}
        if not h.is_local and str(h.cfg.get("base_url") or "").startswith("http"):
            entry["network"] = network_probe(h.cfg["base_url"])
            n = entry["network"]
            kind = "connexion sécurisée" if h.cfg["base_url"].startswith("https") else "connexion"
            say(f"  réseau vers {n['host']} : " + (f"{n['median']} s ({kind})" if n["ok"] else f"ÉCHEC {n['error']}"))
        short = [timed_call(h, SHORT, None, 20, zeus.costs) for _ in range(reps)]
        entry["short"] = short
        ok_short = [r for r in short if r["ok"]]
        say(f"  question courte : premier mot {_fmt(_med(short, 'ttft'))}, total {_fmt(_med(short, 'total'))}"
            + (f"  ({len(short) - len(ok_short)} échec(s) : {next(r['error'] for r in short if not r['ok'])})"
               if len(ok_short) < len(short) else ""))
        if not ok_short:
            report["models"][h.id] = entry
            continue
        full = [timed_call(h, msgs, tools or None, 300, zeus.costs) for _ in range(reps)]
        entry["zeus_request"] = full
        cold, warm = full[:1], full[1:]
        say(f"  vraie requête ZEUS à froid : premier mot {_fmt(_med(cold, 'ttft'))}, total {_fmt(_med(cold, 'total'))}")
        if warm:
            say(f"  vraie requête ZEUS à chaud : premier mot {_fmt(_med(warm, 'ttft'))}, total "
                f"{_fmt(_med(warm, 'total'))}, {_fmt(_med(full, 'tok_s'), ' jetons/s')}"
                + (" (jetons estimés)" if any(r.get("tokens_estimated") for r in full if r["ok"]) else ""))
        bad = [r for r in full if not r["ok"]]
        if bad:
            say(f"  {len(bad)} échec(s) : {bad[0]['error']}")
        spent = sum(r.get("cost") or 0 for r in short + full)
        if spent:
            say(f"  dépensé : {spent:.4f} $")
            entry["spent"] = round(spent, 5)
        report["models"][h.id] = entry

    if e2e and zeus.router.available():
        say("\n▶ De bout en bout dans ZEUS (ton ordre de bascule habituel), 2 messages :")
        report["end_to_end"] = []
        for i in range(2):
            r = end_to_end(zeus)
            report["end_to_end"].append(r)
            say(f"  message {i + 1} : premier mot {_fmt(r['ttft'])}, total {_fmt(r['total'])}, modèle "
                f"{r.get('model') or '?'}" + ("" if r["ok"] else f" — ÉCHEC : {r['reply'][:120]}"))
            for n in r["notices"]:
                say(f"    annonce : {n}")
    if skipped:
        say(f"\nModèles locaux non mesurés (plusieurs minutes chacun) : {', '.join(skipped)}. "
            "Pour les inclure : python zeus.py mesure --local")
    return report


MINI_QUESTIONS = ("Bonjour ZEUS, comment vas-tu aujourd'hui ?",
                  "Donne-moi trois idées de dîner rapide avec du riz.",
                  "Explique en deux phrases ce qu'est la photosynthèse.")


def _lean_call(h: ModelHandle, msgs: list[dict]) -> dict:
    first: list[float] = []

    def cb(delta: str | None) -> None:
        if delta and not first:
            first.append(time.perf_counter())
    t0 = time.perf_counter()
    try:
        r = h.call(msgs, None, cb, None, 0.3, 200, lean=True)
    except LLMError as e:
        return {"ok": False, "error": str(e)[:300], "total": round(time.perf_counter() - t0, 2)}
    total = time.perf_counter() - t0
    ttft = (first[0] - t0) if first else None
    return {"ok": True, "ttft": round(ttft, 2) if ttft is not None else None, "total": round(total, 2),
            "in_tokens": usage_tokens(r.usage)["in"], "reply": r.text[:160]}


def run_minibrain_benchmark(zeus: "Zeus", say: Callable[[str], None] = print) -> dict:
    """Vitesse du mini-cerveau local : préchauffage, puis trois vraies questions (requête légère, sans outils)."""
    from . import minibrain
    report: dict[str, Any] = {"date": time.strftime("%Y-%m-%d %H:%M"), "kind": "mini-cerveau", "models": {}}
    locals_ = [h for h in zeus.router.handles if h.is_local]
    if not locals_:
        say("Aucun modèle local (Ollama) configuré : le mini-cerveau n'a rien à mesurer.")
        return report
    sid = zeus.db.create_session("web", "mesure-mini", "owner", title="🧪 Mesure du mini-cerveau")
    try:
        zeus.db.add_message(sid, {"role": "user", "content": MINI_QUESTIONS[0]})
        msgs, _ = minibrain.build(zeus, sid)
        report["request_tokens_estimate"] = minibrain.size(zeus, sid)
        say(f"Requête du mini-cerveau : ≈ {report['request_tokens_estimate']} jetons (au lieu de 4 000 à 6 000 pour "
            "la requête complète).")
        for h in locals_:
            say(f"\n▶ {h.label}")
            entry: dict[str, Any] = {"model": h.cfg.get("model")}
            t0 = time.perf_counter()
            h.warm_until = 0.0  # mesure honnête : on refait le préchauffage
            ok = h.warm(str(msgs[0]["content"]))
            entry["warm"] = round(time.perf_counter() - t0, 1) if ok else None
            say(f"  préchauffage (chargement + lecture des consignes) : "
                + (_fmt(entry["warm"]) if ok else "impossible (Ollama est-il lancé ? voir le journal)"))
            runs = []
            for q in MINI_QUESTIONS:
                zeus.db.add_message(sid, {"role": "user", "content": q})
                m2, _ = minibrain.build(zeus, sid)
                r = _lean_call(h, m2)
                runs.append(r)
                if r["ok"]:
                    zeus.db.add_message(sid, {"role": "assistant", "content": r["reply"]})
                say(f"  « {q[:40]}… » : premier mot {_fmt(r.get('ttft'))}, total {_fmt(r.get('total'))}"
                    + ("" if r["ok"] else f" — ÉCHEC : {r['error']}"))
            entry["runs"] = runs
            ok_runs = [r for r in runs if r["ok"]]
            if ok_runs:
                worst = max(r["total"] for r in ok_runs)
                say(f"  → réponse la plus longue : {_fmt(worst)} "
                    + ("✅ objectif atteint (moins d'une minute)" if worst < 60 else
                       "⚠️ au-dessus d'une minute : essaie un modèle plus petit (ollama pull llama3.2:3b)"))
            report["models"][h.id] = entry
    finally:
        zeus.db.delete_session(sid)
    return report


def save_report(zeus: "Zeus", report: dict) -> Path:
    d = zeus.config.dir("logs")
    p = d / f"mesure-{time.strftime('%Y%m%d-%H%M')}.json"
    p.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return p
