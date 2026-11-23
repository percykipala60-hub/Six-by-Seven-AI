"""Test de niveau adaptatif (CECRL A1 → C2), comme les tests de positionnement en ligne.

Principe (théorie de la réponse à l'item, simplifiée) : chaque question a un niveau b (1 = A1 … 6 = C2).
La probabilité qu'une personne de niveau θ réponde juste est p = 0,25 + 0,75 · σ(1,7 · (θ − b + 0,5)) : 25 %
au hasard (4 choix), environ 70 % de réussite quand on est au milieu du niveau b. Après chaque réponse, ZEUS
recalcule la distribution de θ (grille de 0 à 6,5, a priori centré sur B1 ou sur le dernier résultat) et pose la
question suivante là où elle apprend le plus : au niveau qui encadre la meilleure estimation. Le test s'arrête
après 10 à 16 questions, dès que l'estimation est assez précise.
"""

from __future__ import annotations

import math
import random
import secrets
from typing import TYPE_CHECKING, Any

from .placement_bank import BANK

if TYPE_CHECKING:  # pragma: no cover
    from .store import Store

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
GRID = [i / 20 for i in range(0, 131)]  # 0 → 6,5
MIN_Q, MAX_Q, TARGET_SD = 10, 16, 0.42
LEVEL_DESC = {
    "A1": "débutant : tu comprends et utilises des expressions familières et des phrases très simples.",
    "A2": "élémentaire : tu communiques dans des situations simples et habituelles.",
    "B1": "intermédiaire : tu te débrouilles en voyage et tu racontes un événement, une expérience.",
    "B2": "intermédiaire avancé : tu argumentes et tu discutes avec aisance avec un locuteur natif.",
    "C1": "avancé : tu t'exprimes couramment et avec précision, y compris dans un cadre professionnel.",
    "C2": "maîtrise : tu comprends pratiquement tout et tu nuances finement ta pensée.",
}


def p_correct(theta: float, b: int) -> float:
    return 0.25 + 0.75 / (1.0 + math.exp(-1.7 * (theta - b + 0.5)))


def posterior(answers: list[dict], prior_mean: float = 3.0, prior_sd: float = 1.6) -> tuple[float, float]:
    """Moyenne et écart-type a posteriori de θ."""
    logs = []
    for t in GRID:
        lp = -((t - prior_mean) ** 2) / (2 * prior_sd ** 2)
        for a in answers:
            p = p_correct(t, a["level"])
            lp += math.log(p if a["ok"] else 1 - p)
        logs.append(lp)
    m = max(logs)
    w = [math.exp(x - m) for x in logs]
    tot = sum(w)
    mean = sum(t * x for t, x in zip(GRID, w)) / tot
    var = sum((t - mean) ** 2 * x for t, x in zip(GRID, w)) / tot
    return mean, math.sqrt(var)


def level_of(theta: float) -> str:
    """θ ≈ n quand on réussit les questions jusqu'au niveau n et qu'on échoue au-dessus."""
    return LEVELS[max(1, min(6, int(math.floor(theta + 0.5)))) - 1]


def item_id(lang: str, idx: int) -> str:
    return f"{lang}-{idx}"


