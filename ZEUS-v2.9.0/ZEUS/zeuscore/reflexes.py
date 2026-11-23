"""Réflexes sans IA : des réponses instantanées, gratuites et toujours justes, sans appeler aucun modèle.

Heure, date, calcul simple, agenda du jour ou du lendemain : ZEUS répond en une fraction de seconde, même quand
Groq est bloqué ou qu'internet est coupé, et sans dépenser un seul jeton. Les formulations reconnues sont volontairement
strictes (toute la phrase doit correspondre) : au moindre doute, la demande part au cerveau habituel.
Désactivés dans les rôles où la phrase est un exercice (professeur de langue, interprète, enseignant).
"""

from __future__ import annotations

import ast
import datetime as _dt
import operator
import re
import time
from typing import TYPE_CHECKING

from . import modes
from .util import fr_datetime, norm

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

ROLES = ("assistant", "secretaire", "formateur", "dirigeant", "rh", "chercheur")

_END = r"\s*[?!.]*\s*$"
_HELLO = r"^(?:(?:zeus|dis|dis-moi|dis moi|stp|s'il te plait)[ ,]+)*"
TIME = re.compile(_HELLO + r"(?:quelle heure (?:est-il|est il|il est)|il est quelle heure|quelle heure|l'heure"
                  r"|what time is it)(?: (?:maintenant|svp|stp|s'il te plait|actuellement))?" + _END)
DATE = re.compile(_HELLO + r"(?:(?:on est|nous sommes|c'est) quel jour(?: aujourd'hui)?|quel jour (?:sommes-nous|sommes nous"
                  r"|on est|est-on|est on|est-ce|est ce|sommes-nous aujourd'hui|on est aujourd'hui)"
                  r"|quelle (?:est la )?date(?: d'aujourd'hui| aujourd'hui| sommes-nous| on est)?"
                  r"|on est le combien(?: aujourd'hui)?|c'est quoi la date(?: d'aujourd'hui)?"
                  r"|what(?:'s| is) the date(?: today)?|what day is it(?: today)?)" + _END)
AGENDA = re.compile(_HELLO + r"(?:qu'est-ce que j'ai|qu'est ce que j'ai|j'ai quoi|quoi de prevu|qu'est-ce qui est prevu"
                    r"|mon agenda|mes rendez-vous|mes rdv|mon programme)(?: de prevu)?"
                    r"\s*(?:pour |de |d')?(aujourd'hui|ce jour|demain)" + _END)
_EXPR = r"([-+*/x×÷:^%().,\d\s]+?|\d+(?:[.,]\d+)?\s*%\s*de\s*\d+(?:[.,]\d+)?)"
# « combien font 12 x 7 ? », « calcule 15 % de 230 »
CALC_ASK = re.compile(_HELLO + r"(?:combien (?:font|fait|ca fait)|calcule|calcul|ca fait combien)\s*:?\s*" + _EXPR
                      + r"\s*=?" + _END)
# Calcul tapé seul : « 12*7 », « 3+4= », « 15% de 230 ». Pas « 11:30 », « 3-1 » ni « 12/11 » (heure, score, date).
CALC_BARE = re.compile(r"^" + _EXPR + r"\s*(=)?" + _END)
PERCENT = re.compile(r"^(\d+(?:[.,]\d+)?)\s*%\s*de\s*(\d+(?:[.,]\d+)?)$")

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Pow: operator.pow, ast.Mod: operator.mod, ast.USub: operator.neg, ast.UAdd: operator.pos}


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        a, b = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and (abs(b) > 64 or abs(a) > 1e6):
            raise ValueError("puissance trop grande")
        return _OPS[type(node.op)](a, b)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    raise ValueError("expression non prise en charge")


def _num(x: float) -> str:
    if isinstance(x, float) and x.is_integer() and abs(x) < 1e15:
        x = int(x)
    if isinstance(x, int):
        return f"{x:,}".replace(",", " ")
    s = f"{x:,.6f}".rstrip("0").rstrip(".").replace(",", " ").replace(".", ",")
    return s


def calculate(expr: str) -> str | None:
    """« 12 x 7 », « (3+4)*2 », « 15 % de 230 » → résultat ; None si ce n'est pas un calcul simple."""
    e = expr.strip().rstrip("=").strip()
    m = PERCENT.match(e)
    if m:
        a, b = (float(v.replace(",", ".")) for v in m.groups())
        return f"{_num(a)} % de {_num(b)} = {_num(round(a * b / 100, 6))}"
    if not re.search(r"\d", e) or not re.search(r"\d\s*[-+*/x×÷:^%]\s*[-(\d]", e):
        return None  # un nombre seul n'est pas un calcul
    py = (e.replace("×", "*").replace("÷", "/").replace(":", "/").replace("^", "**")
          .replace(",", ".").replace(" ", ""))
    py = re.sub(r"(?<=[\d)])x(?=[\d(])", "*", py)
    if re.search(r"[^\d.+\-*/%()]", py) or len(py) > 80:
        return None
    try:
        value = _eval(ast.parse(py, mode="eval"))
    except ZeroDivisionError:
        return "Division par zéro : pas de résultat."
    except (SyntaxError, ValueError, TypeError, OverflowError):
        return None
    if isinstance(value, float):
        value = round(value, 10)
    return f"{e.replace('*', '×')} = {_num(value)}"


def _agenda(zeus: "Zeus", which: str) -> str:
    d = _dt.date.today() + _dt.timedelta(days=1 if which == "demain" else 0)
    t0 = time.mktime(d.timetuple())
    rows = zeus.db.list_events(t0, t0 + 86399)
    label = "Demain" if which == "demain" else "Aujourd'hui"
    if not rows:
        return f"{label}, rien de prévu dans ton agenda."
    lines = []
    for e in rows:
        start = _dt.datetime.fromtimestamp(e["start"])
        where = f" ({e['location']})" if e.get("location") else ""
        lines.append(f"- {start:%H:%M} : {e['title']}{where}")
    return f"{label}, {len(rows)} rendez-vous :\n" + "\n".join(lines)


def answer(zeus: "Zeus", session: dict, text: str) -> str | None:
    """La réponse immédiate à une demande simple, ou None (la demande part au cerveau habituel)."""
    if zeus.config.get("agent.reflexes", True) is False:
        return None
    if modes.get(session).get("id", "assistant") not in ROLES:
        return None
    raw = (text or "").strip()
    if not raw or len(raw) > 120 or "\n" in raw:
        return None
    q = norm(raw)
    if TIME.match(q):
        now = time.localtime()
        return f"Il est {now.tm_hour} h {now.tm_min:02d}."
    if DATE.match(q):
        day = fr_datetime().split(", ")[0]
        return f"Nous sommes le {day}."
    m = AGENDA.match(q)
    if m:
        return _agenda(zeus, "demain" if m.group(1) == "demain" else "aujourd'hui")
    m = CALC_ASK.match(q)
    if m:
        return calculate(m.group(1))
    m = CALC_BARE.match(q)
    if m and (m.group(2) or re.search(r"[+*×^]|\dx\d|\d x \d|%\s*de", m.group(1))):
        return calculate(m.group(1))
    return None


__all__ = ["answer", "calculate"]
