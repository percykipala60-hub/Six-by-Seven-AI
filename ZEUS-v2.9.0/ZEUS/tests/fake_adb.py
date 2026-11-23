#!/usr/bin/env python3
"""Faux ADB : imite un téléphone Android (Samsung A51, Android 13) pour tester ZEUS sans appareil.
État conservé dans le fichier indiqué par FAKE_ADB_STATE. Toutes les commandes sont journalisées."""

from __future__ import annotations

import base64
import json
import os
import re
import struct
import sys
import time
import urllib.parse
import zlib
from pathlib import Path

STATE = Path(os.environ.get("FAKE_ADB_STATE") or Path(__file__).with_name("fake_adb_state.json"))
W, H = 1080, 2400


def load() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"app": "home", "wa_text": "", "wa_to": "", "sms_body": "", "sms_to": "", "sent": [], "log": [],
            "typed": [], "field": "", "connected": True}


def save(st: dict) -> None:
    tmp = STATE.with_name(STATE.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")
    for _ in range(20):  # sous Windows, le remplacement échoue si le test lit le fichier au même instant
        try:
            os.replace(tmp, STATE)
            return
        except PermissionError:
            time.sleep(0.02)
    os.replace(tmp, STATE)


# --------------------------------------------------------------------------- écrans
def node(cls: str, bounds: tuple, text: str = "", desc: str = "", rid: str = "", pkg: str = "",
         clickable: bool = False, scrollable: bool = False, children: list | None = None, **kw) -> dict:
    return {"cls": cls, "b": bounds, "text": text, "desc": desc, "rid": rid, "pkg": pkg, "clickable": clickable,
            "scrollable": scrollable, "children": children or [], **kw}


def screen(st: dict) -> tuple[str, list[dict]]:
    app = st["app"]
    if app == "home":
        pkg = "com.sec.android.app.launcher"
        icons = [("WhatsApp", "open:whatsapp_home"), ("YouTube", "open:youtube"), ("M-Pesa", "open:mpesa"),
                 ("Messages", "open:messages_list"), ("Paramètres", "open:settings")]
        kids = []
        for i, (label, act) in enumerate(icons):
            x = 60 + (i % 4) * 250
            y = 1500 + (i // 4) * 300
            kids.append(node("android.widget.TextView", (x, y, x + 200, y + 240), text=label, desc=label, pkg=pkg,
                             clickable=True, action=act))
        return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=[
            node("android.widget.TextView", (60, 200, 1020, 330), text="16:45", pkg=pkg),
            node("android.widget.TextView", (60, 340, 1020, 420), text="jeudi 29 octobre", pkg=pkg)] + kids)]
    if app == "whatsapp_home":
        pkg = "com.whatsapp"
        rows = [("Maman", "À ce soir ❤️"), ("Patrick", "Tu as vu le match ?"), ("Bureau", "Réunion demain 9h")]
        kids = [node("android.widget.TextView", (40, 120, 600, 220), text="WhatsApp", pkg=pkg),
                node("android.widget.ImageButton", (900, 120, 1040, 220), desc="Rechercher", pkg=pkg, clickable=True)]
        for i, (n, last) in enumerate(rows):
            y = 400 + i * 220
            kids.append(node("android.widget.LinearLayout", (0, y, W, y + 200), pkg=pkg, clickable=True,
                             action=f"chat:{n}", children=[
                                 node("android.widget.TextView", (200, y + 30, 900, y + 100), text=n, pkg=pkg,
                                      rid="com.whatsapp:id/conversations_row_contact_name"),
                                 node("android.widget.TextView", (200, y + 110, 900, y + 170), text=last, pkg=pkg)]))
        return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=kids)]
    if app == "whatsapp_chat":
        pkg = "com.whatsapp"
        kids = [node("android.widget.TextView", (160, 100, 800, 200), text=st.get("wa_to") or "Contact", pkg=pkg),
                node("android.widget.ImageButton", (20, 100, 140, 200), desc="Retour", pkg=pkg, clickable=True, action="back"),
                node("android.widget.EditText", (40, 2200, 880, 2340), text=st.get("wa_text", ""), desc="Message",
                     rid="com.whatsapp:id/entry", pkg=pkg, clickable=True, action="focus:wa_text")]
        if st.get("wa_text"):
            kids.append(node("android.widget.ImageButton", (900, 2200, 1040, 2340), desc="Envoyer",
                             rid="com.whatsapp:id/send", pkg=pkg, clickable=True, action="wa_send"))
        return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=kids)]
    if app == "messages_compose":
        pkg = "com.samsung.android.messaging"
        return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=[
            node("android.widget.TextView", (40, 100, 900, 200), text=st.get("sms_to", ""), pkg=pkg),
            node("android.widget.EditText", (40, 2200, 880, 2340), text=st.get("sms_body", ""), desc="Saisir un message",
                 pkg=pkg, clickable=True, action="focus:sms_body"),
            node("android.widget.ImageButton", (900, 2200, 1040, 2340), desc="Envoyer le SMS",
                 rid="com.samsung.android.messaging:id/send_button", pkg=pkg, clickable=True, action="sms_send")])]
    if app == "mpesa":
        pkg = "com.vodacom.mpesa.cd"
        return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=[
            node("android.widget.TextView", (40, 150, 1040, 260), text="M-Pesa — Envoyer de l'argent", pkg=pkg),
            node("android.widget.EditText", (40, 400, 1040, 520), text="", desc="Montant", pkg=pkg, clickable=True,
                 action="focus:field"),
            node("android.widget.Button", (40, 700, 1040, 840), text="Confirmer le paiement", pkg=pkg, clickable=True,
                 action="pay")])]
    if app == "settings":
        pkg = "com.android.settings"
        return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=[
            node("androidx.recyclerview.widget.RecyclerView", (0, 200, W, H), pkg=pkg, scrollable=True, children=[
                node("android.widget.LinearLayout", (0, 220, W, 400), pkg=pkg, clickable=True, children=[
                    node("android.widget.TextView", (150, 250, 900, 320), text="Connexions", pkg=pkg),
                    node("android.widget.TextView", (150, 320, 900, 380), text="Wi-Fi • Bluetooth", pkg=pkg)]),
                node("android.widget.Switch", (850, 450, 1040, 560), text="Wi-Fi", pkg=pkg, checkable=True,
                     checked=st.get("wifi", True), clickable=True, action="toggle_wifi")])])]
    if app == "calendar_edit":
        pkg = "com.google.android.calendar"
        d = st.get("cal_draft") or {}
        return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=[
            node("android.widget.ImageButton", (20, 80, 160, 200), desc="Annuler", pkg=pkg, clickable=True, action="back"),
            node("android.widget.Button", (800, 80, 1040, 200), text="Enregistrer", rid="com.google.android.calendar:id/save",
                 pkg=pkg, clickable=True, action="cal_save"),
            node("android.widget.EditText", (40, 260, 1040, 380), text=d.get("title", ""), pkg=pkg, clickable=True),
            node("android.widget.TextView", (40, 420, 1040, 500), text=d.get("location", ""), pkg=pkg)])]
    if app == "calendar":
        pkg = "com.google.android.calendar"
        return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=[
            node("android.widget.TextView", (40, 150, 1040, 260), text="Agenda — " + ", ".join(
                e["title"] for e in st.get("events", [])), pkg=pkg)])]
    pkg = "com.google.android.youtube"
    return pkg, [node("android.widget.FrameLayout", (0, 0, W, H), pkg=pkg, children=[
        node("android.widget.TextView", (40, 150, 1040, 260), text="YouTube — Accueil", pkg=pkg)])]


