"""Mini-cerveau local : la requête légère envoyée au modèle local quand il remplace un modèle en ligne.

Sur un PC sans carte graphique, un modèle local lit environ 10 à 20 jetons par seconde. La requête complète de ZEUS
(4 000 à 6 000 jetons : consignes, outils, conversation) lui demande donc 4 à 8 minutes avant le premier mot. Quand
Groq est bloqué ou qu'internet coupe, ZEUS envoie à la place :

- des consignes courtes (300 à 700 jetons) qui ne changent pas d'un message à l'autre : le modèle local les garde en
  mémoire (cache d'Ollama) et ne les relit pas à chaque fois ;
- un seul message qui contient les derniers échanges (raccourcis) et le nouveau message ;
- aucun outil : le mini-cerveau converse, explique, corrige, traduit ; les actions attendent le retour du cerveau
  en ligne.

Les consignes sont placées avant les échanges pour tous les modèles (y compris Mistral, dont le modèle de dialogue
met les consignes juste avant le dernier message) : leur début est identique d'une requête à l'autre, c'est ce qui
permet au modèle local de les reprendre de sa mémoire. Le préchauffage (voir llm.ModelHandle.warm) charge le modèle
et ces consignes pendant que ZEUS attend encore Groq.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from . import modes
from .util import estimate_tokens, fr_datetime, truncate

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

HISTORY_TOKENS = 350      # derniers échanges, raccourcis
MESSAGE_CHARS = 2500      # nouveau message de l'utilisateur
RESULT_CHARS = 500        # résultat d'outil déjà obtenu par le cerveau en ligne (au plus 3)

BASE = """Tu es {name}, l'assistant personnel de {owner}. Nous sommes le {date}.
Tu fonctionnes en MODE SECOURS, sur l'ordinateur de {owner} : le cerveau en ligne est momentanément indisponible.
Tu n'as ni internet ni outils : tu ne peux ni chercher, ni envoyer de message, ni toucher au téléphone ou aux fichiers.
- Réponds directement et brièvement (1 à 5 phrases), dans la langue de {owner} (français par défaut).
- Conversation, conseil, explication, rédaction courte, correction, traduction : fais-le.
- Demande qui exige d'agir ou une information récente (envoi, recherche, météo, actualité, prix, agenda) : dis en une
  phrase que tu ne peux pas le faire en mode secours et propose de le redemander dans quelques minutes.
- Ne devine jamais un fait que tu ne connais pas : dis que tu n'es pas sûr."""

LANGUAGE = """
Rôle : professeur {de_target} de {owner}{level}. Chaleureux et exigeant, réponses courtes.
À chaque NOUVEAU message écrit en {target} :
1. Réponds en {target} (1 à 3 phrases simples, à son niveau) en reprenant naturellement la forme correcte, puis pose
   UNE question de relance.
2. Tout à la fin, une section « ✏️ Corrections » : au plus 3 fautes du nouveau message seulement, chacune sous la
   forme « passage fautif » → « correction » : règle en moins de 15 mots, en {native}. Message sans faute : pas de
   section. Ne corrige jamais une tournure correcte, ni la ponctuation, ni une majuscule en début de phrase.
S'il écrit en {native} : montre comment le dire en {target} et invite-le à essayer.
{notes}"""

ROLE_LINES = {
    "secretaire": "Rôle : secrétaire de {owner}. Aide à rédiger courriers et messages ; l'agenda, les envois et les "
                  "factures attendront le retour du cerveau en ligne.",
    "enseignant": "Rôle : enseignant ({subject}{level}). Explique pas à pas avec un exemple simple, puis pose une "
                  "question pour vérifier que c'est compris.",
    "formateur": "Rôle : conseiller pédagogique d'un enseignant ou formateur.",
    "dirigeant": "Rôle : conseiller du dirigeant : réponses structurées, chiffres prudents.",
    "rh": "Rôle : assistant ressources humaines : précis, prudent sur le droit (à vérifier ensuite).",
    "chercheur": "Rôle : assistant de recherche : rigoureux, signale ce qui reste à vérifier dans les sources.",
}

INTERPRETER = """
Rôle : interprète entre {a} et {b}. Traduis fidèlement chaque nouveau message dans l'autre langue, sans commentaire
ni explication : seulement la traduction."""


def _memories(zeus: "Zeus") -> str:
    try:
        rows = zeus.db.core_memories(5)
    except Exception:  # noqa: BLE001
        return ""
    lines = [f"- {truncate(str(m['content']).replace(chr(10), ' '), 140)}" for m in rows]
    return ("\nCe que tu sais de {owner} :\n" + "\n".join(lines)) if lines else ""


