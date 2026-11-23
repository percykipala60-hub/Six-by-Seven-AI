"""Planificateur : rappels et tâches automatiques, en français naturel ou en cron."""

from __future__ import annotations

import datetime as _dt
import re
import threading
import time
from typing import TYPE_CHECKING

from .util import log, norm, truncate

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

DAYS = {"lundi": 0, "mardi": 1, "mercredi": 2, "jeudi": 3, "vendredi": 4, "samedi": 5, "dimanche": 6,
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
        "lun": 0, "mar": 1, "mer": 2, "jeu": 3, "ven": 4, "sam": 5, "dim": 6,
        "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
UNITS = {"s": 1, "sec": 1, "seconde": 1, "secondes": 1, "m": 60, "min": 60, "mn": 60, "minute": 60, "minutes": 60,
         "h": 3600, "heure": 3600, "heures": 3600, "hour": 3600, "hours": 3600, "j": 86400, "jour": 86400,
         "jours": 86400, "day": 86400, "days": 86400, "semaine": 604800, "semaines": 604800, "week": 604800,
         "weeks": 604800}
UNIT_RE = r"(secondes?|sec|s|minutes?|min|mn|m|heures?|hours?|h|jours?|days?|j|semaines?|weeks?)"


def _time_of(t: str, default: tuple[int, int] | None = None) -> tuple[int, int] | None:
    m = re.search(r"\b(\d{1,2})\s*(?:h|:|heures?)\s*(\d{2})?\b", t)
    if m:
        h, mi = int(m.group(1)), int(m.group(2) or 0)
        if "pm" in t and h < 12:
            h += 12
        if 0 <= h < 24 and 0 <= mi < 60:
            return h, mi
    m = re.search(r"\b(\d{1,2})\s*(am|pm)\b", t)
    if m:
        h = int(m.group(1)) % 12 + (12 if m.group(2) == "pm" else 0)
        return h, 0
    if "midi" in t:
        return 12, 0
    if "minuit" in t:
        return 0, 0
    if "matin" in t:
        return default or (8, 0)
    if "soir" in t:
        return default or (20, 0)
    if "apres-midi" in t or "apres midi" in t:
        return default or (15, 0)
    return default


def _at(day: _dt.date, hm: tuple[int, int]) -> float:
    return _dt.datetime(day.year, day.month, day.day, hm[0], hm[1]).timestamp()


# --------------------------------------------------------------------------- cron
def _cron_field(field: str, lo: int, hi: int) -> set[int]:
    vals: set[int] = set()
    for part in field.split(","):
        step = 1
        if "/" in part:
            part, s = part.split("/", 1)
            step = int(s)
        if part in ("*", ""):
            a, b = lo, hi
        elif "-" in part:
            a, b = (int(x) for x in part.split("-", 1))
        else:
            a = b = int(part)
        vals.update(range(a, b + 1, step))
    return {v for v in vals if lo <= v <= hi}


def cron_next(expr: str, after: float) -> float:
    f = expr.split()
    if len(f) != 5:
        raise ValueError("cron : 5 champs attendus (minute heure jour mois jour_semaine)")
    mins, hours = _cron_field(f[0], 0, 59), _cron_field(f[1], 0, 23)
    doms, months = _cron_field(f[2], 1, 31), _cron_field(f[3], 1, 12)
    dows = {d % 7 for d in _cron_field(f[4].replace("7", "0"), 0, 6)}  # 0 = dimanche (cron)
    dom_any, dow_any = f[2] == "*", f[4] == "*"
    t = _dt.datetime.fromtimestamp(after).replace(second=0, microsecond=0) + _dt.timedelta(minutes=1)
    for _ in range(366 * 2):
        cron_dow = (t.weekday() + 1) % 7
        day_ok = (t.month in months and
                  ((t.day in doms or cron_dow in dows) if not dom_any and not dow_any else
                   (t.day in doms if not dom_any else True) and (cron_dow in dows if not dow_any else True)))
        if day_ok:
            for h in sorted(hours):
                if h < t.hour:
                    continue
                for mi in sorted(mins):
                    if h == t.hour and mi < t.minute:
                        continue
                    return t.replace(hour=h, minute=mi).timestamp()
        t = (t + _dt.timedelta(days=1)).replace(hour=0, minute=0)
    raise ValueError("cron : aucune date trouvée dans les 2 prochaines années")


# --------------------------------------------------------------------------- spécifications
def next_run(spec: str, after: float | None = None) -> float | None:
    now = after or time.time()
    kind, _, rest = spec.partition(" ")
    if kind == "once":
        return None
    if kind == "every":
        m = re.match(r"(\d+)\s*([smhdw])", rest)
        if not m:
            raise ValueError(spec)
        mult = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}[m.group(2)]
        return now + int(m.group(1)) * mult
    if kind == "daily":
        h, mi = (int(x) for x in rest.split(":"))
        today = _dt.date.fromtimestamp(now)
        ts = _at(today, (h, mi))
        return ts if ts > now + 1 else _at(today + _dt.timedelta(days=1), (h, mi))
    if kind == "weekly":
        days_s, hm = rest.split()
        days = [DAY_CODES.index(d) for d in days_s.split(",")]
        h, mi = (int(x) for x in hm.split(":"))
        today = _dt.date.fromtimestamp(now)
        for i in range(0, 8):
            d = today + _dt.timedelta(days=i)
            if d.weekday() in days:
                ts = _at(d, (h, mi))
                if ts > now + 1:
                    return ts
    if kind == "monthly":
        dd, hm = rest.split()
        h, mi = (int(x) for x in hm.split(":"))
        d0 = _dt.date.fromtimestamp(now)
        for k in range(0, 14):
            y, mo = d0.year + (d0.month - 1 + k) // 12, (d0.month - 1 + k) % 12 + 1
            try:
                ts = _at(_dt.date(y, mo, int(dd)), (h, mi))
            except ValueError:
                continue
            if ts > now + 1:
                return ts
    if kind == "cron":
        return cron_next(rest, now)
    raise ValueError(f"spécification inconnue : {spec}")


