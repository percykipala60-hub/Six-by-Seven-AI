"""Boucle agentique de ZEUS : objectif → outils → observation → décision → vérification.

Points forts :
- boîtes à outils chargées à la demande (moins de jetons, petits modèles plus précis) ;
- appels d'outils indépendants exécutés en parallèle ;
- validations humaines selon le risque ; usagers externes cantonnés au guichet ;
- contexte compressé automatiquement (résumé) quand la conversation grossit ;
- messages reçus pendant une tâche injectés en direct (pilotage en cours de route) ;
- sous-agents parallèles ; apprentissage automatique (souvenirs + compétences).
"""

from __future__ import annotations

import queue
import re
import threading
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from . import minibrain, modes, prompts, reflexes
from .llm import LLMError, content_text, has_images
from .tools import ToolContext, ToolResult
from .util import (estimate_tokens, guess_mime, human_size, is_audio, is_image, jdump, log, norm,
                   parse_json_loose, redact, truncate)

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

TOOLSET_HINTS: dict[str, list[str]] = {
    "phone": ["telephone", "phone", "portable", "android", "appelle", "appeler", "appel ", "sms", "texto",
              "whatsapp", "ecran du tel", "appli", "application", "notification", "contact", "batterie",
              "camera", "instagram", "facebook", "tiktok", "youtube", "mobile money", "m-pesa", "mpesa",
              "orange money", "airtel", "play store", "playstore", "installe", "galerie", "message a ",
              "ecris a ", "envoie a ", "reponds a ", "snapchat", "telegram sur", "mon tel", "alarme", "reveille-moi",
              "reveille moi", "minuteur", "agenda", "rendez-vous", "wifi", "wi-fi", "bluetooth", "luminosite",
              "volume", "ne pas deranger", "silencieux", "mode avion", "localisation", "lampe"],
    "computer": ["ordinateur", "mon pc", "le pc", "sur pc", "mac ", "windows", "bureau", "capture d'ecran",
                 "screenshot", "souris", "clavier", "presse-papier", "presse papier", "lance ", "logiciel",
                 "programme", "navigateur", "chrome", "explorateur"],
    "files": ["fichier", "document", "pdf", "word", "excel", "docx", "xlsx", "csv", "repertoire", "renomme",
              "deplace", "supprime", "copie", "telecharge", "image", "photo", "scan", "zip", "trie mes"],
    "dossiers": ["dossier", "piece", "usager", "demandeur", "procedure", "relance", "acte de naissance",
                 "passeport", "carte d'identite", "inscription", "administratif", "guichet", "valide le",
                 "rejette", "demarche"],
    "comms": ["mail", "e-mail", "email", "courriel", "telegram", "boite de reception", "inbox", "previens",
              "notifie", "envoie un message", "ecris un message"],
    "browser": ["formulaire", "remplis", "connecte-toi", "connecte toi", "inscris-moi", "reserve", "achete",
                "commande sur", "navigateur", "clique sur", "sur le site", "page web", "mon compte"],
    "tasks": ["rappelle", "rappel", "planifie", "tous les", "chaque jour", "chaque matin", "chaque semaine",
              "demain a", "dans 1", "dans 2", "dans 3", "dans 5", "dans 10", "dans 15", "dans 20", "dans 30",
              "programme", "tache", "oublie", "competence", "previens-moi si", "previens moi si",
              "previens-moi quand", "quand je recois", "si je recois", "des que je recois", "surveille",
              "si quelqu'un m'ecrit", "si maman", "si on m'appelle", "declencheur", "brief"],
    "learning": ["apprendre", "apprends-moi", "apprends moi", "reviser", "revision", "cours de", "lecon", "exercice",
                 "quiz", "flashcard", "carte memoire", "cartes memoire", "vocabulaire", "conjugaison", "grammaire",
                 "prof d", "professeur", "enseigne", "explique-moi", "examen", "interro", "learn ", "teach me",
                 "aprender", "lernen", "progression", "mon niveau"],
    "knowledge": ["mes documents", "mes docs", "mes cours", "mon cours", "mes notes", "mes fiches", "mes pdf",
                  "mes fichiers", "ma bibliotheque", "bibliotheque", "dans mes", "d'apres mon", "d'apres le cours",
                  "selon mon", "selon le document", "selon mes", "d'apres mes", "dans le document", "dans le cours",
                  "dans mon dossier", "indexe", "cherche dans", "retrouve dans", "mes contrats", "mes rapports",
                  "mes articles", "my documents", "my notes", "according to my"],
    "secretariat": ["agenda", "rendez-vous", "rdv", "reunion", "meeting", "carnet d'adresses", "fiche contact",
                    "todo", "to-do", "a faire", "liste de taches", "facture", "devis", "secretaire", "planning",
                    "compte rendu", "compte-rendu", "courrier", "relance", "convocation"],
}

PHONE_EXTRA = ["ask_human", "update_plan", "recall", "remember"]


def detect_toolsets(text: str, available: set[str]) -> set[str]:
    t = " " + norm(text) + " "
    out = set()
    for ts, hints in TOOLSET_HINTS.items():
        if ts in available and any(h in t for h in hints):
            out.add(ts)
    for ts in available:
        if ts.startswith("mcp:") and ts[4:].lower() in t:
            out.add(ts)
    return out


# Requête limitée en taille (Groq gratuit) : place gardée pour la réponse et marge d'estimation, puis place minimale
# pour la conversation ; outils de base gardés quand il faut alléger.
DIET_MARGIN = 1500
DIET_HISTORY = 900
LEAN_CORE = ["update_plan", "ask_human", "enable_tools", "remember", "recall", "notify_owner", "web_search", "fetch_url",
             "read_file", "write_file", "run_python"]


@dataclass
class RunResult:
    text: str
    ok: bool = True
    files: list[str] = field(default_factory=list)
    images: list[str] = field(default_factory=list)
    run: Any = None


