"""La fiche « ZEUS sur lui-même » : ce qu'il est, ce qu'il sait faire, ses limites et ses vrais scores.

Sans elle, à « qu'est-ce que tu veux améliorer ? » ou « que sais-tu faire ? », le modèle invente une réponse
générique (« ma rapidité et ma précision… ») au lieu de dire ses vraies forces et faiblesses. La fiche est
construite à partir de l'état réel de ZEUS (version, modèles branchés, boîtes à outils, rôles, dernier banc d'essai,
erreurs signalées) et n'est ajoutée à la requête que lorsqu'on l'interroge sur lui-même : elle ne coûte rien aux
autres messages.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from . import __version__
from .util import norm

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

# Questions sur ZEUS lui-même (textes sans accents, en minuscules : voir util.norm)
SELF_HINTS = (
    "toi-meme", "toi meme", "tes capacites", "tes limites", "tes points faibles", "tes points forts", "tes forces",
    "tes faiblesses", "tes defauts", "qui es-tu", "qui es tu", "que sais-tu faire", "qu'est-ce que tu sais faire",
    "tu sais faire quoi", "tu peux faire quoi", "que peux-tu faire", "qu'est-ce que tu peux faire",
    "ameliorer chez toi", "t'ameliorer", "ameliorer en toi", "tu voudrais ameliorer", "tu veux ameliorer",
    "ta version", "quelle version es", "quelle version tu", "quel modele utilises", "quel modele tu",
    "tu utilises quel modele", "tu tournes sur", "quel cerveau", "ton cerveau", "ton fonctionnement",
    "comment tu fonctionnes", "comment tu marches", "ce que tu ne sais pas", "tu ne sais pas faire",
    "what can you do", "your limits", "who are you", "improve yourself",
)
_ZEUS_WORDS = ("ameliorer", "capacit", "limite", "version", "modele", "defaut", "faibl", "fort", "score", "sais faire")

# Fonctions écrites et testées par les tests automatiques, mais pas encore essayées en conditions réelles.
# À mettre à jour à chaque version (voir PROTOCOLES-DE-TEST.md).
UNTESTED = ("pilotage d'un vrai téléphone Android", "Telegram, WhatsApp et SMS réels",
            "Google Agenda avec un vrai compte", "la voix avec un vrai micro",
            "la vitesse du mini-cerveau local sur ce PC (python zeus.py mesure --mini)")


def about_self(query: str) -> bool:
    q = norm(query or "")
    if any(h in q for h in SELF_HINTS):
        return True
    return "zeus" in q and any(w in q for w in _ZEUS_WORDS)


def _sees_images(h) -> bool:
    if getattr(h, "vision", False):
        return True
    kind = str(h.cfg.get("provider") or "")
    model = norm(str(h.cfg.get("model") or ""))
    return kind == "anthropic" or any(x in model for x in ("vision", "-vl", "llava", "gpt-4o", "gpt-4.1", "gemini",
                                                            "scout", "maverick", "pixtral", "gemma3"))


def _bench(zeus: "Zeus") -> str:
    logs = zeus.config.dir("logs")
    files = sorted(Path(logs).glob("pedagogie-*.json"))
    if not files:
        return "Professeur de langue : pas encore mesuré (python zeus.py pedagogie)."
    try:
        rep = json.loads(files[-1].read_text(encoding="utf-8"))
        s = rep.get("summary") or {}
        return (f"Professeur de langue, banc d'essai du {rep.get('date', '?')} : {s.get('errors_found', '?')}/"
                f"{s.get('errors_expected', '?')} fautes trouvées, {s.get('traps_clean', '?')}/{s.get('traps', '?')} "
                f"phrases justes laissées tranquilles, {s.get('false_corrections', '?')} fausse(s) correction(s), "
                f"{s.get('failed_runs', 0)} phrase(s) sans réponse.")
    except (OSError, ValueError):
        return "Professeur de langue : dernier banc d'essai illisible."


def card(zeus: "Zeus") -> str:
    from . import modes
    from .tools import TOOLSETS
    lines = [f"FICHE « {zeus.config.assistant_name} SUR LUI-MÊME » (version {__version__}) — réponds sur toi à partir "
             "de cette fiche : n'invente ni capacité ni performance, cite tes vrais chiffres et tes vraies limites."]
    models = []
    for h in zeus.router.handles:
        where = "sur ce PC" if h.is_local else "en ligne"
        models.append(f"{h.label} ({where}, images : {'oui' if _sees_images(h) else 'non'})")
    lines.append("Cerveau : " + ("; ".join(models) or "aucun modèle branché") + ". Ton intelligence est celle de ces "
                 "modèles ; ce qui t'appartient : ta mémoire, tes compétences, tes procédures, la bibliothèque de "
                 "documents, l'agenda et les cartes de révision, tous sur le PC du propriétaire.")
    limits = []
    if any("groq.com" in str(h.cfg.get("base_url") or "") for h in zeus.router.handles):
        limits.append("Groq gratuit : 8 000 jetons par minute et 200 000 par jour et par modèle ; une leçon de langue "
                      "en consomme 4 000 à 5 000 par requête, d'où des attentes et une limite atteinte après quelques "
                      "dizaines d'échanges lourds")
    if any(h.is_local for h in zeus.router.handles):
        limits.append("le modèle local sert de secours en « mini-cerveau » (consignes courtes, sans internet ni "
                      "outils) : environ une minute par réponse sur ce PC sans carte graphique, une à deux minutes "
                      "pour la première")
    if not any(_sees_images(h) for h in zeus.router.handles if not h.is_local):
        limits.append("le modèle en ligne actuel ne voit pas les images (captures, photos)")
    limits.append("pas encore essayé en conditions réelles : " + ", ".join(UNTESTED))
    lines.append("Limites connues : " + " ; ".join(limits) + ".")
    lines.append("Boîtes à outils : " + " ; ".join(f"{k} = {v.split(':')[0].split('(')[0].strip()}"
                                                  for k, v in TOOLSETS.items()) + ".")
    lines.append("Rôles : " + ", ".join(m["label"] for m in modes.MODES.values()) + ".")
    lines.append("Mesures réelles : " + _bench(zeus))
    try:
        n = zeus.db.one("SELECT COUNT(*) n FROM feedback WHERE status='nouveau'") or {}
        lines.append(f"Erreurs signalées par le propriétaire (bouton « ZEUS s'est trompé ») et pas encore traitées : "
                     f"{n.get('n', 0)}.")
    except Exception:  # noqa: BLE001
        pass
    lines.append("Pistes d'amélioration prévues (ROADMAP.md) : projets et moteur de contexte, missions suivies, agents "
                 "spécialisés, vérification des réponses importantes, vision, cerveau local sur un PC avec carte "
                 "graphique.")
    return "\n".join(lines)


__all__ = ["about_self", "card", "SELF_HINTS"]