def parse_schedule(when: str, now: float | None = None) -> tuple[str, float]:
    """Texte naturel → (spécification canonique, prochaine exécution)."""
    now = now or time.time()
    raw = (when or "").strip()
    t = norm(raw).replace("’", "'")
    today = _dt.date.fromtimestamp(now)
    if not t:
        raise ValueError("indique quand (ex. « dans 10 min », « chaque jour à 8h »)")
    # cron brut
    if re.fullmatch(r"([\d*/,\-]+\s+){4}[\d*/,\-]+", raw.strip()):
        spec = "cron " + raw.strip()
        return spec, cron_next(raw.strip(), now)
    # date/heure explicite
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?", t)
    m2 = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", t)
    if m or m2:
        if m:
            d = _dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            hm = (int(m.group(4)), int(m.group(5))) if m.group(4) else (_time_of(t) or (9, 0))
        else:
            d = _dt.date(int(m2.group(3)), int(m2.group(2)), int(m2.group(1)))  # type: ignore[union-attr]
            hm = _time_of(t[m2.end():] if m2 else t) or (9, 0)  # type: ignore[union-attr]
        ts = _at(d, hm)
        if ts <= now:
            raise ValueError("cette date est déjà passée")
        return f"once {_dt.datetime.fromtimestamp(ts):%Y-%m-%dT%H:%M}", ts
    # relatif : dans 20 min / in 2 hours
    m = re.search(r"\b(?:dans|in)\s+(\d+(?:[.,]\d+)?)\s*" + UNIT_RE + r"\b", t)
    if m:
        secs = float(m.group(1).replace(",", ".")) * UNITS[m.group(2)]
        ts = now + max(30, secs)
        return f"once {_dt.datetime.fromtimestamp(ts):%Y-%m-%dT%H:%M}", ts
    if re.search(r"\bdans (une|un) (heure|minute|jour|semaine)\b", t):
        unit = re.search(r"\bdans (?:une|un) (heure|minute|jour|semaine)\b", t).group(1)  # type: ignore[union-attr]
        ts = now + UNITS[unit]
        return f"once {_dt.datetime.fromtimestamp(ts):%Y-%m-%dT%H:%M}", ts
    if "demi-heure" in t or "demi heure" in t:
        ts = now + 1800
        return f"once {_dt.datetime.fromtimestamp(ts):%Y-%m-%dT%H:%M}", ts
    # intervalles : toutes les 2 heures / every 30 minutes / chaque heure
    m = re.search(r"\b(?:toutes les|tous les|every|chaque)\s+(\d+)\s*" + UNIT_RE + r"\b", t)
    if m:
        n, unit = int(m.group(1)), UNITS[m.group(2)]
        code = {1: "s", 60: "m", 3600: "h", 86400: "d", 604800: "w"}[unit]
        spec = f"every {n}{code}"
        return spec, now + n * unit
    if re.search(r"\b(chaque heure|toutes les heures|every hour|hourly)\b", t):
        return "every 1h", now + 3600
    hm = _time_of(t)
    # jours ouvrés / week-end
    if re.search(r"en semaine|jours ouvr|du lundi au vendredi|weekdays", t):
        hm = hm or (8, 0)
        spec = f"weekly mon,tue,wed,thu,fri {hm[0]:02d}:{hm[1]:02d}"
        return spec, next_run(spec, now)  # type: ignore[return-value]
    if re.search(r"week-?end|weekends", t) and re.search(r"chaque|tous|every|le ", t):
        hm = hm or (10, 0)
        spec = f"weekly sat,sun {hm[0]:02d}:{hm[1]:02d}"
        return spec, next_run(spec, now)  # type: ignore[return-value]
    # tous les lundis / chaque mardi et jeudi
    recurring = re.search(r"\b(tous les|toutes les|chaque|every)\b", t)
    days_found = [d for name, d in DAYS.items() if re.search(rf"\b{name}s?\b", t) and len(name) > 3]
    days_found = sorted(set(days_found))
    if recurring and days_found:
        hm = hm or (9, 0)
        spec = f"weekly {','.join(DAY_CODES[d] for d in days_found)} {hm[0]:02d}:{hm[1]:02d}"
        return spec, next_run(spec, now)  # type: ignore[return-value]
    # le 1er de chaque mois
    m = re.search(r"\ble (\d{1,2})(?:er)? (?:de )?chaque mois\b|\bchaque mois le (\d{1,2})", t)
    if m:
        dd = int(m.group(1) or m.group(2))
        hm = hm or (9, 0)
        spec = f"monthly {dd} {hm[0]:02d}:{hm[1]:02d}"
        return spec, next_run(spec, now)  # type: ignore[return-value]
    # chaque jour / tous les jours / quotidien / chaque matin
    if re.search(r"\b(chaque jour|tous les jours|quotidien|every day|daily|chaque matin|tous les matins|chaque soir|"
                 r"tous les soirs)\b", t):
        hm = hm or ((20, 0) if "soir" in t else (8, 0))
        spec = f"daily {hm[0]:02d}:{hm[1]:02d}"
        return spec, next_run(spec, now)  # type: ignore[return-value]
    # ponctuel : demain / après-demain / lundi / ce soir / à 15h
    day = None
    if "apres-demain" in t or "apres demain" in t:
        day = today + _dt.timedelta(days=2)
    elif "demain" in t or "tomorrow" in t:
        day = today + _dt.timedelta(days=1)
    elif days_found:
        wd = days_found[0]
        delta = (wd - today.weekday()) % 7 or 7
        day = today + _dt.timedelta(days=delta)
    if day or hm:
        hm = hm or (9, 0)
        ts = _at(day or today, hm)
        if ts <= now:
            ts = _at((day or today) + _dt.timedelta(days=1), hm)
        return f"once {_dt.datetime.fromtimestamp(ts):%Y-%m-%dT%H:%M}", ts
    raise ValueError(f"je ne comprends pas « {when} ». Exemples : « dans 20 min », « demain à 7h », "
                     f"« chaque jour à 8h », « tous les lundis à 9h », « toutes les 2 heures », « 0 8 * * 1-5 »")