class Run:
    def __init__(self, session_id: str, profile: str, parent: "Run | None" = None, query: str = ""):
        self.id = uuid.uuid4().hex[:10]
        self.session_id = session_id
        self.profile = profile
        self.parent = parent
        self.cancel: threading.Event = parent.cancel if parent else threading.Event()
        self.depth = (parent.depth + 1) if parent else 0
        self.plan: list[dict] = []
        self.steps = 0
        self.tool_calls = 0
        self.started = time.time()
        self.status = "running"
        self.inbox: queue.Queue = queue.Queue()
        self.toolsets: set[str] = set()
        self.files: list[str] = []
        self.images: list[str] = []
        self.usage = {"in": 0, "out": 0}
        self.trace: list[tuple[str, str, bool]] = []
        self.query = query
        self.initial_toolsets: set[str] = set()
        self.enabled_order: list[str] = []  # boîtes à outils chargées par le modèle pendant la tâche (enable_tools)
        self.lean_core = False  # outils de base allégés (requête limitée en taille, ex. Groq gratuit)
        self._note: str | None = None
        self.skills_used: set[str] = set()
        self.root_session = session_id
        self.purpose = parent.purpose if parent else "default"  # cerveau : default, max ou fast
        self.cost = 0.0
        self._system: tuple[Any, str] | None = None

    def info(self) -> dict:
        return {"id": self.id, "session_id": self.session_id, "profile": self.profile, "steps": self.steps,
                "tool_calls": self.tool_calls, "started": self.started, "status": self.status, "plan": self.plan,
                "toolsets": sorted(self.toolsets)}


