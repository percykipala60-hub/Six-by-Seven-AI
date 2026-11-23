"""Registre des outils de ZEUS.

Chaque outil déclare : description, paramètres (JSON Schema), niveau de risque
(read < write < external < danger < money), boîte à outils (toolset) et qui a le droit
de l'utiliser (propriétaire et/ou usagers externes du guichet).
"""

from __future__ import annotations

import re

import difflib
import json
import threading
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from ..util import jdump, log, truncate

if TYPE_CHECKING:  # pragma: no cover
    from ..core import Zeus

RISK_LEVELS = ("read", "write", "external", "danger", "money", "catastrophic")

TOOLSETS: dict[str, str] = {
    "core": "Base : plan, mémoire, compétences, fichiers simples, shell, Python, web, sous-agents",
    "files": "Fichiers avancés : modifier, chercher, déplacer, supprimer (corbeille), télécharger, lire PDF/Word/Excel/images",
    "phone": "Téléphone Android : voir l'écran, toucher, écrire, applis, appels, SMS, WhatsApp, notifications, contacts",
    "computer": "Ordinateur : ouvrir applis/fichiers/sites, capture d'écran, clavier/souris, presse-papier, notifications",
    "dossiers": "Dossiers administratifs : créer, joindre des pièces, vérifier la complétude, relancer, valider, exporter",
    "comms": "Communication : envoyer e-mails, messages Telegram et WhatsApp (API), lire la boîte mail",
    "browser": "Navigateur piloté sur le PC : ouvrir des sites, cliquer, remplir des formulaires, se connecter, capturer",
    "tasks": "Tâches planifiées et gestion de la mémoire : lister/annuler des tâches, oublier, lister les compétences",
    "learning": "Apprentissage : cartes mémoire à répétition espacée, suivi de progression, bilans (cours et langues)",
    "knowledge": "Mes documents : recherche dans tes cours, notes, PDF, Word et dossiers indexés, avec citations",
    "secretariat": "Secrétariat : agenda avec rappels et export .ics, carnet d'adresses, tâches à faire, factures et devis",
}


def p(type_: str, description: str = "", **extra: Any) -> dict:
    d: dict[str, Any] = {"type": type_, "description": description}
    d.update(extra)
    return d


class ToolError(Exception):
    """Erreur attendue d'un outil (message clair pour le modèle, pas de trace dans le journal)."""


@dataclass
class ToolResult:
    text: str = ""
    images: list[str] = field(default_factory=list)
    files: list[str] = field(default_factory=list)
    data: Any = None
    error: bool = False

    @staticmethod
    def err(msg: str) -> "ToolResult":
        return ToolResult(text=f"ERREUR : {msg}", error=True)


def _first_sentence(text: str, limit: int) -> str:
    t = re.sub(r"\s+", " ", text or "").strip()
    m = re.match(r"(.+?[.!?])(\s|$)", t)
    t = m.group(1) if m else t
    return t if len(t) <= limit else t[:limit - 1].rstrip() + "…"


def compact_schema(schema: dict) -> dict:
    params = json.loads(json.dumps(schema.get("parameters") or {}))
    for spec in (params.get("properties") or {}).values():
        if isinstance(spec, dict) and spec.get("description"):
            spec["description"] = _first_sentence(spec["description"], 70)
    return {"name": schema["name"], "description": _first_sentence(schema.get("description", ""), 160),
            "parameters": params}


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    func: Callable[..., Any]
    risk: str = "read"
    toolset: str = "core"
    trust: tuple[str, ...] = ("owner",)
    risk_fn: Callable[["ToolContext", dict], str] | None = None
    summary_fn: Callable[[dict], str] | None = None
    parallel_safe: bool = True

    def schema(self) -> dict:
        return {"name": self.name, "description": self.description, "parameters": self.parameters}

    def risk_for(self, ctx: "ToolContext", args: dict) -> str:
        if self.risk_fn:
            try:
                return self.risk_fn(ctx, args) or self.risk
            except Exception:  # noqa: BLE001
                return self.risk
        return self.risk

    def summary(self, args: dict) -> str:
        if self.summary_fn:
            try:
                return self.summary_fn(args)
            except Exception:  # noqa: BLE001
                pass
        short = {k: (v if not isinstance(v, str) or len(v) < 160 else v[:157] + "…") for k, v in args.items()}
        return f"{self.name} {jdump(short)}"


class ToolContext:
    """Ce que voit un outil pendant son exécution."""

    def __init__(self, zeus: "Zeus", session: dict, run: Any = None):
        self.zeus = zeus
        self.session = session
        self.run = run
        self.trust: str = session.get("trust", "owner")
        self.channel: str = session.get("channel", "web")
        self.peer: str = session.get("peer", "")
        self.call_id: str = ""

    @property
    def cfg(self):
        return self.zeus.config

    @property
    def db(self):
        return self.zeus.db

    @property
    def cancel(self) -> threading.Event:
        return self.run.cancel if self.run is not None else threading.Event()

    def emit(self, type_: str, **data: Any) -> None:
        root = getattr(self.run, "root_session", None) or self.session.get("id")
        depth = getattr(self.run, "depth", 0)
        self.zeus.bus.publish(type_, session_id=self.session.get("id"), root_session=root, depth=depth, **data)

    def resolve(self, path: str) -> Path:
        import os
        pth = Path(os.path.expandvars(os.path.expanduser(str(path or ".").strip().strip('"'))))
        if not pth.is_absolute():
            pth = self.cfg.workspace / pth
        return pth.resolve()