def describe_spec(spec: str) -> str:
    kind, _, rest = spec.partition(" ")
    fr_days = {"mon": "lun", "tue": "mar", "wed": "mer", "thu": "jeu", "fri": "ven", "sat": "sam", "sun": "dim"}
    if kind == "once":
        return "une fois, le " + rest.replace("T", " à ")
    if kind == "every":
        n, u = rest[:-1], rest[-1]
        return f"toutes les {n} " + {"s": "s", "m": "min", "h": "h", "d": "jours", "w": "semaines"}[u]
    if kind == "daily":
        return f"chaque jour à {rest}"
    if kind == "weekly":
        d, hm = rest.split()
        return f"chaque {', '.join(fr_days[x] for x in d.split(','))} à {hm}"
    if kind == "monthly":
        dd, hm = rest.split()
        return f"le {dd} de chaque mois à {hm}"
    return spec


# --------------------------------------------------------------------------- moteur
class Scheduler:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._running: set[int] = set()
        self._lock = threading.Lock()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="planificateur")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.wait(10):
            try:
                self.tick()
            except Exception:  # noqa: BLE001
                log.exception("planificateur")

    def tick(self, now: float | None = None) -> list[int]:
        now = now or time.time()
        started = []
        for s in self.zeus.db.due_schedules(now):
            with self._lock:
                if s["id"] in self._running:
                    continue
                self._running.add(s["id"])
            try:
                nxt = next_run(s["spec"], now)
            except ValueError:
                nxt = None
            self.zeus.db.update_schedule(s["id"], next_run=nxt, enabled=1 if nxt else 0, last_run=now)
            threading.Thread(target=self._run, args=(s,), daemon=True, name=f"tache-{s['id']}").start()
            started.append(s["id"])
        return started

    def run_now(self, sid: int) -> bool:
        s = self.zeus.db.get_schedule(sid)
        if not s:
            return False
        with self._lock:
            if sid in self._running:
                return False
            self._running.add(sid)
        threading.Thread(target=self._run, args=(s,), daemon=True).start()
        return True

    def _run(self, s: dict) -> None:
        z = self.zeus
        result = ""
        try:
            kind = s.get("kind") or "agent"
            if kind == "reminder":
                result = f"⏰ Rappel : {s['prompt']}"
                z.deliver(s.get("deliver") or "owner", result)
            elif kind == "system:relances":
                result = z.dossiers.run_relances()
            elif kind == "system:kb_index":
                st = z.library.index()
                result = "occupé" if st.get("busy") else (f"{st['new']} nouveau(x), {st['updated']} modifié(s), "
                                                          f"{st['removed']} retiré(s)")
            elif kind == "system:calendar_sync":
                result = z.calendars.sync_all_text()
            else:
                sess = z.db.find_session("scheduler", f"task-{s['id']}")
                sid = sess["id"] if sess else z.db.create_session("scheduler", f"task-{s['id']}", "system",
                                                                  title=f"⏱ {s['name']}")
                res = z.agent.run(sid, s["prompt"], profile="system", task_name=s["name"])
                result = res.text
                z.deliver(s.get("deliver") or "owner", f"⏱ {s['name']}\n\n{res.text}", res.files)
        except Exception as e:  # noqa: BLE001
            log.exception("tâche planifiée %s", s.get("id"))
            result = f"Erreur : {e}"
        finally:
            z.db.update_schedule(s["id"], last_result=truncate(result, 2000), runs=(s.get("runs") or 0) + 1)
            z.bus.publish("schedule_ran", id=s["id"], result=truncate(result, 300))
            with self._lock:
                self._running.discard(s["id"])