class Agent:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus

    # ================================================================== API
    def run(self, session_id: str, text: str, attachments: list[str] | None = None, *,
            profile: str | None = None, parent: Run | None = None, max_steps: int | None = None,
            task_name: str = "", record_user: bool = True, toolsets: set[str] | None = None,
            dossier_note: str = "") -> RunResult:
        z = self.zeus
        session = z.db.get_session(session_id)
        if not session:
            return RunResult("Session introuvable.", ok=False)
        trust = session.get("trust", "owner")
        profile = profile or {"external": "guichet", "system": "system"}.get(trust, "owner")
        run = Run(session_id, profile, parent, query=text)
        run.toolsets = self._initial_toolsets(profile, session, text, toolsets)
        run.initial_toolsets = set(run.toolsets)
        brain = (session.get("meta") or {}).get("brain")
        if parent is None and brain in ("max", "fast") and profile in ("owner", "system"):
            run.purpose = brain
        if parent is None and profile == "owner" and modes.get(session).get("id") == "interprete":
            run.no_tools = True  # l'interprète traduit, rien d'autre : pas d'outils, modèle rapide s'il existe
            if z.config.get("routing.fast") and brain != "max":
                run.purpose = "fast"
        if parent is None:
            z.register_run(session_id, run)
        max_steps = int(max_steps or z.config.get("agent.max_steps", 40))

        root = run
        while root.parent is not None:
            root = root.parent
        run.root_session = root.session_id

        def emit(t: str, **d: Any) -> None:
            z.bus.publish(t, session_id=session_id, run_id=run.id, depth=run.depth, root_session=run.root_session, **d)

        emit("run_start", profile=profile)
        if record_user:
            z.db.add_message(session_id, self._user_message(text, attachments or [], session))
        final, ok = "", True
        guard: Counter = Counter()
        compressed = False

        def stream(delta: str | None) -> None:
            if delta is None:
                emit("assistant_reset")
            else:
                emit("assistant_delta", text=delta)

        notices_seen: set[str] = set()
        # Mini-cerveau : si le modèle local doit remplacer le cerveau en ligne, il reçoit une requête légère.
        lean = (lambda: minibrain.build(z, session_id)) if parent is None and profile == "owner" else None

        def notice(text: str) -> None:
            # bascule de modèle, modèle lent… : une seule fois par tâche (une tâche peut faire 40 appels)
            if text not in notices_seen:
                notices_seen.add(text)
                emit("model_notice", text=text)

        # Réflexe sans IA (heure, date, calcul, agenda du jour) : réponse immédiate, aucun modèle appelé.
        quick = None
        if parent is None and profile == "owner" and record_user and not attachments and toolsets is None:
            try:
                quick = reflexes.answer(z, session, text)
            except Exception:  # noqa: BLE001 — un réflexe raté laisse la main au cerveau habituel
                log.exception("réflexe")
        if quick:
            final = quick
            stream(quick)
            z.db.add_message(session_id, {"role": "assistant", "content": quick, "meta": {"model": "réflexe",
                                                                                         "reflex": True}})

        try:
            while not quick:
                if run.cancel.is_set():
                    final, ok = "⏹️ Tâche arrêtée.", False
                    z.db.add_message(session_id, {"role": "assistant", "content": final})
                    break
                self._drain_inbox(run, session_id)
                if run.steps >= max_steps:
                    final = self._wrap_up(run, session_id, profile, task_name, dossier_note)
                    break
                run.steps += 1
                for ts in sorted(run.toolsets - run.initial_toolsets - set(run.enabled_order)):
                    run.enabled_order.append(ts)  # chargée par le modèle depuis l'étape précédente
                names = self._tool_names(run, profile, trust)
                limit = self._request_limit()
                if limit:
                    names = self._diet(run, profile, trust, session, names, limit, task_name, dossier_note)
                tools = z.registry.schemas(names, compact=bool(limit))
                messages = self._context(session_id, profile, run, tools, task_name, dossier_note)
                emit("thinking", step=run.steps, toolsets=sorted(run.toolsets))
                try:
                    resp = z.router.chat(messages, tools or None, purpose=run.purpose, stream_cb=stream,
                                         cancel=run.cancel, notice_cb=notice,
                                         temperature=z.config.get("agent.temperature", 0.3), lean=lean)
                except LLMError as e:
                    if e.kind == "context_length" and not compressed:
                        compressed = True
                        self._compress(session_id, force=True)
                        run.steps -= 1
                        continue
                    if e.kind == "cancelled":
                        final, ok = "⏹️ Tâche arrêtée.", False
                    else:
                        final, ok = self._llm_failure_text(e), False
                    z.db.add_message(session_id, {"role": "assistant", "content": final, "meta": {"error": True}})
                    break
                for k_in, k_out in (("prompt_tokens", "completion_tokens"), ("input_tokens", "output_tokens")):
                    run.usage["in"] += int(resp.usage.get(k_in) or 0)
                    run.usage["out"] += int(resp.usage.get(k_out) or 0)
                run.usage["cache"] = run.usage.get("cache", 0) + int(resp.usage.get("cache_read_input_tokens") or 0)
                if resp.cost:
                    run.cost += resp.cost
                    r0 = run
                    while r0.parent is not None:
                        r0 = r0.parent
                        r0.cost += resp.cost
                calls = resp.tool_calls
                if not calls:
                    final = resp.text.strip() or "C'est fait."
                    meta = {"model": resp.model, "files": run.files}
                    if getattr(resp, "lean", False):
                        meta["mini"] = True
                    if run.cost:
                        meta["cost"] = round(run.cost, 4)
                    z.db.add_message(session_id, {"role": "assistant", "content": final, "meta": meta})
                    break
                z.db.add_message(session_id, {"role": "assistant", "content": resp.text,
                                              "tool_calls": [c.to_dict() for c in calls],
                                              "meta": {"model": resp.model}})
                if resp.text.strip():
                    emit("assistant_note", text=resp.text.strip())
                results = self._execute_calls(run, session, calls, names)
                images: list[str] = []
                for call, res in results:
                    z.db.add_message(session_id, {"role": "tool", "tool_call_id": call.id, "name": call.name,
                                                  "content": res.text or ("OK" if not res.error else "ERREUR"),
                                                  "meta": {"error": res.error}})
                    images += res.images
                    run.files += [f for f in res.files if f not in run.files]
                if images:
                    run.images += images
                    if z.router.vision_available():
                        parts: list[dict] = [{"type": "text", "text": "[Image(s) renvoyée(s) par les outils ci-dessus]"}]
                        parts += [{"type": "image", "path": pth} for pth in images[-2:]]
                        z.db.add_message(session_id, {"role": "user", "content": parts, "meta": {"auto": True}})
                for call in calls:
                    key = (call.name, jdump(call.arguments))
                    guard[key] += 1
                    if guard[key] == 3:
                        z.db.add_message(session_id, {"role": "user", "meta": {"auto": True}, "content":
                                                      f"[Note système] Tu as répété 3 fois {call.name} avec les mêmes "
                                                      f"paramètres. Change d'approche ou conclus."})
        except Exception as e:  # noqa: BLE001
            log.exception("boucle agent")
            final, ok = f"Erreur interne : {type(e).__name__} : {e}", False
            z.db.add_message(session_id, {"role": "assistant", "content": final, "meta": {"error": True}})
        finally:
            run.status = "done" if ok else "error"
            if parent is None:
                z.unregister_run(session_id, run)

        emit("run_end", text=final, ok=ok, files=run.files, images=run.images[-3:], steps=run.steps,
             tool_calls=run.tool_calls, usage=run.usage, cost=round(run.cost, 4),
             duration=round(time.time() - run.started, 1))
        self._after_run(session_id, session, run, text, final, ok)
        # messages arrivés trop tard pour cette tâche : nouvelle tâche
        if parent is None and not run.inbox.empty():
            pending = []
            while not run.inbox.empty():
                pending.append(run.inbox.get_nowait())
            z.submit(session_id, "\n\n".join(m["text"] for m in pending),
                     [a for m in pending for a in m.get("attachments", [])])
        return RunResult(final, ok, run.files, run.images, run)

    # ================================================================== sous-agents
    def run_subagents(self, parent: Run, tasks: list[dict], profile: str = "worker",
                      max_steps: int = 25) -> list[RunResult]:
        z = self.zeus
        parent_session = z.db.get_session(parent.session_id) or {}

        def one(task: dict) -> RunResult:
            goal = task.get("goal") or task.get("task") or ""
            ctx = task.get("context") or ""
            sid = z.db.create_session("agent", parent.session_id, "owner" if parent_session.get("trust") != "system"
                                      else "system", title=f"Sous-agent : {goal[:50]}",
                                      meta={"parent": parent.session_id})
            ts = set(task.get("toolsets") or [])
            ts = (ts | {"core"}) if profile == "worker" else ts
            text = goal + (f"\n\nContexte :\n{ctx}" if ctx else "")
            return self.run(sid, text, profile=profile, parent=parent, max_steps=max_steps,
                            toolsets=ts or None)

        if len(tasks) == 1:
            return [one(tasks[0])]
        with ThreadPoolExecutor(max_workers=min(4, len(tasks))) as ex:
            return list(ex.map(one, tasks))

    # ================================================================== outils
    def _initial_toolsets(self, profile: str, session: dict, text: str, explicit: set[str] | None) -> set[str]:
        z = self.zeus
        available = set(z.registry.toolsets())
        if explicit:
            return set(explicit) & (available | {"guichet"})
        if profile == "guichet":
            return {"guichet"}
        if profile == "phone":
            return {"phone"}
        if z.config.get("agent.all_tools"):
            return available
        ts = {"core"}
        ts |= set((session.get("meta") or {}).get("toolsets") or []) & available
        ts |= set(modes.toolsets(modes.get(session))) & available
        ts |= detect_toolsets(text, available)
        if profile == "system":
            ts |= {"tasks"}
        return ts

    def _tool_names(self, run: Run, profile: str, trust: str) -> list[str]:
        reg = self.zeus.registry
        if getattr(run, "no_tools", False):
            return []
        if trust == "external" or profile == "guichet":
            return reg.names_for("external", None)
        names = reg.names_for("owner", run.toolsets)
        # Rôle « léger » (ex. professeur de langue) : seuls quelques outils généraux restent, tant que le modèle
        # ne redemande pas la boîte « core » complète (enable_tools(["core"])).
        if "core_full" not in run.toolsets and profile not in ("phone", "worker") and run.depth == 0:
            sess = self.zeus.db.get_session(run.session_id) or {}
            keep = modes.core_tools(modes.get(sess)) or (LEAN_CORE if run.lean_core else None)
            if keep:
                names = [n for n in names if (reg.get(n) and reg.get(n).toolset != "core") or n in keep]
        if profile == "phone":
            names = [n for n in names if n != "phone_task"] + [n for n in PHONE_EXTRA if reg.get(n)]
        if profile == "worker" or run.depth >= 1:
            names = [n for n in names if n != "delegate"]
        if run.depth >= 2:
            names = [n for n in names if n != "phone_task"]
        seen: list[str] = []
        for n in names:
            if n not in seen:
                seen.append(n)
        return seen

    def _execute_calls(self, run: Run, session: dict, calls: list, allowed: list[str]) -> list[tuple[Any, ToolResult]]:
        z = self.zeus
        results: dict[int, ToolResult] = {}
        to_run: list[tuple[int, Any, Any]] = []
        for i, call in enumerate(calls):
            ctx = ToolContext(z, session, run)
            ctx.call_id = call.id
            tool = z.registry.get(call.name)
            if tool is None:
                results[i] = z.registry.execute(ctx, call.name, call.arguments)
                continue
            if call.name not in allowed:
                # outil existant mais boîte non chargée : on la charge si le profil le permet
                ok_trust = session.get("trust") in tool.trust or (session.get("trust") == "system" and "owner" in tool.trust)
                if ok_trust and run.profile not in ("guichet",) and not (run.profile == "phone" and tool.toolset != "phone"):
                    run.toolsets.add(tool.toolset)
                    allowed = self._tool_names(run, run.profile, session.get("trust", "owner"))
                if call.name not in allowed:
                    results[i] = ToolResult.err(f"outil « {call.name} » non disponible ici.")
                    continue
            risk = tool.risk_for(ctx, call.arguments or {})
            decision = z.security.decide(ctx, tool, risk)
            z.bus.publish("tool_start", session_id=session["id"], run_id=run.id, depth=run.depth,
                          root_session=getattr(run, "root_session", session["id"]), call_id=call.id,
                          name=call.name, args=redact(_short_args(call.arguments)), risk=risk, decision=decision)
            if decision == "deny":
                results[i] = ToolResult.err(z.security.deny_message(ctx, risk))
            elif decision == "confirm":
                status, answer = z.approvals.request(ctx, "tool", tool.name, call.arguments or {}, risk,
                                                     tool.summary(call.arguments or {}))
                if status == "approved":
                    to_run.append((i, call, ctx))
                else:
                    results[i] = ToolResult.err(self._refused_text(status))
            else:
                to_run.append((i, call, ctx))

        def execute(item: tuple[int, Any, Any]) -> tuple[int, ToolResult, float]:
            i, call, ctx = item
            t0 = time.time()
            res = z.registry.execute(ctx, call.name, call.arguments or {})
            return i, res, time.time() - t0

        parallel = len(to_run) > 1 and all((z.registry.get(c.name) or _Dummy).parallel_safe for _, c, _ in to_run)
        if parallel:
            with ThreadPoolExecutor(max_workers=int(z.config.get("agent.parallel_tools", 6))) as ex:
                done = list(ex.map(execute, to_run))
        else:
            done = [execute(it) for it in to_run]
        limit = int(z.config.get("agent.tool_output_chars", 12000))
        for i, res, dt in done:
            call = calls[i]
            if len(res.text) > limit:
                from .tools import spill
                res.text = spill(ToolContext(z, session, run), res.text, limit, call.name)
            results[i] = res
            run.tool_calls += 1
            z.db.audit(session.get("trust", "owner") if session.get("trust") != "owner" else "zeus",
                       f"outil {call.name}", {"args": redact(_short_args(call.arguments)), "ok": not res.error,
                                              "session": session["id"], "duration": round(dt, 2)})
        out = []
        for i, call in enumerate(calls):
            res = results.get(i) or ToolResult.err("pas de résultat")
            run.trace.append((call.name, jdump(_short_args(call.arguments))[:160], not res.error))
            z.bus.publish("tool_end", session_id=session["id"], run_id=run.id, depth=run.depth,
                          root_session=getattr(run, "root_session", session["id"]), call_id=call.id,
                          name=call.name, ok=not res.error, preview=truncate(res.text, 600),
                          images=res.images, files=res.files)
            out.append((call, res))
        return out

    def _refused_text(self, status: str) -> str:
        owner = self.zeus.config.owner_name or "le propriétaire"
        why = {"denied": f"refusée par {owner}", "expired": "sans réponse (délai dépassé)",
               "cancelled": "annulée"}.get(status, status)
        return f"action {why}. Ne la relance pas telle quelle : propose une alternative ou demande des précisions."

    def call_tool(self, session: dict, name: str, args: dict | None = None, run: "Run | None" = None,
                  origin: str = "direct") -> ToolResult:
        """Appel direct d'un outil (scripts via zeus_outils, serveur MCP) avec les mêmes garde-fous que l'agent :
        niveau de risque, décision de sécurité, validation éventuelle, journal d'audit, événements."""
        z = self.zeus
        args = dict(args or {})
        ctx = ToolContext(z, session, run)
        ctx.call_id = f"{origin}-{uuid.uuid4().hex[:8]}"
        tool = z.registry.get(name)
        if tool is None:
            return z.registry.execute(ctx, name, args)
        trust = session.get("trust", "owner")
        if not (trust in tool.trust or (trust == "system" and "owner" in tool.trust)):
            return ToolResult.err(f"outil « {name} » non disponible ici.")
        risk = tool.risk_for(ctx, args)
        decision = z.security.decide(ctx, tool, risk)
        base = {"session_id": session["id"], "run_id": getattr(run, "id", ""), "depth": getattr(run, "depth", 0),
                "root_session": getattr(run, "root_session", session["id"]), "call_id": ctx.call_id, "name": name}
        z.bus.publish("tool_start", **base, args=redact(_short_args(args)), risk=risk, decision=decision,
                      origin=origin)
        t0 = time.time()
        if decision == "deny":
            res = ToolResult.err(z.security.deny_message(ctx, risk))
        else:
            status = "approved"
            if decision == "confirm":
                status, _ = z.approvals.request(ctx, "tool", tool.name, args, risk, tool.summary(args))
            res = z.registry.execute(ctx, name, args) if status == "approved" else \
                ToolResult.err(self._refused_text(status))
        limit = int(z.config.get("agent.tool_output_chars", 12000))
        if len(res.text) > limit:
            from .tools import spill
            res.text = spill(ctx, res.text, limit, name)
        z.db.audit("zeus" if trust == "owner" else trust, f"outil {name} ({origin})",
                   {"args": redact(_short_args(args)), "ok": not res.error, "session": session["id"],
                    "duration": round(time.time() - t0, 2), "decision": decision})
        if run is not None:
            run.tool_calls += 1
            run.trace.append((name, jdump(_short_args(args))[:160], not res.error))
            run.files += [f for f in res.files if f not in run.files]
        z.bus.publish("tool_end", **base, ok=not res.error, preview=truncate(res.text, 600), images=res.images,
                      files=res.files)
        return res

    # ================================================================== contexte
    def _user_message(self, text: str, attachments: list[str], session: dict) -> dict:
        notes: list[str] = []
        parts: list[dict] = []
        for a in attachments:
            pth = Path(a)
            if not pth.exists():
                continue
            size = human_size(pth.stat().st_size)
            if is_image(a):
                parts.append({"type": "image", "path": str(pth)})
                notes.append(f"[Image jointe : {pth} ({size})]")
            elif is_audio(a):
                tx = self.zeus.transcribe(str(pth))
                notes.append(f"[Message vocal transcrit] {tx}" if tx else
                             f"[Audio joint : {pth} — transcription non configurée (Réglages → Voix)]")
            else:
                preview = ""
                try:
                    from .tools.documents import extract_text
                    txt, _ = extract_text(pth, max_chars=1500)
                    if txt.strip():
                        preview = "\nAperçu :\n" + truncate(txt.strip(), 1500)
                except Exception:
                    pass
                notes.append(f"[Fichier joint : {pth} ({guess_mime(a)}, {size})]{preview}")
        body = text.strip()
        if notes:
            body = (body + "\n\n" if body else "") + "\n".join(notes)
        if parts:
            return {"role": "user", "content": [{"type": "text", "text": body}] + parts, "attachments": attachments}
        return {"role": "user", "content": body, "attachments": attachments or None}

    def _drain_inbox(self, run: Run, session_id: str) -> None:
        got = False
        while not run.inbox.empty():
            m = run.inbox.get_nowait()
            session = self.zeus.db.get_session(session_id) or {}
            msg = self._user_message(m["text"], m.get("attachments") or [], session)
            if isinstance(msg["content"], str):
                msg["content"] = "[Nouveau message reçu pendant la tâche] " + msg["content"]
            self.zeus.db.add_message(session_id, msg)
            got = True
        if got:
            self.zeus.bus.publish("inbox_consumed", session_id=session_id, run_id=run.id)

    def _request_limit(self) -> int | None:
        """Taille maximale d'une requête pour le cerveau principal (Groq gratuit : 8 000 jetons), ou None."""
        h = self.zeus.router.primary()
        return h.request_limit if h else None

    def _budget(self) -> int:
        z = self.zeus
        b = int(z.config.get("agent.context_tokens", 24000))
        h = z.router.primary()
        if h:
            b = min(b, max(4000, h.context - 2500))
            if h.request_limit:  # Groq gratuit : la requête entière (avec la réponse) doit tenir sous 8 000 jetons
                b = min(b, max(3000, h.request_limit - DIET_MARGIN))
        return b

    def _diet(self, run: Run, profile: str, trust: str, session: dict, names: list[str], limit: int,
              task_name: str = "", dossier_note: str = "") -> list[str]:
        """Requête limitée en taille (Groq gratuit) : consignes + outils doivent laisser de la place à la conversation.
        On retire d'abord les boîtes à outils sans rapport avec la demande (des plus lourdes aux plus légères), puis on
        allège les outils de base. Le modèle peut toujours les recharger avec enable_tools."""
        z, reg = self.zeus, self.zeus.registry
        if profile not in ("owner", "system") or run.depth or getattr(run, "no_tools", False):
            return names
        room = limit - DIET_MARGIN - DIET_HISTORY

        def size(ns: list[str]) -> int:
            sess = z.db.get_session(run.session_id) or session
            system = prompts.build(z, sess, profile, sorted(run.toolsets), query=run.query, task_name=task_name,
                                   dossier_note=dossier_note, now=run.started)
            return estimate_tokens(system) + estimate_tokens(jdump(reg.schemas(ns, compact=True)))
        if size(names) <= room:
            return names
        mode = modes.get(z.db.get_session(run.session_id) or session)
        first = (modes.toolsets(mode) or [None])[0]
        keep = {"core", "core_full", first} | detect_toolsets(run.query, set(reg.toolsets())) | \
            (run.toolsets - run.initial_toolsets)
        weight = {t: estimate_tokens(jdump(reg.schemas([n for n in names if reg.get(n) and reg.get(n).toolset == t],
                                                        compact=True))) for t in run.toolsets}
        for ts in sorted(run.toolsets - keep, key=lambda t: -weight.get(t, 0)):
            run.toolsets.discard(ts)
            names = self._tool_names(run, profile, trust)
            if size(names) <= room:
                return names
        if "core_full" not in run.toolsets and not run.lean_core:
            run.lean_core = True
            names = self._tool_names(run, profile, trust)
            if size(names) <= room:
                return names
        # Encore trop gros (la demande touche plusieurs domaines) : on garde, dans l'ordre, la dernière boîte chargée
        # par le modèle, celle du rôle, puis les boîtes demandées les plus légères, tant qu'elles tiennent. La
        # première de la liste est toujours gardée ; les autres se rechargent au besoin avec enable_tools.
        recent = [t for t in reversed(run.enabled_order) if t in run.toolsets]
        detected = sorted(run.toolsets - set(recent) - {first, "core", "core_full"}, key=lambda t: weight.get(t, 0))
        order = list(dict.fromkeys(recent + ([first] if first in run.toolsets else []) + detected))
        base = run.toolsets & {"core", "core_full"}
        run.toolsets = set(base)
        for i, ts in enumerate(order):
            run.toolsets.add(ts)
            if i and size(self._tool_names(run, profile, trust)) > room:
                run.toolsets.discard(ts)
        return self._tool_names(run, profile, trust)

    def _context(self, session_id: str, profile: str, run: Run, tools: list[dict], task_name: str,
                 dossier_note: str) -> list[dict]:
        z = self.zeus
        session = z.db.get_session(session_id) or {}
        # Consignes figées pendant toute la tâche (même date, même état du téléphone) : le début de la requête
        # reste identique d'une étape à l'autre, donc relu depuis le cache du fournisseur (bien moins cher).
        key = (profile, tuple(sorted(run.toolsets)), session.get("summary") or "", task_name, dossier_note,
               (session.get("meta") or {}).get("autonomy"), jdump((session.get("meta") or {}).get("mode") or {}))
        if run._system and run._system[0] == key:
            system = run._system[1]
        else:
            system = prompts.build(z, session, profile, sorted(run.toolsets), query=run.query,
                                   task_name=task_name, dossier_note=dossier_note, now=run.started)
            run._system = (key, system)
        msgs = sanitize([_to_llm(m) for m in z.db.get_messages(session_id)])
        limited = bool(self._request_limit())
        fixed = estimate_tokens(system) + estimate_tokens(jdump(tools)) + (0 if limited else 1500)
        msgs = self._fit(session_id, msgs, self._budget() - fixed, floor=DIET_HISTORY if limited else 1500)
        if profile == "owner" and msgs and not getattr(run, "no_tools", False):
            # contexte du moment (heure, téléphone, souvenirs liés) : en dernier, hors de la partie mise en cache
            if run._note is None:
                run._note = prompts.volatile_note(z, run.query, now=run.started)
            msgs.append({"role": "user", "volatile": True, "content": run._note})
        if run.plan and msgs:
            # le plan change souvent : il vient en dernier, hors de la partie mise en cache
            plan = "\n".join(f"{'✓' if s.get('status') == 'fait' else '→' if s.get('status') == 'en_cours' else '·'} "
                             f"{s.get('step')}" for s in run.plan)
            msgs.append({"role": "user", "volatile": True,
                         "content": f"[Rappel automatique de ZEUS (pas un message de l'utilisateur) — ton plan en "
                                    f"cours, à poursuivre]\n{plan}"})
        return [{"role": "system", "content": system}] + msgs

    @staticmethod
    def _size(msgs: list[dict]) -> int:
        n = 0
        for m in msgs:
            n += estimate_tokens(content_text(m.get("content"))) + 4
            if m.get("tool_calls"):
                n += estimate_tokens(jdump(m["tool_calls"]))
            if isinstance(m.get("content"), list):
                n += 900 * sum(1 for p in m["content"] if isinstance(p, dict) and p.get("type") == "image")
        return n

    def _fit(self, session_id: str, msgs: list[dict], avail: int, floor: int = 1500) -> list[dict]:
        avail = max(avail, floor)
        if self._size(msgs) <= avail:
            return msgs
        # 1. raccourcir les anciens résultats d'outils
        tool_idx = [i for i, m in enumerate(msgs) if m["role"] == "tool"]
        for i in tool_idx[:-4]:
            t = content_text(msgs[i].get("content"))
            if len(t) > 1200:
                msgs[i] = {**msgs[i], "content": truncate(t, 1200, "ancien résultat raccourci")}
        # 2. retirer les anciennes images
        img_idx = [i for i, m in enumerate(msgs) if isinstance(m.get("content"), list)]
        for i in img_idx[:-1]:
            msgs[i] = {**msgs[i], "content": content_text(msgs[i]["content"]) + " [image retirée du contexte]"}
        if self._size(msgs) <= avail:
            return msgs
        # 3. résumer le début de la conversation
        target = int(avail * 0.6)
        cut = 0
        for i in range(len(msgs)):
            if msgs[i]["role"] == "user" and not (msgs[i].get("meta") or {}).get("auto") and \
                    self._size(msgs[i:]) <= target:
                cut = i
                break
        if cut == 0:
            # aucun point de coupe propre : on garde le strict minimum récent
            for i in range(len(msgs) - 1, -1, -1):
                if msgs[i]["role"] == "user":
                    cut = i
                    break
            if cut == 0:
                return sanitize(msgs[-6:])
        older, recent = msgs[:cut], msgs[cut:]
        self._summarize_into_session(session_id, older)
        return sanitize(recent)

    def _compress(self, session_id: str, force: bool = False) -> None:
        msgs = sanitize([_to_llm(m) for m in self.zeus.db.get_messages(session_id)])
        users = [i for i, m in enumerate(msgs) if m["role"] == "user" and not (m.get("meta") or {}).get("auto")]
        if len(users) < 2:
            return
        cut = users[len(users) // 2] if not force else users[-1]
        if cut > 0:
            self._summarize_into_session(session_id, msgs[:cut])

    def _summarize_into_session(self, session_id: str, older: list[dict]) -> None:
        z = self.zeus
        session = z.db.get_session(session_id) or {}
        lines = []
        for m in older:
            role = {"user": "Utilisateur", "assistant": "ZEUS", "tool": f"Outil {m.get('name', '')}"}.get(m["role"], m["role"])
            txt = content_text(m.get("content"))
            if m.get("tool_calls"):
                txt += " " + ", ".join(f"→{tc['name']}({jdump(tc.get('arguments'))[:120]})" for tc in m["tool_calls"])
            lines.append(f"{role} : {truncate(txt, 600)}")
        transcript = truncate("\n".join(lines), 14000)
        prev = session.get("summary") or ""
        summary = ""
        try:
            r = z.router.chat([
                {"role": "system", "content": "Tu résumes des conversations pour la mémoire de travail d'un assistant."},
                {"role": "user", "content": (f"Résumé précédent :\n{prev}\n\n" if prev else "") +
                 f"Suite de la conversation :\n{transcript}\n\nÉcris un résumé à jour (15 lignes max) : faits clés, "
                 f"décisions, résultats importants (chemins de fichiers, numéros, liens, identifiants de dossiers), "
                 f"tâches en cours ou promises."}], None, purpose="fast", max_tokens=700, temperature=0.2)
            summary = r.text.strip()
        except LLMError as e:
            log.warning("résumé impossible : %s", e)
        if not summary:
            summary = truncate((prev + "\n" if prev else "") + "\n".join(lines[-12:]), 3000)
        z.db.update_session(session_id, summary=summary)
        ids = [m.get("id") for m in older if m.get("id")]
        if ids:
            z.db.archive_messages(session_id, max(ids))
        z.bus.publish("context_compressed", session_id=session_id)

    # ================================================================== fin de tâche
    def _wrap_up(self, run: Run, session_id: str, profile: str, task_name: str, dossier_note: str) -> str:
        z = self.zeus
        z.db.add_message(session_id, {"role": "user", "meta": {"auto": True}, "content":
                                      "[Note système] Limite d'étapes atteinte. Sans appeler d'outil, résume ce qui a "
                                      "été fait, le résultat actuel et ce qu'il reste à faire."})
        try:
            trust = (z.db.get_session(session_id) or {}).get("trust", "owner")
            tools = z.registry.schemas(self._tool_names(run, profile, trust))
            msgs = self._context(session_id, profile, run, tools, task_name, dossier_note)
            r = z.router.chat(msgs, tools or None, purpose=run.purpose, cancel=run.cancel, max_tokens=800)
            text = r.text.strip() or "J'ai atteint la limite d'étapes."
        except LLMError as e:
            text = f"J'ai atteint la limite d'étapes ({run.steps}). {e}"
        z.db.add_message(session_id, {"role": "assistant", "content": text})
        return text

    @staticmethod
    def _llm_failure_text(e: LLMError) -> str:
        if e.kind == "budget":
            return "💸 " + str(e.args[0])
        if "[billing]" in str(e) or e.kind == "billing":
            return ("💳 Les crédits de ton fournisseur d'IA sont épuisés. Ajoute des crédits (Claude : platform.claude.com "
                    "→ Settings → Billing → Buy credits), ou branche un modèle local gratuit (Ollama).\n" + str(e.args[0]))
        if e.kind == "no_model":
            return ("⚠️ Aucun modèle n'est branché. Va dans **Réglages → Modèles** (ou lance `python zeus.py setup`) "
                    "pour connecter Ollama (100 % local) ou une clé API (Claude, GPT, Gemini, OpenRouter, Groq…).")
        msg = str(e)
        local_url = re.search(r"localhost|127\.0\.0\.1|\[::1\]", msg)
        net = [k.split(":")[0] for k in e.kinds]
        local_down = "connection:local" in e.kinds
        if net and all(k in ("connection", "timeout", "cooldown") for k in net) and \
                any(k in ("connection", "timeout") for k in net) and "timeout:local" not in e.kinds:
            # Tout est injoignable : c'est le réseau, pas la clé ni le modèle.
            return ("📡 Aucun modèle d'IA n'a répondu : ta connexion internet semble coupée ou très lente.\n" +
                    str(e.args[0]) + "\n\nVérifie le Wi-Fi ou les données mobiles, puis réessaie dans un instant. "
                    "Les commandes instantanées (heure, minuteur, liste de courses…) marchent sans internet." +
                    (" Le modèle local ne répond pas non plus : vérifie qu'Ollama est lancé." if local_down else
                     " Pour continuer hors ligne, branche un modèle local (Ollama) en secours dans Réglages → Modèles."))
        if "[timeout]" in msg and local_url and "[connection]" not in msg:
            # Le modèle local répond, mais trop lentement : ce n'est pas une panne d'Ollama.
            return ("🐢 Le modèle local est bien lancé, mais il met trop de temps à répondre. Ton ordinateur n'a sans "
                    "doute pas de carte graphique, ou ce modèle est trop gros pour lui.\nSolutions : un modèle plus "
                    "petit (`ollama pull llama3.2:3b` ou `qwen3:4b`), ou un modèle en ligne rapide : Groq (gratuit) ou "
                    "Claude (le plus intelligent), dans Réglages → Modèles.\n" + str(e.args[0]))
        return ("⚠️ Je n'arrive à joindre aucun modèle d'IA pour le moment.\n" + str(e.args[0]) +
                "\n\nVérifie qu'Ollama est lancé, ta connexion internet ou ta clé API (Réglages → Modèles).")

    def _after_run(self, session_id: str, session: dict, run: Run, text: str, final: str, ok: bool) -> None:
        z = self.zeus
        if run.parent is None and session.get("title") in ("Nouvelle conversation", "", None) and text.strip():
            title = re.sub(r"\s+", " ", text.strip())[:60]
            z.db.update_session(session_id, title=title)
            z.bus.publish("session_updated", session_id=session_id, title=title)
        if run.profile in ("owner", "system") and run.parent is None:
            sticky = sorted(t for t in run.toolsets if t != "core")[:5]
            meta = (z.db.get_session(session_id) or {}).get("meta") or {}
            if sticky != meta.get("toolsets"):
                meta["toolsets"] = sticky
                z.db.update_session(session_id, meta=meta)
        if ok and run.parent is None and run.profile == "owner":
            from . import lessons
            lessons.maybe_recap(z, session_id)  # bilan des derniers échanges, en arrière-plan
        if (ok and run.parent is None and run.profile in ("owner", "system") and run.tool_calls >= 4
                and z.config.get("agent.auto_learn", True)):
            threading.Thread(target=self._reflect, args=(run, text, final), daemon=True).start()

    def _reflect(self, run: Run, request: str, final: str) -> None:
        """Apprentissage automatique : souvenirs durables + compétence réutilisable."""
        z = self.zeus
        steps = "\n".join(f"{'✓' if ok else '✗'} {name} {args}" for name, args, ok in run.trace[-40:])
        prompt = (
            "Tu analyses une tâche que l'assistant ZEUS vient de terminer, pour qu'il s'améliore.\n"
            f"Demande : {truncate(request, 1500)}\n\nActions :\n{steps}\n\nRésultat : {truncate(final, 1500)}\n\n"
            "Réponds UNIQUEMENT en JSON : {\"memories\": [{\"content\": \"…\", \"kind\": \"preference|profil|contact|fait\", "
            "\"importance\": 1-5}], \"skill\": null ou {\"name\": \"nom_court_snake_case\", \"description\": \"quand "
            "l'utiliser\", \"steps\": \"1. …\\n2. …\"}}.\n"
            "- memories : seulement des faits durables et utiles sur le propriétaire (0 à 3). Jamais de mot de passe, "
            "code PIN, code secret ou numéro de carte.\n"
            "- skill : seulement si la méthode est réutilisable et a fonctionné ; étapes concrètes, avec les pièges "
            "évités. Sinon null.")
        try:
            r = z.router.chat([{"role": "system", "content": "Tu réponds uniquement en JSON valide."},
                               {"role": "user", "content": prompt}], None, purpose="fast", max_tokens=900,
                              temperature=0.1)
            data = parse_json_loose(r.text)
        except Exception as e:  # noqa: BLE001
            log.debug("réflexion ignorée : %s", e)
            return
        if not isinstance(data, dict):
            return
        secret = re.compile(r"\b(pin|mot de passe|password|code secret|cvv|\d{4,}\s*#)", re.I)
        for m in (data.get("memories") or [])[:3]:
            c = (m or {}).get("content", "").strip()
            if c and not secret.search(c):
                mid, created = z.db.add_memory(c, (m.get("kind") or "fait")[:20], "auto",
                                               int(m.get("importance") or 3), source="auto")
                if created:
                    z.bus.publish("memory_added", id=mid, content=c)
        sk = data.get("skill")
        if isinstance(sk, dict) and sk.get("name") and sk.get("steps") and not run.skills_used:
            name = re.sub(r"[^a-z0-9_]+", "_", norm(sk["name"]))[:50].strip("_")
            if name:
                z.db.upsert_skill(name, sk.get("description", "")[:300], sk["steps"][:4000], source="auto")
                z.bus.publish("skill_learned", name=name)


class _Dummy:
    parallel_safe = False


def _short_args(args: Any) -> Any:
    if isinstance(args, dict):
        return {k: (v[:300] + "…" if isinstance(v, str) and len(v) > 300 else v) for k, v in args.items()}
    return args


def _to_llm(m: dict) -> dict:
    out: dict[str, Any] = {"role": m["role"], "content": m.get("content") or "", "id": m.get("id"),
                           "meta": m.get("meta") or {}}
    if m.get("tool_calls"):
        out["tool_calls"] = m["tool_calls"]
    if m.get("tool_call_id"):
        out["tool_call_id"] = m["tool_call_id"]
    if m.get("name"):
        out["name"] = m["name"]
    return out


def sanitize(msgs: list[dict]) -> list[dict]:
    """Répare l'historique : chaque appel d'outil a son résultat, pas de résultat orphelin."""
    out: list[dict] = []
    pending: dict[str, str] = {}

    def flush() -> None:
        for cid, name in pending.items():
            out.append({"role": "tool", "tool_call_id": cid, "name": name,
                        "content": "(résultat indisponible : exécution interrompue)"})
        pending.clear()

    for m in msgs:
        if m["role"] == "tool":
            cid = m.get("tool_call_id")
            if cid in pending:
                pending.pop(cid)
                out.append(m)
            continue
        if pending:
            flush()
        if m["role"] == "assistant" and not content_text(m.get("content")).strip() and not m.get("tool_calls"):
            continue
        out.append(m)
        if m["role"] == "assistant" and m.get("tool_calls"):
            pending = {tc["id"]: tc["name"] for tc in m["tool_calls"]}
    if pending:
        flush()
    return out


__all__ = ["Agent", "Run", "RunResult", "detect_toolsets", "sanitize", "has_images"]
