"""Agendas Google et Outlook sans installation compliquée.

- Lecture : ZEUS s'abonne à l'« adresse secrète au format iCal » de Google Agenda ou au calendrier publié
  d'Outlook (lien .ics). Il relit ces calendriers toutes les 15 minutes et les fusionne dans son agenda :
  conflits d'horaire, brief du matin, rappels et réponses à « qu'est-ce que j'ai demain ? » en tiennent compte.
  Les rendez-vous récurrents (RRULE), les exceptions (EXDATE) et les occurrences modifiées sont gérés.
- Écriture : chaque rendez-vous créé par ZEUS reçoit un lien « Ajouter à Google Agenda » et « Ajouter à
  Outlook » (un clic, sans compte développeur ni clé d'API).
- Diffusion : l'agenda de ZEUS est publié en flux .ics privé (lien secret) auquel un téléphone, Thunderbird ou
  Outlook sur le réseau local peut s'abonner.
Zéro dépendance : analyse iCalendar (RFC 5545) écrite à la main, fuseaux via zoneinfo s'il est disponible.
"""

from __future__ import annotations

import calendar as _cal
import datetime as _dt
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import TYPE_CHECKING, Any

from .util import log, slugify, truncate

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

MAX_ICS_BYTES = 15_000_000
MAX_OCCURRENCES = 1500
WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}

# Noms de fuseaux Windows (Outlook) → IANA, pour les plus courants
WINDOWS_TZ = {
    "romance standard time": "Europe/Paris", "w. europe standard time": "Europe/Berlin",
    "central europe standard time": "Europe/Budapest", "central european standard time": "Europe/Warsaw",
    "gmt standard time": "Europe/London", "greenwich standard time": "Atlantic/Reykjavik",
    "w. central africa standard time": "Africa/Lagos", "south africa standard time": "Africa/Johannesburg",
    "e. africa standard time": "Africa/Nairobi", "egypt standard time": "Africa/Cairo",
    "morocco standard time": "Africa/Casablanca", "eastern standard time": "America/New_York",
    "central standard time": "America/Chicago", "mountain standard time": "America/Denver",
    "pacific standard time": "America/Los_Angeles", "canada central standard time": "America/Regina",
    "utc": "UTC", "coordinated universal time": "UTC", "tokyo standard time": "Asia/Tokyo",
    "china standard time": "Asia/Shanghai", "india standard time": "Asia/Kolkata",
    "arabian standard time": "Asia/Dubai", "russian standard time": "Europe/Moscow",
    "fle standard time": "Europe/Kiev", "e. europe standard time": "Europe/Chisinau",
    "sa pacific standard time": "America/Bogota", "e. south america standard time": "America/Sao_Paulo",
    "aus eastern standard time": "Australia/Sydney",
}