class Registry:
    def __init__(self) -> None:
        self.tools: dict[str, Tool] = {}
        self._lock = threading.Lock()

    def register(self, t: Tool) -> Tool:
        with self._lock:
            self.tools[t.name] = t
        return t

    def unregister_prefix(self, prefix: str) -> None:
        with self._lock:
            for k in [k for k in self.tools if k.startswith(prefix)]:
                del self.tools[k]

    def tool(self, name: str, description: str, params: dict | None = None, required: list[str] | None = None,
             risk: str = "read", toolset: str = "core", trust: tuple[str, ...] = ("owner",),
             risk_fn: Callable | None = None, summary: Callable | None = None, parallel_safe: bool = True):
        schema = {"type": "object", "properties": params or {}, "required": required or []}

        def deco(fn: Callable) -> Callable:
            self.register(Tool(name, description, schema, fn, risk, toolset, trust, risk_fn, summary, parallel_safe))
            return fn
        return deco

    def get(self, name: str) -> Tool | None:
        return self.tools.get(name)

    def names_for(self, trust: str, toolsets: set[str] | None) -> list[str]:
        out = []
        for t in self.tools.values():
            if trust not in t.trust and not (trust == "system" and "owner" in t.trust):
                continue
            if toolsets is not None and t.toolset not in toolsets:
                continue
            out.append(t.name)
        return out

    def schemas(self, names: list[str], compact: bool = False) -> list[dict]:
        """Descriptions des outils pour le modèle. compact=True : première phrase seulement (offres gratuites limitées
        en taille de requête, comme Groq : 10 à 25 % de jetons en moins)."""
        out = [self.tools[n].schema() for n in names if n in self.tools]
        return [compact_schema(s) for s in out] if compact else out

    def toolsets(self) -> dict[str, str]:
        present = {t.toolset for t in self.tools.values()}
        ts = {k: v for k, v in TOOLSETS.items() if k in present}
        for t in self.tools.values():
            if t.toolset.startswith("mcp:") and t.toolset not in ts:
                ts[t.toolset] = f"Serveur MCP « {t.toolset[4:]} »"
        return ts

    # ------------------------------------------------------------------ exécution
    @staticmethod
    def _coerce(tool: Tool, args: dict) -> dict:
        props = tool.parameters.get("properties", {})
        out: dict[str, Any] = {}
        for k, v in (args or {}).items():
            spec = props.get(k)
            if spec is None:
                continue
            typ = spec.get("type")
            try:
                if typ == "integer" and not isinstance(v, int):
                    v = int(float(v))
                elif typ == "number" and not isinstance(v, (int, float)):
                    v = float(v)
                elif typ == "boolean" and not isinstance(v, bool):
                    v = str(v).strip().lower() in ("1", "true", "oui", "yes", "vrai", "on")
                elif typ in ("array", "object") and isinstance(v, str):
                    try:
                        v = json.loads(v)
                    except Exception:
                        if typ == "array":
                            v = [s.strip() for s in v.split(",") if s.strip()]
                elif typ == "string" and not isinstance(v, str):
                    v = v if v is None else (jdump(v) if isinstance(v, (dict, list)) else str(v))
            except (TypeError, ValueError):
                pass
            out[k] = v
        return out

    def execute(self, ctx: ToolContext, name: str, args: dict) -> ToolResult:
        t = self.tools.get(name)
        if t is None:
            close = difflib.get_close_matches(name, list(self.tools), n=3, cutoff=0.5)
            hint = f" Outils proches : {', '.join(close)}." if close else ""
            return ToolResult.err(f"outil inconnu « {name} ».{hint} Utilise enable_tools pour charger "
                                  f"d'autres boîtes à outils.")
        if "_invalid_json" in (args or {}):
            return ToolResult.err("arguments JSON invalides. Renvoie l'appel avec un JSON correct.")
        clean = self._coerce(t, args or {})
        missing = [r for r in t.parameters.get("required", []) if clean.get(r) in (None, "")]
        if missing:
            return ToolResult.err(f"paramètre(s) obligatoire(s) manquant(s) : {', '.join(missing)}")
        try:
            res = t.func(ctx, **clean)
        except ToolError as e:
            log.debug("outil %s : %s", name, e)
            return ToolResult.err(str(e))
        except TypeError as e:
            log.debug("outil %s : %s", name, traceback.format_exc())
            return ToolResult.err(f"mauvais paramètres pour {name} : {e}")
        except Exception as e:  # noqa: BLE001
            log.warning("outil %s en échec : %s", name, traceback.format_exc())
            return ToolResult.err(f"{type(e).__name__} : {e}")
        if isinstance(res, ToolResult):
            return res
        if res is None:
            return ToolResult(text="OK")
        if isinstance(res, (dict, list)):
            return ToolResult(text=jdump(res, indent=1), data=res)
        return ToolResult(text=str(res))


REGISTRY = Registry()
tool = REGISTRY.tool


def spill(ctx: ToolContext, text: str, limit: int, label: str = "sortie") -> str:
    """Coupe une sortie trop longue et sauvegarde la version complète dans un fichier."""
    if len(text) <= limit:
        return text
    d = ctx.cfg.dir("outputs")
    import time as _t
    f = d / f"{label}_{int(_t.time() * 1000)}.txt"
    try:
        f.write_text(text, encoding="utf-8")
        note = f"version complète : {f} (lis-la avec read_file et offset)"
    except OSError:
        note = ""
    return truncate(text, limit, note)


def load_builtin_tools() -> None:
    """Importe les modules d'outils (ils s'enregistrent eux-mêmes)."""
    from . import brain, core_tools, computer, phone, dossiers, comms, browser, office, learning, secretary, knowledge  # noqa: F401