def system_prompt(zeus: "Zeus", session: dict) -> str:
    """Consignes du mini-cerveau. Identiques d'un message à l'autre pour une même conversation et une même journée."""
    cfg = zeus.config
    owner = cfg.owner_name or "ton propriétaire"
    mode = modes.get(session)
    mid = mode.get("id", "assistant")
    text = BASE.format(name=cfg.assistant_name, owner=owner, date=fr_datetime().split(", ")[0])
    text += _memories(zeus).replace("{owner}", owner)
    level = f", niveau {mode['level']}" if mode.get("level") else ""
    if mid == "prof_langue":
        lang = mode.get("lang", "en")
        target = modes.lang_name(lang)
        text += LANGUAGE.format(de_target=modes.de(target), target=target, owner=owner, level=level,
                                native=modes.lang_name(mode.get("native", "fr")), notes=modes.LANG_NOTES.get(lang, ""))
    elif mid == "interprete":
        text += INTERPRETER.format(a=modes.lang_name(mode.get("lang", "fr")), b=modes.lang_name(mode.get("lang2", "en")))
    elif mid in ROLE_LINES:
        text += "\n" + ROLE_LINES[mid].format(owner=owner, subject=mode.get("subject") or "toutes matières", level=level)
    meta = session.get("meta") or {}
    ch = session.get("channel", "web")
    if ch == "voice" or meta.get("voice"):
        text += "\nRéponse lue à voix haute : phrases courtes, sans mise en forme ni emoji."
    elif ch in ("telegram", "whatsapp", "sms"):
        text += "\nMessage court, sans tableau."
    return text


_CORR = re.compile(r"\n\s*[*_#\s]*✏.*", re.S)


def _plain(m: dict) -> str:
    c = m.get("content")
    if isinstance(c, list):
        parts = []
        for p in c:
            if p.get("type") == "text":
                parts.append(p.get("text", ""))
            elif p.get("type") == "image":
                parts.append("[image jointe, invisible en mode secours]")
        c = " ".join(parts)
    return re.sub(r"\s+", " ", _CORR.sub("", str(c or ""))).strip()


def build(zeus: "Zeus", session_id: str) -> tuple[list[dict], None]:
    """Requête du mini-cerveau : (messages, outils). Toujours deux messages : consignes, puis un message unique."""
    session = zeus.db.get_session(session_id) or {}
    owner = zeus.config.owner_name or "Moi"
    name = zeus.config.assistant_name
    every = zeus.db.get_messages(session_id)
    msgs = [m for m in every
            if m["role"] in ("user", "assistant") and not m.get("tool_calls")
            and not (m.get("meta") or {}).get("auto") and not (m.get("meta") or {}).get("error")]
    last_user = max((i for i, m in enumerate(msgs) if m["role"] == "user"), default=-1)
    new = truncate(_plain(msgs[last_user]), MESSAGE_CHARS) if last_user >= 0 else ""
    # Le cerveau en ligne a peut-être déjà appelé des outils pour cette demande avant de tomber : on garde leurs
    # résultats (les derniers, raccourcis), pour que le mini-cerveau puisse terminer la réponse.
    results: list[str] = []
    if last_user >= 0:
        start = next((i for i, m in enumerate(every) if m["id"] == msgs[last_user]["id"]), len(every))
        for m in every[start + 1:]:
            if m["role"] == "tool" and not (m.get("meta") or {}).get("error"):
                results.append(f"- {m.get('name') or 'outil'} : {truncate(_plain(m), RESULT_CHARS)}")
    if results:
        new += "\n\n[Résultats déjà obtenus par tes outils pour cette demande]\n" + "\n".join(results[-3:])
    history: list[str] = []
    used = 0
    for m in reversed(msgs[:last_user] if last_user >= 0 else msgs):
        line = f"{owner if m['role'] == 'user' else name} : {truncate(_plain(m), 300)}"
        cost = estimate_tokens(line) + 2
        if used + cost > HISTORY_TOKENS:
            break
        history.insert(0, line)
        used += cost
    if history:
        body = ("[Derniers échanges, pour le contexte]\n" + "\n".join(history) +
                f"\n\n[Nouveau message de {owner} : réponds à celui-ci]\n{new}")
    else:
        body = new or "Bonjour"
    return [{"role": "system", "content": system_prompt(zeus, session)}, {"role": "user", "content": body}], None


def size(zeus: "Zeus", session_id: str) -> int:
    """Taille estimée de la requête du mini-cerveau, en jetons (pour les mesures et les tests)."""
    msgs, _ = build(zeus, session_id)
    return sum(estimate_tokens(str(m["content"])) + 4 for m in msgs)


__all__ = ["build", "system_prompt", "size"]