# =========================================================================== analyse iCalendar
def unfold(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        elif raw.strip():
            lines.append(raw)
    return lines


def parse_line(line: str) -> tuple[str, dict[str, str], str]:
    """« DTSTART;TZID=Europe/Paris:20261110T090000 » → ("DTSTART", {"TZID": "Europe/Paris"}, "20261110T090000")."""
    # le séparateur nom/valeur est le premier « : » hors guillemets
    in_q, cut = False, -1
    for i, ch in enumerate(line):
        if ch == '"':
            in_q = not in_q
        elif ch == ":" and not in_q:
            cut = i
            break
    if cut < 0:
        return line.upper(), {}, ""
    head, value = line[:cut], line[cut + 1:]
    parts = re.split(r';(?=(?:[^"]*"[^"]*")*[^"]*$)', head)
    params = {}
    for prm in parts[1:]:
        if "=" in prm:
            k, v = prm.split("=", 1)
            params[k.upper()] = v.strip('"')
    return parts[0].upper(), params, value


def unescape(v: str) -> str:
    return re.sub(r"\\([nN,;\\])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), v or "")


def _tz(name: str):
    if not name:
        return None
    name = name.strip().strip('"')
    cand = [name, WINDOWS_TZ.get(name.lower(), "")]
    m = re.search(r"([A-Za-z]+/[A-Za-z_]+(?:/[A-Za-z_]+)?)", name)  # « /mozilla.org/.../Europe/Paris »
    if m:
        cand.append(m.group(1))
    try:
        from zoneinfo import ZoneInfo
    except ImportError:  # pragma: no cover
        return None
    for c in cand:
        if not c:
            continue
        try:
            return ZoneInfo(c)
        except Exception:  # noqa: BLE001  (fuseau inconnu ou base tzdata absente sous Windows)
            continue
    return None


def parse_dt(value: str, params: dict[str, str]) -> tuple[_dt.datetime, bool, Any]:
    """Renvoie (datetime « mur » naïf, journée entière ?, fuseau). Fuseau None = heure locale du PC ; "UTC" = UTC."""
    v = value.strip()
    if params.get("VALUE", "").upper() == "DATE" or re.fullmatch(r"\d{8}", v):
        d = _dt.datetime.strptime(v[:8], "%Y%m%d")
        return d, True, None
    utc = v.endswith("Z")
    v = v.rstrip("Z")
    fmt = "%Y%m%dT%H%M%S" if len(v) >= 15 else "%Y%m%dT%H%M"
    d = _dt.datetime.strptime(v[:15] if len(v) >= 15 else v, fmt)
    if utc:
        return d, False, "UTC"
    return d, False, _tz(params.get("TZID", ""))


def to_ts(wall: _dt.datetime, tz: Any) -> float:
    if tz == "UTC":
        return wall.replace(tzinfo=_dt.timezone.utc).timestamp()
    if tz is not None:
        return wall.replace(tzinfo=tz).timestamp()
    return time.mktime(wall.timetuple())  # heure locale du PC (fuseau inconnu ou heure « flottante »)


def parse_duration(v: str) -> float:
    m = re.fullmatch(r"([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", v.strip())
    if not m:
        return 0.0
    sign = -1 if m.group(1) == "-" else 1
    w, d, h, mi, s = (int(x or 0) for x in m.groups()[1:])
    return sign * (((w * 7 + d) * 24 + h) * 3600 + mi * 60 + s)


def parse_rrule(v: str) -> dict[str, str]:
    out = {}
    for part in v.split(";"):
        if "=" in part:
            k, val = part.split("=", 1)
            out[k.strip().upper()] = val.strip().upper()
    return out


def _add_months(d: _dt.datetime, n: int) -> tuple[int, int]:
    m = d.month - 1 + n
    return d.year + m // 12, m % 12 + 1


def _nth_weekday(year: int, month: int, wd: int, n: int) -> int | None:
    days = [day for day in range(1, _cal.monthrange(year, month)[1] + 1) if _dt.date(year, month, day).weekday() == wd]
    if not days:
        return None
    try:
        return days[n - 1] if n > 0 else days[n]
    except IndexError:
        return None


def expand(start: _dt.datetime, rule: dict[str, str], until_wall: _dt.datetime | None, window_end: _dt.datetime,
           window_start: _dt.datetime) -> list[_dt.datetime]:
    """Occurrences (heures « mur ») d'une règle RRULE, de start jusqu'à window_end. Sous-ensemble courant de RFC 5545."""
    freq = rule.get("FREQ", "")
    interval = max(1, int(rule.get("INTERVAL", "1") or 1))
    count = int(rule["COUNT"]) if rule.get("COUNT", "").isdigit() else None
    byday = [x for x in rule.get("BYDAY", "").split(",") if x]
    bymonthday = [int(x) for x in rule.get("BYMONTHDAY", "").split(",") if re.fullmatch(r"-?\d+", x)]
    bymonth = [int(x) for x in rule.get("BYMONTH", "").split(",") if x.isdigit()]
    t = start.time()
    out: list[_dt.datetime] = []
    n = 0
    limit_end = min(window_end, until_wall) if until_wall else window_end

    def emit(d: _dt.datetime) -> bool:
        """Ajoute d si valide ; renvoie False quand il faut s'arrêter."""
        nonlocal n
        if d < start:
            return True
        if d > limit_end:
            return False
        n += 1
        if count is not None and n > count:
            return False
        if d >= window_start:
            out.append(d)
        return len(out) < MAX_OCCURRENCES

    for step in range(0, 20000):
        if freq == "DAILY":
            d = start + _dt.timedelta(days=step * interval)
            if d > limit_end:
                break
            if byday and not any(WEEKDAYS.get(x[-2:]) == d.weekday() for x in byday):
                continue
            if bymonth and d.month not in bymonth:
                continue
            if not emit(d):
                break
        elif freq == "WEEKLY":
            week0 = start - _dt.timedelta(days=start.weekday())
            base = week0 + _dt.timedelta(weeks=step * interval)
            if _dt.datetime.combine(base.date(), t) > limit_end + _dt.timedelta(days=7):
                break
            days = sorted({WEEKDAYS[x[-2:]] for x in byday if x[-2:] in WEEKDAYS}) or [start.weekday()]
            stop = False
            for wd in days:
                d = _dt.datetime.combine((base + _dt.timedelta(days=wd)).date(), t)
                if d > limit_end:
                    stop = True
                    break
                if not emit(d):
                    stop = True
                    break
            if stop:
                break
        elif freq in ("MONTHLY", "YEARLY"):
            if freq == "MONTHLY":
                y, m = _add_months(start, step * interval)
                months = [(y, m)]
            else:
                y = start.year + step * interval
                months = [(y, mm) for mm in (bymonth or [start.month])]
            if _dt.datetime(months[0][0], months[0][1], 1) > limit_end:
                break
            stop = False
            for y, m in months:
                days: list[int] = []
                last = _cal.monthrange(y, m)[1]
                if byday:
                    for x in byday:
                        mt = re.fullmatch(r"([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)", x)
                        if not mt:
                            continue
                        wd = WEEKDAYS[mt.group(2)]
                        if mt.group(1):
                            dd = _nth_weekday(y, m, wd, int(mt.group(1)))
                            if dd:
                                days.append(dd)
                        else:
                            days += [dd for dd in range(1, last + 1) if _dt.date(y, m, dd).weekday() == wd]
                    if rule.get("BYSETPOS", "").lstrip("-").isdigit() and days:
                        pos = int(rule["BYSETPOS"])
                        days = sorted(days)
                        try:
                            days = [days[pos - 1] if pos > 0 else days[pos]]
                        except IndexError:
                            days = []
                elif bymonthday:
                    days = [dd if dd > 0 else last + 1 + dd for dd in bymonthday]
                else:
                    days = [start.day]
                for dd in sorted(set(days)):
                    if not 1 <= dd <= last:
                        continue  # 31 d'un mois de 30 jours : ignoré (RFC 5545)
                    d = _dt.datetime.combine(_dt.date(y, m, dd), t)
                    if d > limit_end:
                        stop = True
                        break
                    if not emit(d):
                        stop = True
                        break
                if stop:
                    break
            if stop:
                break
        else:
            emit(start)
            break
    return out


def parse_ics(text: str, window_start: float, window_end: float) -> list[dict]:
    """Rendez-vous d'un fichier .ics compris dans la fenêtre [window_start, window_end] (horodatages)."""
    lines = unfold(text)
    vevents: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    depth = 0
    for line in lines:
        name, params, value = parse_line(line)
        if name == "BEGIN":
            if value.upper() == "VEVENT" and cur is None:
                cur = {"EXDATE": [], "ATTENDEE": []}
                depth = 0
            elif cur is not None:
                depth += 1  # VALARM à l'intérieur d'un VEVENT
            continue
        if name == "END":
            if cur is not None and depth:
                depth -= 1
            elif cur is not None and value.upper() == "VEVENT":
                vevents.append(cur)
                cur = None
            continue
        if cur is None or depth:
            continue
        if name == "EXDATE":
            for v in value.split(","):
                if v.strip():
                    cur["EXDATE"].append((v.strip(), params))
        elif name == "ATTENDEE":
            cur["ATTENDEE"].append(params.get("CN") or value.replace("mailto:", "").replace("MAILTO:", ""))
        else:
            cur[name] = (value, params)

    lo = _dt.datetime.fromtimestamp(window_start) - _dt.timedelta(days=1)
    hi = _dt.datetime.fromtimestamp(window_end) + _dt.timedelta(days=1)
    overrides: dict[str, dict[float, dict]] = {}
    masters: list[dict] = []
    for ev in vevents:
        if "DTSTART" not in ev:
            continue
        if "RECURRENCE-ID" in ev:
            rv, rp = ev["RECURRENCE-ID"]
            try:
                w, _, tz = parse_dt(rv, rp)
                overrides.setdefault(ev.get("UID", ("", {}))[0], {})[round(to_ts(w, tz))] = ev
            except ValueError:
                pass
        masters.append(ev)

    out: list[dict] = []
    for ev in masters:
        try:
            out += _occurrences(ev, overrides, window_start, window_end, lo, hi, len(out))
        except (ValueError, OverflowError, OSError) as e:  # date hors limites (ex. avant 1970 sous Windows)
            log.debug("agenda : événement ignoré (%s)", e)
    out.sort(key=lambda e: e["start"])
    return out


def _occurrences(ev: dict, overrides: dict, window_start: float, window_end: float, lo: _dt.datetime,
                 hi: _dt.datetime, n_before: int) -> list[dict]:
    out: list[dict] = []
    uid = ev.get("UID", ("", {}))[0] or f"sans-uid-{n_before}"
    if ev.get("STATUS", ("", {}))[0].upper() == "CANCELLED":
        return out
    wall, allday, tz = parse_dt(*ev["DTSTART"])
    if "DTEND" in ev:
        try:
            ew, _, etz = parse_dt(*ev["DTEND"])
            dur = to_ts(ew, etz) - to_ts(wall, tz)
        except ValueError:
            dur = 3600.0
    elif "DURATION" in ev:
        dur = parse_duration(ev["DURATION"][0])
    else:
        dur = 86400.0 if allday else 3600.0
    dur = max(0.0, dur)
    title = unescape(ev.get("SUMMARY", ("", {}))[0]).strip() or "(sans titre)"
    base = {"title": truncate(title, 200), "location": truncate(unescape(ev.get("LOCATION", ("", {}))[0]), 200),
            "notes": truncate(unescape(ev.get("DESCRIPTION", ("", {}))[0]).strip(), 1500),
            "attendees": truncate(", ".join(a for a in ev["ATTENDEE"] if a), 300),
            "url": ev.get("URL", ("", {}))[0], "allday": allday}
    is_override = "RECURRENCE-ID" in ev
    if "RRULE" in ev and not is_override:
        rule = parse_rrule(ev["RRULE"][0])
        until_wall = None
        if rule.get("UNTIL"):
            try:
                uw, _, utz = parse_dt(rule["UNTIL"], {"TZID": ev["DTSTART"][1].get("TZID", "")})
                # UNTIL en UTC : on le ramène dans le fuseau de l'événement
                until_ts = to_ts(uw.replace(hour=23, minute=59, second=59) if len(rule["UNTIL"]) == 8 else uw, utz)
                if tz == "UTC":
                    until_wall = _dt.datetime.fromtimestamp(until_ts, _dt.timezone.utc).replace(tzinfo=None)
                elif tz is not None:
                    until_wall = _dt.datetime.fromtimestamp(until_ts, tz).replace(tzinfo=None)
                else:
                    until_wall = _dt.datetime.fromtimestamp(until_ts)
            except (ValueError, OverflowError, OSError):
                until_wall = None
        # fenêtre exprimée en heure « mur » de l'événement (approximation d'un jour, déjà de marge)
        occ = expand(wall, rule, until_wall, hi, lo)
        ex = set()
        for v, prm in ev["EXDATE"]:
            try:
                w2, _, tz2 = parse_dt(v, {**ev["DTSTART"][1], **prm})
                ex.add(round(to_ts(w2, tz2 if tz2 is not None or "TZID" in prm else tz)))
            except ValueError:
                pass
        over = overrides.get(uid, {})
        for w in occ:
            ts = round(to_ts(w, tz))
            if ts in ex or ts in over:
                continue
            if window_start - dur <= ts <= window_end:
                out.append({**base, "start": float(ts), "end": float(ts + dur), "uid": f"{uid}#{ts}"})
    else:
        ts = to_ts(wall, tz)
        if ts + dur >= window_start and ts <= window_end:
            out.append({**base, "start": ts, "end": ts + dur, "uid": f"{uid}#{round(ts)}"})
    return out


# =========================================================================== liens « ajouter à… »
def _utc(ts: float) -> str:
    return _dt.datetime.fromtimestamp(ts, _dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def google_link(e: dict) -> str:
    q = {"action": "TEMPLATE", "text": e.get("title", ""), "dates": f"{_utc(e['start'])}/{_utc(e['end'])}"}
    details = "\n".join(x for x in (e.get("notes") or "", f"Participants : {e['attendees']}" if e.get("attendees") else "") if x)
    if details:
        q["details"] = details
    if e.get("location"):
        q["location"] = e["location"]
    return "https://calendar.google.com/calendar/render?" + urllib.parse.urlencode(q)


def outlook_link(e: dict, work: bool = False) -> str:
    iso = lambda ts: _dt.datetime.fromtimestamp(ts, _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    q = {"path": "/calendar/action/compose", "rru": "addevent", "subject": e.get("title", ""),
         "startdt": iso(e["start"]), "enddt": iso(e["end"])}
    if e.get("notes"):
        q["body"] = e["notes"]
    if e.get("location"):
        q["location"] = e["location"]
    host = "outlook.office.com" if work else "outlook.live.com"
    return f"https://{host}/calendar/0/deeplink/compose?" + urllib.parse.urlencode(q)


def provider_of(url: str) -> str:
    host = urllib.parse.urlparse(url).netloc.lower()
    if "google" in host:
        return "Google Agenda"
    if any(x in host for x in ("outlook", "office365", "office.com", "live.com", "hotmail")):
        return "Outlook"
    if "icloud" in host:
        return "iCloud"
    return "Calendrier"


# =========================================================================== synchronisation
class CalendarSync:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus

    @property
    def cfg(self):
        return self.zeus.config

    def feeds(self) -> list[dict]:
        return [f for f in (self.cfg.get("calendar.feeds") or []) if isinstance(f, dict) and f.get("url")]

    def feed_token(self) -> str:
        tok = self.cfg.get("calendar.feed_token")
        if not tok:
            tok = secrets.token_urlsafe(18)
            self.cfg.set("calendar.feed_token", tok)
        return tok

    @staticmethod
    def normalize_url(url: str) -> str:
        url = (url or "").strip().strip('"').strip("<>")
        if url.lower().startswith("webcal://"):
            url = "https://" + url[9:]
        if not re.match(r"^https?://[^\s]+$", url, re.I):
            raise ValueError("colle l'adresse complète du calendrier (elle commence par https:// ou webcal://)")
        return url

    def add_feed(self, url: str, name: str = "", remind: int = 0) -> dict:
        url = self.normalize_url(url)
        feeds = self.feeds()
        for f in feeds:
            if f["url"] == url:
                return f
        prov = provider_of(url)
        base = slugify(name or prov, 24)
        fid, i = base, 2
        while any(f["id"] == fid for f in feeds):
            fid, i = f"{base}-{i}", i + 1
        feed = {"id": fid, "name": (name or prov).strip()[:60], "url": url, "provider": prov,
                "remind": max(0, int(remind or 0)), "enabled": True}
        self.cfg.set("calendar.feeds", feeds + [feed])
        self.ensure_job()
        return feed

    def remove_feed(self, fid: str) -> bool:
        feeds = self.feeds()
        keep = [f for f in feeds if f["id"] != fid]
        if len(keep) == len(feeds):
            return False
        self.cfg.set("calendar.feeds", keep)
        self.zeus.db.delete_feed_events(f"feed:{fid}")
        self.ensure_job()
        self._clear_reminders(fid)
        self.zeus.bus.publish("agenda_changed")
        return True

    def ensure_job(self) -> None:
        minutes = max(5, int(self.cfg.get("calendar.sync_minutes") or 15))
        jobs = [s for s in self.zeus.db.list_schedules() if s["kind"] == "system:calendar_sync"]
        if not self.feeds():
            for s in jobs:
                self.zeus.db.delete_schedule(s["id"])
            return
        if not jobs:
            self.zeus.db.add_schedule("Synchronisation des agendas Google / Outlook", "calendriers",
                                      f"every {minutes}m", time.time() + minutes * 60, kind="system:calendar_sync")

    def fetch(self, url: str) -> str:
        req = urllib.request.Request(url, headers={"User-Agent": "ZEUS-agenda/1.0", "Accept": "text/calendar, */*"})
        with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 (adresse fournie par le propriétaire)
            data = r.read(MAX_ICS_BYTES + 1)
        if len(data) > MAX_ICS_BYTES:
            raise ValueError("calendrier trop volumineux")
        text = data.decode("utf-8", "replace")
        if "BEGIN:VCALENDAR" not in text[:4000].upper():
            if "<html" in text[:2000].lower():
                raise ValueError("cette adresse renvoie une page web, pas un calendrier : prends le lien « format "
                                 "iCal » (Google) ou le lien .ics (Outlook)")
            raise ValueError("ce lien ne renvoie pas un calendrier .ics")
        return text

    def window(self) -> tuple[float, float]:
        now = time.time()
        past = int(self.cfg.get("calendar.past_days") or 7)
        fut = int(self.cfg.get("calendar.future_days") or 120)
        return now - past * 86400, now + fut * 86400

    def sync(self, feed: dict) -> dict:
        t0, t1 = self.window()
        status: dict[str, Any] = {"id": feed["id"], "name": feed.get("name"), "ts": time.time()}
        try:
            events = parse_ics(self.fetch(feed["url"]), t0, t1)
            n = self.zeus.db.replace_feed_events(f"feed:{feed['id']}", events)
            status.update(ok=True, events=n)
            if feed.get("remind"):
                status["reminders"] = self._reminders(feed, events)
        except Exception as e:  # noqa: BLE001
            msg = f"HTTP {e.code}" if isinstance(e, urllib.error.HTTPError) else str(e)
            if isinstance(e, urllib.error.HTTPError) and e.code in (401, 403, 404):
                msg += " : lien expiré ou révoqué ? Recopie l'adresse secrète du calendrier."
            log.warning("agenda %s : %s", feed.get("id"), msg)
            status.update(ok=False, error=truncate(msg, 300))
        st = self.zeus.db.kv_get("calendar.status", {}) or {}
        st[feed["id"]] = status
        self.zeus.db.kv_set("calendar.status", st)
        self.zeus.bus.publish("agenda_changed", feed=feed["id"])
        return status

    def sync_all(self) -> list[dict]:
        return [self.sync(f) for f in self.feeds() if f.get("enabled", True)]

    def sync_all_text(self) -> str:
        res = self.sync_all()
        if not res:
            return "aucun agenda externe"
        return "; ".join(f"{r['name']} : {r['events']} rendez-vous" if r.get("ok") else f"{r['name']} : ERREUR {r['error']}"
                         for r in res)

    def status(self) -> dict:
        return self.zeus.db.kv_get("calendar.status", {}) or {}

    # ------------------------------------------------------------------ rappels des rendez-vous importés
    def _reminders(self, feed: dict, events: list[dict]) -> int:
        db = self.zeus.db
        key = f"calendar.reminders.{feed['id']}"
        done: dict[str, int] = db.kv_get(key, {}) or {}
        now = time.time()
        minutes = int(feed["remind"])
        keep: dict[str, int] = {}
        made = 0
        for e in events:
            if e.get("allday"):
                continue
            at = e["start"] - minutes * 60
            if not now + 30 < at < now + 2 * 86400:
                continue
            k = e["uid"]
            if k in done:
                keep[k] = done.pop(k)
                continue
            msg = f"⏰ Rappel ({feed.get('name')}) : « {e['title']} » à {_dt.datetime.fromtimestamp(e['start']):%H:%M}" + \
                  (f" — {e['location']}" if e.get("location") else "")
            keep[k] = db.add_schedule(f"Rappel : {truncate(e['title'], 40)}", msg,
                                      f"once {_dt.datetime.fromtimestamp(at):%Y-%m-%dT%H:%M}", at, kind="reminder")
            made += 1
        for sid in done.values():  # rendez-vous déplacés ou annulés : leur ancien rappel disparaît
            s = db.get_schedule(int(sid))
            if s and s.get("enabled") and (s.get("next_run") or 0) > now:
                db.delete_schedule(int(sid))
        db.kv_set(key, keep)
        return made

    def _clear_reminders(self, fid: str) -> None:
        db = self.zeus.db
        for sid in (db.kv_get(f"calendar.reminders.{fid}", {}) or {}).values():
            db.delete_schedule(int(sid))
        db.kv_set(f"calendar.reminders.{fid}", {})


__all__ = ["CalendarSync", "parse_ics", "google_link", "outlook_link", "expand", "parse_rrule", "provider_of"]