def walk(nodes: list[dict]):
    for n in nodes:
        yield n
        yield from walk(n["children"])


def to_xml(nodes: list[dict]) -> str:
    def esc(s: str) -> str:
        return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")

    def one(n: dict, idx: int) -> str:
        x1, y1, x2, y2 = n["b"]
        attrs = (f'index="{idx}" text="{esc(n["text"])}" resource-id="{esc(n["rid"])}" class="{n["cls"]}" '
                 f'package="{n["pkg"]}" content-desc="{esc(n["desc"])}" checkable="{str(n.get("checkable", False)).lower()}" '
                 f'checked="{str(n.get("checked", False)).lower()}" clickable="{str(n["clickable"]).lower()}" enabled="true" '
                 f'focusable="true" focused="false" scrollable="{str(n["scrollable"]).lower()}" long-clickable="false" '
                 f'password="false" selected="false" bounds="[{x1},{y1}][{x2},{y2}]"')
        kids = "".join(one(c, i) for i, c in enumerate(n["children"]))
        return f"<node {attrs}>{kids}</node>" if kids else f"<node {attrs} />"
    return "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=\"0\">" + \
        "".join(one(n, i) for i, n in enumerate(nodes)) + "</hierarchy>"


def png(st: dict) -> bytes:
    pkg, nodes = screen(st)
    colors = {"com.whatsapp": (17, 27, 33), "com.vodacom.mpesa.cd": (200, 30, 40), "com.android.settings": (245, 245, 245)}
    bg = colors.get(pkg, (20, 40, 90))
    sw, sh = W // 4, H // 4
    img = [bytearray(bytes(bg) * sw) for _ in range(sh)]
    for n in walk(nodes):
        if not n["clickable"]:
            continue
        x1, y1, x2, y2 = (v // 4 for v in n["b"])
        col = (255, 216, 74) if "send" in n["rid"] or n.get("action") == "pay" else (90, 140, 230)
        for y in range(max(0, y1 + 2), min(sh, y2 - 2)):
            for x in range(max(0, x1 + 2), min(sw, x2 - 2)):
                img[y][x * 3:x * 3 + 3] = bytes(col)
    raw = b"".join(b"\x00" + bytes(r) for r in img)

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", sw, sh, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


# --------------------------------------------------------------------------- actions
def hit(st: dict, x: int, y: int) -> dict | None:
    _, nodes = screen(st)
    best = None
    for n in walk(nodes):
        x1, y1, x2, y2 = n["b"]
        if x1 <= x <= x2 and y1 <= y <= y2 and n.get("action"):
            best = n
    return best


def do_action(st: dict, act: str) -> None:
    if act.startswith("open:"):
        st["app"] = act[5:]
    elif act.startswith("chat:"):
        st["app"], st["wa_to"], st["wa_text"] = "whatsapp_chat", act[5:], ""
    elif act.startswith("focus:"):
        st["field"] = act[6:]
    elif act == "wa_send":
        st["sent"].append({"via": "whatsapp", "to": st.get("wa_to"), "text": st.get("wa_text")})
        st["wa_text"] = ""
    elif act == "sms_send":
        st["sent"].append({"via": "sms", "to": st.get("sms_to"), "text": st.get("sms_body")})
        st["app"] = "home"
    elif act == "pay":
        st["sent"].append({"via": "mpesa", "text": "PAIEMENT"})
    elif act == "toggle_wifi":
        st["wifi"] = not st.get("wifi", True)
    elif act == "cal_save":
        st.setdefault("events", []).append(st.pop("cal_draft", {}))
        st["app"] = "calendar"
    elif act == "back":
        st["app"] = "whatsapp_home" if st["app"] == "whatsapp_chat" else "home"


def type_text(st: dict, text: str) -> None:
    st["typed"].append(text)
    f = st.get("field") or ("wa_text" if st["app"] == "whatsapp_chat" else "")
    if f:
        st[f] = (st.get(f) or "") + text


def shell(st: dict, cmd: str) -> str:
    out = []
    for part in [p.strip() for p in re.split(r";|&&", cmd) if p.strip()]:
        out.append(shell_one(st, part))
    return "".join(o for o in out if o)


DEFAULT_SETTINGS = {
    "global": {"wifi_on": "1", "bluetooth_on": "0", "mobile_data": "1", "airplane_mode_on": "0", "zen_mode": "0"},
    "system": {"screen_brightness": "128", "screen_brightness_mode": "1", "accelerometer_rotation": "1",
               "screen_off_timeout": "30000"},
    "secure": {"location_mode": "3", "default_input_method": "com.samsung.android.honeyboard/.service.HoneyBoardService"},
}


def settings(st: dict) -> dict:
    if "settings" not in st:
        st["settings"] = json.loads(json.dumps(DEFAULT_SETTINGS))
    return st["settings"]


def unq(s: str) -> str:
    return s.replace("'\\''", "'")


def extra(c: str, kind: str, key: str) -> str | None:
    if kind == "es":
        m = re.search(rf"--es {re.escape(key)} '((?:[^']|'\\'')*)'", c)
        return unq(m.group(1)) if m else None
    m = re.search(rf"--{kind} {re.escape(key)} ([\d,\-]+|true|false)", c)
    return m.group(1) if m else None


def settings_cmd(st: dict, c: str) -> str | None:
    s = settings(st)
    m = re.match(r"settings (get|put) (global|system|secure) (\w+)(?: (\S+))?$", c)
    if m:
        if m.group(1) == "get":
            return s[m.group(2)].get(m.group(3), "null") + "\n"
        s[m.group(2)][m.group(3)] = m.group(4) or ""
        return ""
    m = re.match(r"(?:cmd wifi set-wifi-enabled (enabled|disabled)|svc wifi (enable|disable))$", c)
    if m:
        on = (m.group(1) or m.group(2)) in ("enabled", "enable")
        s["global"]["wifi_on"] = "1" if on else "0"
        st["wifi"] = on
        return ""
    m = re.match(r"(?:cmd bluetooth_manager|svc bluetooth) (enable|disable)$", c)
    if m:
        s["global"]["bluetooth_on"] = "1" if m.group(1) == "enable" else "0"
        return ""
    m = re.match(r"svc data (enable|disable)$", c)
    if m:
        s["global"]["mobile_data"] = "1" if m.group(1) == "enable" else "0"
        return ""
    m = re.match(r"cmd connectivity airplane-mode (enable|disable)$", c)
    if m:
        s["global"]["airplane_mode_on"] = "1" if m.group(1) == "enable" else "0"
        return ""
    m = re.match(r"cmd notification set_dnd (\w+)$", c)
    if m:
        s["global"]["zen_mode"] = {"off": "0", "all": "0", "priority": "1", "on": "1", "none": "2", "alarms": "3"}.get(
            m.group(1), "1")
        return ""
    m = re.match(r"cmd location set-location-enabled (true|false)$", c)
    if m:
        s["secure"]["location_mode"] = "3" if m.group(1) == "true" else "0"
        return ""
    m = re.match(r"cmd media_session volume --stream (\d+) --(get|set)(?: (\d+))?$", c)
    if m:
        vols = st.setdefault("volumes", {"2": 11, "3": 7, "4": 10, "5": 11})
        if m.group(2) == "get":
            return f"[V] will get volume\n[V] volume is {vols.get(m.group(1), 7)} in range [0..15]\n"
        vols[m.group(1)] = int(m.group(3) or 0)
        return f"[V] will set volume to index={m.group(3)}\n"
    if c.startswith("am start -a android.intent.action.SET_ALARM"):
        days = extra(c, "eial", "android.intent.extra.alarm.DAYS")
        st.setdefault("alarms", []).append({
            "hour": int(extra(c, "ei", "android.intent.extra.alarm.HOUR") or -1),
            "minute": int(extra(c, "ei", "android.intent.extra.alarm.MINUTES") or 0),
            "label": extra(c, "es", "android.intent.extra.alarm.MESSAGE") or "",
            "days": [int(x) for x in days.split(",")] if days else [],
            "skip_ui": extra(c, "ez", "android.intent.extra.alarm.SKIP_UI") == "true"})
        return "Starting: Intent { act=android.intent.action.SET_ALARM }\n"
    if c.startswith("am start -a android.intent.action.SET_TIMER"):
        st.setdefault("timers", []).append({"seconds": int(extra(c, "ei", "android.intent.extra.alarm.LENGTH") or 0),
                                            "label": extra(c, "es", "android.intent.extra.alarm.MESSAGE") or ""})
        return "Starting: Intent { act=android.intent.action.SET_TIMER }\n"
    if c.startswith("am start -a android.intent.action.INSERT") and "content://com.android.calendar/events" in c:
        st["cal_draft"] = {"title": extra(c, "es", "title") or "", "begin": int(extra(c, "el", "beginTime") or 0),
                           "end": int(extra(c, "el", "endTime") or 0), "location": extra(c, "es", "eventLocation") or ""}
        st["app"] = "calendar_edit"
        return "Starting: Intent { act=android.intent.action.INSERT }\n"
    return None


def notif_dump(st: dict) -> str:
    rows = st.get("notifs")
    if rows is None:
        rows = [{"app": "com.whatsapp", "title": "Maman", "text": "Tu rentres à quelle heure ?"},
                {"app": "com.google.android.gm", "title": "Banque Rawbank", "text": "Votre relevé d'octobre est disponible"}]
    out = ["Current Notification Manager state:"]
    for i, n in enumerate(rows, 1):
        out.append(f"  NotificationRecord(0x0a1b2c{i:02d}: pkg={n['app']} user=UserHandle{{0}} id={i} tag=null "
                   f"importance=4 key=0|{n['app']}|{i}|null|10123: Notification(channel=default))")
        out.append("      extras={")
        out.append(f"        android.title=String ({n.get('title', '')})")
        out.append(f"        android.text=String ({n.get('text', '')})")
        out.append("      }")
    return "\n".join(out) + "\n"


def shell_one(st: dict, c: str) -> str:
    c = re.sub(r"\s*2>&1\s*$", "", c)
    if c.startswith("settings get secure default_input_method"):
        return "com.samsung.android.honeyboard/.service.HoneyBoardService\n"
    r = settings_cmd(st, c)
    if r is not None:
        return r
    pkg, _ = screen(st)
    if c.startswith("wm size"):
        return f"Physical size: {W}x{H}\n"
    if "SurfaceOrientation" in c:
        return "    SurfaceOrientation: 0\n"
    if c.startswith("rm -f /sdcard/zeus_ui.xml") or c.startswith("uiautomator dump"):
        return ""
    if c.startswith("cat /sdcard/zeus_ui.xml"):
        return to_xml(screen(st)[1])
    if "mCurrentFocus" in c:
        act = {"com.whatsapp": "com.whatsapp.HomeActivity"}.get(pkg, "MainActivity")
        return f"  mCurrentFocus=Window{{1a2b3c u0 {pkg}/{pkg}.{act}}}\n"
    if "mInputShown" in c:
        return f"  mInputShown={'true' if st['app'] in ('whatsapp_chat', 'messages_compose') else 'false'}\n"
    if "Display Power" in c:
        return "Display Power: state=ON\nmWakefulness=Awake\n"
    if "mDreamingLockscreen" in c:
        return "    mShowingLockscreen=false mDreamingLockscreen=false\n"
    if c.startswith("getprop ro.product.manufacturer"):
        return "samsung\n"
    if c.startswith("getprop ro.product.model"):
        return "SM-A515F\n"
    if c.startswith("getprop ro.build.version.release"):
        return "13\n"
    if c.startswith("dumpsys battery"):
        return "Current Battery Service state:\n  AC powered: false\n  status: 2\n  level: 76\n"
    if c.startswith("pm list packages"):
        pk = ["com.whatsapp", "com.google.android.youtube", "com.vodacom.mpesa.cd", "com.samsung.android.messaging",
              "com.android.settings", "com.android.chrome", "org.telegram.messenger", "com.sec.android.app.launcher"]
        flt = c.split()[-1] if len(c.split()) > 3 else ""
        return "".join(f"package:{p}\n" for p in pk if flt in p)
    if c.startswith("monkey -p"):
        p = re.search(r"-p '?([\w.]+)'?", c).group(1)  # type: ignore[union-attr]
        st["app"] = {"com.whatsapp": "whatsapp_home", "com.google.android.youtube": "youtube",
                     "com.vodacom.mpesa.cd": "mpesa", "com.android.settings": "settings"}.get(p, "youtube")
        return "Events injected: 1\n"
    if c.startswith("am start"):
        m = re.search(r"-d '([^']+)'", c)
        url = m.group(1) if m else ""
        if "api.whatsapp.com/send" in url:
            q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            st["app"], st["wa_to"], st["wa_text"] = "whatsapp_chat", "+" + q.get("phone", [""])[0], q.get("text", [""])[0]
        elif url.startswith("smsto:"):
            body = re.search(r"--es sms_body '((?:[^']|'\\'')*)'", c)
            st["app"], st["sms_to"] = "messages_compose", url[6:]
            st["sms_body"] = body.group(1).replace("'\\''", "'") if body else ""
        elif url.startswith("tel:"):
            st["sent"].append({"via": "call", "to": urllib.parse.unquote(url[4:])})
        else:
            st["app"] = "youtube"
        return "Starting: Intent { act=android.intent.action.VIEW }\n"
    if c.startswith("input tap"):
        _, _, x, y = c.split()[:4]
        n = hit(st, int(x), int(y))
        if n:
            do_action(st, n["action"])
        return ""
    if c.startswith("input text"):
        m = re.match(r"input text '(.*)'$", c, re.S)
        t = (m.group(1) if m else c[11:]).replace("'\\''", "'").replace("%s", " ").replace("%%", "%")
        type_text(st, t)
        return ""
    if c.startswith("input keyevent"):
        codes = c.split()[2:]
        for code in codes:
            if code == "3":
                st["app"] = "home"
            elif code == "4":
                do_action(st, "back")
            elif code == "67" and st.get("field"):
                st[st["field"]] = (st.get(st["field"]) or "")[:-1]
        return ""
    if c.startswith("input swipe"):
        return ""
    if c.startswith("dumpsys notification"):
        return notif_dump(st)
    if "content://com.android.contacts" in c:
        return ("Row: 0 display_name=Maman, data1=+243 81 234 5678\n"
                "Row: 1 display_name=Patrick Mbuyi, data1=0815551234\n"
                "Row: 2 display_name=Bureau, data1=+243 99 000 1111\n")
    if "content://sms/inbox" in c:
        if st.get("sms_denied"):
            return ("Error while accessing provider:sms\njava.lang.SecurityException: Permission Denial: opening "
                    "provider com.android.providers.telephony.SmsProvider\n")
        rows = st.get("sms_inbox")
        if rows is None:
            rows = [{"from": "M-PESA", "body": "Vous avez reçu 50 000 FC", "date": 1793280000000}]
        return "".join(f"Row: {i} address={r['from']}, body={r['body']}, date={r.get('date', 1793280000000)}\n"
                       for i, r in enumerate(rows))
    if c.startswith("settings get secure default_input_method"):
        return "com.samsung.android.honeyboard/.service.HoneyBoardService\n"
    if "ADB_INPUT_B64" in c:
        m = re.search(r"--es msg '([^']+)'", c)
        if m:
            type_text(st, base64.b64decode(m.group(1)).decode("utf-8"))
        return "Broadcasting: Intent { act=ADB_INPUT_B64 }\nBroadcast completed: result=0\n"
    if c.startswith("ime") or c.startswith("cmd statusbar") or c.startswith("wm dismiss-keyguard"):
        return ""
    if c.startswith("dumpsys location"):
        return "    Location[fused -4.325000,15.322200 hAcc=20]\n"
    if c.startswith("ls"):
        return "total 8\n-rw-rw---- 1 u0 u0 1234 2026-10-29 10:00 facture.pdf\n"
    if c.startswith("echo"):
        return c[5:] + "\n"
    return ""


def main(argv: list[str]) -> int:
    # Le vrai adb écrit en UTF-8 ; la console Windows (cp1252) ne sait pas encoder les emoji des écrans simulés.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    st = load()
    args = list(argv)
    if args[:1] == ["-s"]:
        args = args[2:]
    st["log"].append(" ".join(args))
    st["log"] = st["log"][-400:]
    code = 0
    if args[:1] == ["devices"]:
        sys.stdout.write("List of devices attached\n")
        if st.get("connected", True):
            sys.stdout.write("FAKE123\tdevice usb:1-1 product:a51nsxx model:SM_A515F device:a51 transport_id:1\n")
        sys.stdout.write("\n")
    elif args[:1] == ["shell"]:
        sys.stdout.write(shell(st, " ".join(args[1:])))
    elif args[:3] == ["exec-out", "screencap", "-p"]:
        sys.stdout.flush()
        sys.stdout.buffer.write(png(st))
    elif args[:1] == ["install"]:
        sys.stdout.write("Performing Streamed Install\nSuccess\n")
    elif args[:1] in (["push"], ["pull"]):
        sys.stdout.write("1 file pushed.\n" if args[0] == "push" else "1 file pulled.\n")
        if args[0] == "pull" and len(args) >= 3:
            dest = Path(args[2])
            target = dest / Path(args[1]).name if dest.is_dir() else dest
            target.write_bytes(b"%PDF-1.4 faux")
    elif args[:1] in (["connect"], ["pair"]):
        sys.stdout.write(f"{'connected to' if args[0] == 'connect' else 'Successfully paired to'} {args[1] if len(args) > 1 else ''}\n")
    else:
        sys.stderr.write(f"commande non simulée : {' '.join(args)}\n")
        code = 1
    save(st)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