class Placement:
    """Un test en cours, sauvegardé dans la base (on peut fermer la page et reprendre)."""

    def __init__(self, db: "Store"):
        self.db = db

    def start(self, lang: str) -> dict:
        if lang not in BANK:
            raise ValueError("langue non prise en charge (en, es, de, fr)")
        prev = self.db.placement_history(lang, 1)
        prior = 3.0
        if prev and prev[0].get("level") in LEVELS:
            prior = LEVELS.index(prev[0]["level"]) + 1.5
        pid = secrets.token_hex(6)
        state = {"lang": lang, "prior": prior, "answers": [], "asked": [], "current": None,
                 "seed": secrets.randbelow(10 ** 9)}
        self._next(state)
        self.db.placement_save(pid, lang, state)
        return self.view(pid, state)

    def _next(self, state: dict) -> None:
        theta, _ = posterior(state["answers"], state["prior"])
        target = max(1, min(6, round(theta + 0.5)))
        items = BANK[state["lang"]]
        asked = set(state["asked"])
        # alterne grammaire et vocabulaire quand c'est possible
        last_skill = items[state["asked"][-1]][1] if state["asked"] else ""
        rnd = random.Random(state["seed"] + len(state["asked"]))
        for dist in range(0, 6):
            for lvl in ([target] if dist == 0 else [target + dist, target - dist]):
                pool = [i for i, it in enumerate(items) if it[0] == lvl and i not in asked]
                if not pool:
                    continue
                other = [i for i in pool if items[i][1] != last_skill]
                choice = rnd.choice(other or pool)
                opts = list(range(4))
                rnd.shuffle(opts)
                state["current"] = {"idx": choice, "order": opts}
                return
        state["current"] = None

    def view(self, pid: str, state: dict, feedback: dict | None = None) -> dict:
        out: dict[str, Any] = {"id": pid, "lang": state["lang"], "n": len(state["answers"]), "max": MAX_Q,
                               "min": MIN_Q}
        if feedback:
            out["feedback"] = feedback
        if state.get("result"):
            out["result"] = state["result"]
            return out
        cur = state.get("current")
        if cur:
            lvl, skill, prompt, options, _ = BANK[state["lang"]][cur["idx"]]
            out["question"] = {"prompt": prompt, "skill": skill, "options": [options[i] for i in cur["order"]]}
        theta, sd = posterior(state["answers"], state["prior"])
        out["estimate"] = level_of(theta) if state["answers"] else ""
        return out

    def answer(self, pid: str, choice: int) -> dict:
        row = self.db.placement_get(pid)
        if not row:
            raise KeyError("test introuvable")
        state = row["state"]
        if state.get("result"):
            return self.view(pid, state)
        cur = state.get("current")
        if not cur or not 0 <= int(choice) < 4:
            raise ValueError("réponse invalide")
        lvl, skill, prompt, options, expl = BANK[state["lang"]][cur["idx"]]
        picked = cur["order"][int(choice)]
        ok = picked == 0
        state["answers"].append({"idx": cur["idx"], "level": lvl, "ok": ok, "skill": skill})
        state["asked"].append(cur["idx"])
        feedback = {"ok": ok, "correct": options[0], "explanation": expl, "picked": options[picked]}
        theta, sd = posterior(state["answers"], state["prior"])
        n = len(state["answers"])
        state["current"] = None
        if n >= MAX_Q or (n >= MIN_Q and sd <= TARGET_SD):
            state["result"] = self._result(state, theta, sd)
        else:
            self._next(state)
            if state["current"] is None:  # banque épuisée
                state["result"] = self._result(state, theta, sd)
        self.db.placement_save(pid, state["lang"], state, finished=bool(state.get("result")),
                               level=(state.get("result") or {}).get("level", ""))
        return self.view(pid, state, feedback)

    def _result(self, state: dict, theta: float, sd: float) -> dict:
        lvl = level_of(theta)
        by_level: dict[str, list[int]] = {}
        by_skill: dict[str, list[int]] = {}
        for a in state["answers"]:
            by_level.setdefault(LEVELS[a["level"] - 1], [0, 0])
            by_level[LEVELS[a["level"] - 1]][0] += int(a["ok"])
            by_level[LEVELS[a["level"] - 1]][1] += 1
            by_skill.setdefault(a["skill"], [0, 0])
            by_skill[a["skill"]][0] += int(a["ok"])
            by_skill[a["skill"]][1] += 1
        idx = LEVELS.index(lvl)
        frac = max(0.0, min(0.999, theta - (idx + 1) + 0.5))
        position = "début" if frac < 0.34 else ("milieu" if frac < 0.67 else "fin")
        weak = [s for s, (ok, n) in by_skill.items() if n and ok / n < 0.5]
        score = round(max(0.0, min(100.0, (theta / 6.0) * 100)))
        return {
            "level": lvl, "theta": round(theta, 2), "sd": round(sd, 2), "position": position, "score": score,
            "description": LEVEL_DESC[lvl], "next": LEVELS[idx + 1] if idx < 5 else "",
            "by_level": by_level, "by_skill": by_skill, "weak": weak,
            "correct": sum(1 for a in state["answers"] if a["ok"]), "total": len(state["answers"]),
            "note": "Test écrit (grammaire et vocabulaire). L'oral et la rédaction sont évalués en cours avec ZEUS.",
        }


__all__ = ["Placement", "LEVELS", "posterior", "p_correct", "level_of"]
