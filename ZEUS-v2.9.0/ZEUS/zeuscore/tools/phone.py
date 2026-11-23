"""Contrôle autonome d'un téléphone Android.

Deux façons de brancher le téléphone :
1. ADB depuis le PC (câble USB ou Wi-Fi « débogage sans fil ») — contrôle complet de l'écran.
2. Directement sur le téléphone avec Termux (+ Termux:API pour SMS, appels, contacts, notifications,
   et ADB vers lui-même via le débogage sans fil pour piloter l'écran).

ZEUS lit l'écran sous forme d'éléments numérotés (arbre d'accessibilité : rapide, précis, marche
même avec un petit modèle sans vision) et peut aussi prendre des captures pour un modèle qui voit.
Des « macros » fiables (WhatsApp, SMS, appel) évitent des dizaines d'étapes.
"""

from __future__ import annotations

import base64
import json
import os
import re
import threading
import time
import unicodedata
import urllib.parse
from pathlib import Path
from typing import TYPE_CHECKING, Any
from xml.etree import ElementTree as ET

from ..security import is_finance_package, looks_like_ussd, text_mentions_money
from ..util import IS_MAC, IS_WINDOWS, log, norm, run_cmd, truncate, which, wrap_untrusted
from . import ToolContext, ToolError, ToolResult, p, tool

if TYPE_CHECKING:  # pragma: no cover
    from ..core import Zeus

KEYS = {
    "home": "3", "accueil": "3", "back": "4", "retour": "4", "call": "5", "endcall": "6", "raccrocher": "6",
    "volume_up": "24", "volume_down": "25", "power": "26", "camera": "27", "enter": "66", "entree": "66",
    "delete": "67", "effacer": "67", "backspace": "67", "menu": "82", "search": "84", "recherche": "84",
    "play_pause": "85", "next": "87", "previous": "88", "recents": "187", "applis_recentes": "187",
    "wake": "224", "reveil": "224", "sleep": "223", "veille": "223", "tab": "61", "escape": "111",
    "mute": "164", "screenshot": "120", "space": "62", "espace": "62", "dpad_up": "19", "dpad_down": "20",
    "dpad_left": "21", "dpad_right": "22",
}
STATUSBAR = {"notifications": "cmd statusbar expand-notifications",
             "quick_settings": "cmd statusbar expand-settings", "reglages_rapides": "cmd statusbar expand-settings",
             "collapse": "cmd statusbar collapse", "fermer_volet": "cmd statusbar collapse"}

APPS: dict[str, list[str]] = {
    "whatsapp": ["com.whatsapp", "com.whatsapp.w4b"], "whatsapp business": ["com.whatsapp.w4b"],
    "chrome": ["com.android.chrome"], "navigateur": ["com.android.chrome", "com.sec.android.app.sbrowser"],
    "youtube": ["com.google.android.youtube"], "gmail": ["com.google.android.gm"],
    "maps": ["com.google.android.apps.maps"], "google maps": ["com.google.android.apps.maps"],
    "play store": ["com.android.vending"], "playstore": ["com.android.vending"],
    "facebook": ["com.facebook.katana", "com.facebook.lite"], "messenger": ["com.facebook.orca", "com.facebook.mlite"],
    "instagram": ["com.instagram.android"], "tiktok": ["com.zhiliaoapp.musically", "com.ss.android.ugc.trill"],
    "telegram": ["org.telegram.messenger"], "snapchat": ["com.snapchat.android"], "x": ["com.twitter.android"],
    "twitter": ["com.twitter.android"], "spotify": ["com.spotify.music"], "netflix": ["com.netflix.mediaclient"],
    "messages": ["com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms"],
    "sms": ["com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms"],
    "telephone": ["com.google.android.dialer", "com.samsung.android.dialer", "com.android.dialer"],
    "appels": ["com.google.android.dialer", "com.samsung.android.dialer", "com.android.dialer"],
    "contacts": ["com.google.android.contacts", "com.samsung.android.app.contacts", "com.android.contacts"],
    "parametres": ["com.android.settings"], "reglages": ["com.android.settings"], "settings": ["com.android.settings"],
    "calculatrice": ["com.google.android.calculator", "com.sec.android.app.popupcalculator"],
    "horloge": ["com.google.android.deskclock", "com.sec.android.app.clockpackage"],
    "alarme": ["com.google.android.deskclock", "com.sec.android.app.clockpackage"],
    "galerie": ["com.google.android.apps.photos", "com.sec.android.gallery3d", "com.miui.gallery"],
    "photos": ["com.google.android.apps.photos", "com.sec.android.gallery3d"],
    "calendrier": ["com.google.android.calendar", "com.samsung.android.calendar"],
    "agenda": ["com.google.android.calendar", "com.samsung.android.calendar"],
    "drive": ["com.google.android.apps.docs"], "google": ["com.google.android.googlequicksearchbox"],
    "zoom": ["us.zoom.videomeetings"], "teams": ["com.microsoft.teams"], "outlook": ["com.microsoft.office.outlook"],
    "uber": ["com.ubercab"], "bolt": ["ee.mtakso.client"], "yango": ["com.yandex.yango"],
    "fichiers": ["com.google.android.apps.nbu.files", "com.sec.android.app.myfiles"],
    "mes fichiers": ["com.sec.android.app.myfiles"], "notes": ["com.samsung.android.app.notes", "com.google.android.keep"],
    "keep": ["com.google.android.keep"], "radio": ["com.sec.android.app.fm"], "musique": ["com.google.android.apps.youtube.music"],
}
CAMERA_INTENT = "am start -a android.media.action.STILL_IMAGE_CAMERA"

PKG_LABELS = {
    "com.whatsapp": "WhatsApp", "com.whatsapp.w4b": "WhatsApp Business", "com.android.chrome": "Chrome",
    "com.google.android.youtube": "YouTube", "com.google.android.gm": "Gmail", "org.telegram.messenger": "Telegram",
    "com.facebook.katana": "Facebook", "com.instagram.android": "Instagram", "com.zhiliaoapp.musically": "TikTok",
    "com.google.android.apps.messaging": "Messages", "com.samsung.android.messaging": "Messages",
    "com.android.settings": "Paramètres", "com.android.systemui": "Système (volet/verrouillage)",
    "com.google.android.dialer": "Téléphone", "com.samsung.android.dialer": "Téléphone",
    "com.sec.android.app.launcher": "Écran d'accueil", "com.google.android.apps.nexuslauncher": "Écran d'accueil",
    "com.miui.home": "Écran d'accueil", "com.android.launcher3": "Écran d'accueil",
    "com.google.android.calendar": "Agenda", "com.samsung.android.calendar": "Agenda",
    "com.google.android.deskclock": "Horloge", "com.sec.android.app.clockpackage": "Horloge",
    "com.google.android.contacts": "Contacts", "com.samsung.android.app.contacts": "Contacts",
    "com.android.vending": "Play Store", "com.google.android.apps.maps": "Maps",
    "com.vodacom.mpesa.cd": "M-Pesa", "com.android.mms": "Messages",
}

SEND_RE = re.compile(r"(^|\b)(envoyer|send|envoi|send_button|send_message|sms_send|compose_message_send|"
                     r"send_btn|btn_send)(\b|$)", re.I)


class PhoneError(ToolError):
    pass


def q(s: str) -> str:
    """Guillemets pour le shell du téléphone."""
    return "'" + str(s).replace("'", "'\\''") + "'"


def _bounds(b: str | None) -> tuple[int, int, int, int] | None:
    m = re.match(r"\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", b or "")
    return tuple(int(x) for x in m.groups()) if m else None  # type: ignore[return-value]


def parse_ui(xml: str, width: int = 0, height: int = 0, limit: int = 160) -> list[dict]:
    """Arbre uiautomator → éléments utiles numérotés (ordre de lecture)."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        raise PhoneError(f"arbre d'écran illisible : {e}") from None
    W = width or 100000
    H = height or 100000
    out: list[dict] = []

    def info(n: ET.Element) -> dict | None:
        b = _bounds(n.get("bounds"))
        if not b:
            return None
        x1, y1, x2, y2 = b
        if x2 <= x1 or y2 <= y1 or x2 <= 0 or y2 <= 0 or x1 >= W or y1 >= H:
            return None
        cls = (n.get("class") or "").split(".")[-1]
        return {
            "text": (n.get("text") or "").strip(), "desc": (n.get("content-desc") or "").strip(),
            "rid": (n.get("resource-id") or ""), "cls": cls, "pkg": n.get("package") or "",
            "clickable": n.get("clickable") == "true" or n.get("long-clickable") == "true",
            "editable": "EditText" in cls or "AutoCompleteTextView" in cls,
            "scrollable": n.get("scrollable") == "true", "checkable": n.get("checkable") == "true",
            "checked": n.get("checked") == "true", "enabled": n.get("enabled") != "false",
            "focused": n.get("focused") == "true", "selected": n.get("selected") == "true",
            "password": n.get("password") == "true",
            "bounds": [max(0, x1), max(0, y1), min(W, x2), min(H, y2)],
        }

    def texts_below(n: ET.Element, maxn: int = 3) -> list[str]:
        acc: list[str] = []
        for c in n.iter("node"):
            if c is n:
                continue
            t = (c.get("text") or c.get("content-desc") or "").strip()
            if t and t not in acc:
                acc.append(t)
            if len(acc) >= maxn:
                break
        return acc

    def visit(n: ET.Element, absorbed: bool) -> None:
        i = info(n)
        kids = n.findall("node")
        if i is None:
            for c in kids:
                visit(c, absorbed)
            return
        interactive = i["clickable"] or i["editable"] or i["scrollable"] or i["checkable"]
        label = i["text"] or i["desc"]
        child_absorbed = absorbed
        if interactive:
            if not label and not i["editable"]:
                label = " · ".join(texts_below(n))
                child_absorbed = True
            i["label"] = label
            out.append(i)
        elif label and not absorbed:
            i["label"] = label
            out.append(i)
        for c in kids:
            visit(c, child_absorbed)

    top = root.find("node") if root.tag == "hierarchy" else root
    for n in (root.findall("node") if root.tag == "hierarchy" else [root]):
        visit(n, False)
    if top is None and root.tag != "hierarchy":
        visit(root, False)
    if len(out) > limit:
        inter = [e for e in out if e["clickable"] or e["editable"] or e["scrollable"]]
        rest = [e for e in out if e not in inter]
        out = (inter + rest)[:limit]
        out.sort(key=lambda e: (e["bounds"][1], e["bounds"][0]))
    for idx, e in enumerate(out, 1):
        e["i"] = idx
        x1, y1, x2, y2 = e["bounds"]
        e["x"], e["y"] = (x1 + x2) // 2, (y1 + y2) // 2
    return out


def _kind(e: dict) -> str:
    cls = e["cls"]
    if e["editable"]:
        return "champ"
    if e["checkable"]:
        return "interrupteur" if "Switch" in cls or "Toggle" in cls else "case"
    if "Button" in cls:
        return "bouton"
    if e["clickable"] and "Image" in cls:
        return "icône"
    if e["clickable"]:
        return "élément"
    if e["scrollable"]:
        return "zone défilable"
    if "Image" in cls:
        return "image"
    return "texte"


def format_elements(els: list[dict]) -> str:
    lines = []
    for e in els:
        label = truncate(e.get("label") or "", 90).replace("\n", " ")
        flags = []
        if e["editable"]:
            flags.append("vide" if not e["text"] else "rempli")
            if e["desc"] and e["desc"] != label:
                flags.append(f"indice « {truncate(e['desc'], 40)} »")
        if e["checkable"]:
            flags.append("✓ activé" if e["checked"] else "désactivé")
        if not e["enabled"]:
            flags.append("grisé")
        if e["selected"]:
            flags.append("sélectionné")
        if e["focused"]:
            flags.append("focus")
        if e["password"]:
            flags.append("mot de passe")
        rid = e["rid"].split("/")[-1] if e["rid"] else ""
        if rid and (not label or len(label) < 3):
            flags.append(f"id={rid}")
        lab = f' "{label}"' if label else ""
        fl = f" ({', '.join(flags)})" if flags else ""
        lines.append(f"[{e['i']}] {_kind(e)}{lab}{fl} @{e['x']},{e['y']}")
    return "\n".join(lines)


def _ascii(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).encode(
        "ascii", "ignore").decode()


class Phone:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self._lock = threading.RLock()
        self.elements: list[dict] = []
        self.last_pkg = ""
        self.last_text = ""
        self.last_screen_ts = 0.0
        self.last_shot = ""
        self._dev_cache: tuple[float, list[dict]] = (0.0, [])
        self._size: tuple[int, int] | None = None
        self._size_serial = ""
        self._status_cache: tuple[float, dict] = (0.0, {})
        self._adbkbd: bool | None = None

    # ------------------------------------------------------------------ ADB
    @property
    def cfg(self):
        return self.zeus.config

    def adb_path(self) -> str | None:
        c = self.cfg.get("phone.adb_path") or ""
        if c and Path(c).exists():
            return c
        w = which("adb")
        if w:
            return w
        exe = "adb.exe" if IS_WINDOWS else "adb"
        cands = [self.cfg.home / "tools" / "platform-tools" / exe]
        home = Path.home()
        if IS_WINDOWS:
            la = os.environ.get("LOCALAPPDATA", "")
            if la:
                cands.append(Path(la) / "Android" / "Sdk" / "platform-tools" / exe)
        elif IS_MAC:
            cands.append(home / "Library" / "Android" / "sdk" / "platform-tools" / exe)
        cands.append(home / "Android" / "Sdk" / "platform-tools" / exe)
        for cnd in cands:
            if cnd.exists():
                return str(cnd)
        return None

    def termux_api(self) -> bool:
        return bool(which("termux-sms-send") or which("termux-battery-status"))

    def _adb(self, args: list[str], timeout: float = 20, binary: bool = False, serial: bool = True):
        adb = self.adb_path()
        if not adb:
            raise PhoneError("ADB introuvable. Lance « python zeus.py phone » pour l'installer automatiquement, "
                             "ou installe les « Android platform-tools ».")
        cmd = [adb]
        if serial:
            s = self.serial()
            if not s:
                raise PhoneError("aucun téléphone Android connecté (branche-le en USB avec le débogage USB activé, "
                                 "ou connecte-le en Wi-Fi : « python zeus.py phone »)")
            cmd += ["-s", s]
        return run_cmd(cmd + args, timeout=timeout, binary=binary)

    def devices(self, fresh: bool = False) -> list[dict]:
        ts, cached = self._dev_cache
        if not fresh and time.time() - ts < 8:
            return cached
        if not self.adb_path():
            self._dev_cache = (time.time(), [])
            return []
        code, out, err = self._adb(["devices", "-l"], timeout=12, serial=False)
        devs = []
        for line in (out or "").splitlines()[1:]:
            parts = line.split()
            if len(parts) < 2:
                continue
            d = {"serial": parts[0], "state": parts[1]}
            for kv in parts[2:]:
                if ":" in kv:
                    k, v = kv.split(":", 1)
                    d[k] = v
            devs.append(d)
        self._dev_cache = (time.time(), devs)
        return devs

    def serial(self) -> str | None:
        want = self.cfg.get("phone.serial") or ""
        devs = [d for d in self.devices() if d["state"] == "device"]
        if want and any(d["serial"] == want for d in devs):
            return want
        return devs[0]["serial"] if devs else None

    def connected(self) -> bool:
        try:
            return self.serial() is not None
        except PhoneError:
            return False

    def shell(self, cmd: str, timeout: float = 20) -> str:
        code, out, err = self._adb(["shell", cmd], timeout=timeout)
        if code != 0 and not (out or "").strip():
            msg = (err or "").strip() or f"code {code}"
            if "unauthorized" in msg:
                msg += " — accepte l'autorisation de débogage sur l'écran du téléphone"
            raise PhoneError(msg)
        return out or ""

    # ------------------------------------------------------------------ état
    def screen_size(self) -> tuple[int, int]:
        s = self.serial() or ""
        if self._size and self._size_serial == s:
            return self._size
        out = self.shell("wm size")
        m = re.findall(r"(\d+)x(\d+)", out)
        w, h = (int(m[-1][0]), int(m[-1][1])) if m else (1080, 2400)
        rot = self.shell("dumpsys input | grep -m1 SurfaceOrientation").strip()
        if re.search(r"SurfaceOrientation:\s*[13]", rot):
            w, h = h, w
        self._size, self._size_serial = (w, h), s
        return w, h

    def current_app(self) -> tuple[str, str]:
        out = self.shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | head -n 3")
        m = re.search(r"\s([a-zA-Z0-9_.]+)/([a-zA-Z0-9_.$]+)", out)
        if m:
            return m.group(1), m.group(2)
        m2 = re.search(r"([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)", out)
        return (m2.group(1) if m2 else ""), ""

    def keyboard_shown(self) -> bool:
        try:
            return "mInputShown=true" in self.shell("dumpsys input_method | grep -m1 mInputShown")
        except PhoneError:
            return False

    def screen_state(self) -> dict:
        on, locked = True, False
        try:
            pw = self.shell("dumpsys power | grep -E 'Display Power: state=|mWakefulness=' | head -n 2")
            if "state=OFF" in pw or "mWakefulness=Asleep" in pw or "mWakefulness=Dozing" in pw:
                on = False
            kg = self.shell("dumpsys window | grep -E 'mDreamingLockscreen|isStatusBarKeyguard|mShowingLockscreen|"
                            "KeyguardShowing' | head -n 4")
            locked = bool(re.search(r"(mDreamingLockscreen|isStatusBarKeyguard|mShowingLockscreen|"
                                    r"KeyguardShowing)=true", kg))
        except PhoneError:
            pass
        return {"on": on, "locked": locked}

    def battery(self) -> dict:
        if self.termux_api() and not self.connected():
            code, out, _ = run_cmd(["termux-battery-status"], timeout=10)
            try:
                j = json.loads(out)
                return {"level": j.get("percentage"), "charging": j.get("status") == "CHARGING"}
            except Exception:
                return {}
        out = self.shell("dumpsys battery")
        lv = re.search(r"level:\s*(\d+)", out)
        st = re.search(r"status:\s*(\d+)", out)
        return {"level": int(lv.group(1)) if lv else None, "charging": bool(st and st.group(1) in ("2", "5"))}

    def status(self, cached: bool = False) -> dict:
        ts, st = self._status_cache
        if cached and time.time() - ts < 20 and st:
            return st
        st = {"adb": bool(self.adb_path()), "termux_api": self.termux_api(), "devices": [], "connected": False}
        try:
            st["devices"] = self.devices(fresh=not cached)
            s = self.serial()
            if s:
                st["connected"] = True
                st["serial"] = s
                props = self.shell("getprop ro.product.manufacturer; getprop ro.product.model; "
                                   "getprop ro.build.version.release", timeout=10).split("\n")
                st["manufacturer"], st["model"], st["android"] = [x.strip() for x in (props + ["", "", ""])[:3]]
                st["battery"] = self.battery()
                st.update(self.screen_state())
                pkg, act = self.current_app()
                st["app"] = pkg
                st["adb_keyboard"] = self.has_adb_keyboard()
            elif any(d["state"] == "unauthorized" for d in st["devices"]):
                st["hint"] = "Téléphone détecté mais non autorisé : accepte la fenêtre « Autoriser le débogage USB »."
        except PhoneError as e:
            st["error"] = str(e)
        self._status_cache = (time.time(), st)
        return st

    def summary(self) -> str:
        st = self.status(cached=True)
        if st.get("connected"):
            b = (st.get("battery") or {}).get("level")
            lock = ", verrouillé" if st.get("locked") else ""
            off = ", écran éteint" if not st.get("on", True) else ""
            return (f"Téléphone : {st.get('manufacturer', '')} {st.get('model', '')} (Android {st.get('android', '?')}) "
                    f"connecté{f', batterie {b} %' if b is not None else ''}{off}{lock}.")
        if st.get("termux_api"):
            return "Téléphone : ZEUS tourne sur le téléphone (Termux:API) ; contrôle de l'écran inactif (ADB non relié)."
        if st.get("hint"):
            return "Téléphone : " + st["hint"]
        return "Téléphone : aucun Android connecté (Réglages → Téléphone)."

    # ------------------------------------------------------------------ lecture d'écran
    def ui_xml(self) -> str:
        last_err = ""
        for attempt in range(3):
            out = self.shell("rm -f /sdcard/zeus_ui.xml; uiautomator dump /sdcard/zeus_ui.xml >/dev/null 2>&1; "
                             "cat /sdcard/zeus_ui.xml", timeout=30)
            i = out.find("<?xml")
            if i < 0:
                i = out.find("<hierarchy")
            j = out.rfind("</hierarchy>")
            if i >= 0 and j > i:
                return out[i:j + len("</hierarchy>")]
            last_err = out.strip()[:200]
            time.sleep(0.7 * (attempt + 1))
        raise PhoneError("impossible de lire l'écran (animation en cours, écran sécurisé ou éteint). "
                         f"{last_err} — essaie phone_screen(mode=\"image\").")

    def read_screen(self) -> tuple[str, list[dict], str]:
        with self._lock:
            w, h = self.screen_size()
            xml = self.ui_xml()
            rot = re.search(r'<hierarchy[^>]*rotation="(\d)"', xml[:300])
            if rot:
                landscape = rot.group(1) in ("1", "3")
                w, h = (max(w, h), min(w, h)) if landscape else (min(w, h), max(w, h))
            els = parse_ui(xml, w, h)
            pkg = els[0]["pkg"] if els else ""
            if not pkg:
                pkg, _ = self.current_app()
            kb = self.keyboard_shown()
            self.elements = els
            self.last_pkg = pkg
            self.last_text = " ".join(e.get("label", "") for e in els)[:4000]
            self.last_screen_ts = time.time()
            label = PKG_LABELS.get(pkg, pkg)
            head = f"Appli : {label} ({pkg}) · écran {w}×{h} · clavier {'ouvert' if kb else 'fermé'} · {len(els)} éléments"
            return head, els, pkg

    def screenshot(self) -> Path:
        code, data, err = self._adb(["exec-out", "screencap", "-p"], timeout=25, binary=True)
        if code != 0 or not data or data[:4] != b"\x89PNG":
            # anciens Android : \r\n parasites
            if data and b"PNG" in data[:8]:
                data = data.replace(b"\r\n", b"\n")
            if not data or data[1:4] != b"PNG":
                raise PhoneError(f"capture impossible : {err or 'données invalides'}")
        d = self.cfg.dir("phone")
        f = d / f"ecran_{int(time.time() * 1000)}.png"
        f.write_bytes(data)
        (d / "latest.png").write_bytes(data)
        shots = sorted(d.glob("ecran_*.png"))
        for old in shots[:-25]:
            try:
                old.unlink()
            except OSError:
                pass
        self.last_shot = str(f)
        return f

    # ------------------------------------------------------------------ gestes
    def _publish(self, action: str, **d: Any) -> None:
        self.last_screen_ts = 0.0  # l'écran a changé : la prochaine recherche par texte relira l'écran
        self.zeus.bus.publish("phone_action", action=action, **d)

    def tap(self, x: int, y: int) -> None:
        self.shell(f"input tap {int(x)} {int(y)}")
        self._publish("tap", x=x, y=y)

    def long_press(self, x: int, y: int, ms: int = 900) -> None:
        self.shell(f"input swipe {int(x)} {int(y)} {int(x)} {int(y)} {int(ms)}")
        self._publish("long_press", x=x, y=y)

    def swipe(self, x1: int, y1: int, x2: int, y2: int, ms: int = 350) -> None:
        self.shell(f"input swipe {int(x1)} {int(y1)} {int(x2)} {int(y2)} {int(ms)}")
        self._publish("swipe", x1=x1, y1=y1, x2=x2, y2=y2)

    def key(self, name: str) -> str:
        k = norm(name).replace(" ", "_").replace("-", "_")
        if k in STATUSBAR:
            self.shell(STATUSBAR[k])
            self._publish("key", key=k)
            return k
        code = KEYS.get(k) or (k if k.isdigit() else ("KEYCODE_" + k.upper() if k else ""))
        if not code:
            raise PhoneError(f"touche inconnue : {name}")
        self.shell(f"input keyevent {code}")
        self._publish("key", key=k)
        return k

    def has_adb_keyboard(self) -> bool:
        if self._adbkbd is None:
            try:
                self._adbkbd = "com.android.adbkeyboard" in self.shell("pm list packages com.android.adbkeyboard")
            except PhoneError:
                return False
        return bool(self._adbkbd)

    def type_text(self, text: str) -> str:
        """Saisit du texte. Accents/emoji : nécessite ADBKeyboard, sinon translittération."""
        note = ""
        if text.isascii() and "\n" not in text:
            for i in range(0, len(text), 80):
                chunk = text[i:i + 80].replace("%", "%%").replace(" ", "%s")
                self.shell(f"input text {q(chunk)}")
        elif self.has_adb_keyboard():
            prev = self.shell("settings get secure default_input_method").strip()
            self.shell("ime enable com.android.adbkeyboard/.AdbIME >/dev/null 2>&1; "
                       "ime set com.android.adbkeyboard/.AdbIME >/dev/null 2>&1")
            time.sleep(0.4)
            b64 = base64.b64encode(text.encode("utf-8")).decode()
            self.shell(f"am broadcast -a ADB_INPUT_B64 --es msg {q(b64)} >/dev/null")
            time.sleep(0.3)
            if prev and "adbkeyboard" not in prev:
                self.shell(f"ime set {q(prev)} >/dev/null 2>&1")
        else:
            plain = _ascii(text).replace("\n", " ")
            for i in range(0, len(plain), 80):
                chunk = plain[i:i + 80].replace("%", "%%").replace(" ", "%s")
                self.shell(f"input text {q(chunk)}")
            if plain != text:
                note = (" (accents/emoji retirés : installe ADBKeyboard pour les garder — "
                        "« python zeus.py phone » explique comment)")
        self._publish("type", length=len(text))
        return note

    def clear_field(self, n: int = 60) -> None:
        self.shell("input keyevent KEYCODE_MOVE_END; input keyevent " + " ".join(["67"] * max(1, min(n, 250))))

    # ------------------------------------------------------------------ applis & intents
    def packages(self) -> list[str]:
        out = self.shell("pm list packages", timeout=20)
        return [ln.split(":", 1)[1].strip() for ln in out.splitlines() if ln.startswith("package:")]

    def resolve_app(self, name: str) -> tuple[str | None, list[str]]:
        n = norm(name)
        pkgs = self.packages()
        pset = set(pkgs)
        if "." in name and " " not in name.strip() and name.strip() in pset:
            return name.strip(), []
        for key, cands in APPS.items():
            if n == key or n == key.replace(" ", ""):
                for c in cands:
                    if c in pset:
                        return c, []
        toks = [t for t in re.split(r"[^a-z0-9]+", n) if len(t) >= 3]
        scored = []
        for pk in pkgs:
            pl = pk.lower()
            s = sum(3 if f".{t}" in pl or pl.endswith(t) else 1 for t in toks if t in pl)
            if s:
                scored.append((s, -len(pk), pk))
        scored.sort(reverse=True)
        if scored:
            return scored[0][2], [x[2] for x in scored[1:6]]
        return None, []

    def open_app(self, name: str) -> str:
        if norm(name) in ("appareil photo", "camera", "photo", "appareil"):
            self.shell(CAMERA_INTENT)
            self._publish("open_app", app="camera")
            return "Appareil photo ouvert."
        pkg, others = self.resolve_app(name)
        if not pkg:
            raise PhoneError(f"application « {name} » introuvable sur le téléphone. Essaie le nom exact du paquet, "
                             f"ou ouvre le tiroir d'applications et cherche-la (phone_screen).")
        out = self.shell(f"monkey -p {q(pkg)} -c android.intent.category.LAUNCHER 1 2>&1", timeout=20)
        if "No activities found" in out or "monkey aborted" in out:
            raise PhoneError(f"impossible de lancer {pkg}")
        self._publish("open_app", app=pkg)
        alt = f" (autres candidats : {', '.join(others)})" if others else ""
        return f"Ouvert : {PKG_LABELS.get(pkg, pkg)} ({pkg}){alt}."

    def open_url(self, url: str) -> str:
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", url):
            url = "https://" + url
        out = self.shell(f"am start -a android.intent.action.VIEW -d {q(url)} 2>&1")
        if "Error" in out:
            raise PhoneError(out.strip()[:300])
        self._publish("open_url", url=url)
        return f"Lien ouvert : {url}"

    def normalize_number(self, number: str) -> str:
        raw = str(number).strip()
        if looks_like_ussd(raw):
            return raw.replace(" ", "")
        digits = re.sub(r"[^\d+]", "", raw)
        cc = str(self.cfg.get("phone.country_code") or "").lstrip("+")
        if digits.startswith("00"):
            digits = "+" + digits[2:]
        if cc and digits.startswith("0") and not digits.startswith("00"):
            digits = "+" + cc + digits[1:]
        return digits

    def call(self, number: str) -> str:
        num = self.normalize_number(number)
        if self.termux_api() and not self.connected():
            code, out, err = run_cmd(["termux-telephony-call", num], timeout=15)
            if code != 0:
                raise PhoneError(err or out)
            return f"Appel lancé vers {num}."
        enc = num.replace("#", "%23")
        out = self.shell(f"am start -a android.intent.action.CALL -d {q('tel:' + enc)} 2>&1")
        if "SecurityException" in out or "Error" in out:
            self.shell(f"am start -a android.intent.action.DIAL -d {q('tel:' + enc)}")
            time.sleep(1.5)
            head, els, _ = self.read_screen()
            btn = next((e for e in els if re.search(r"appeler|call|dial|composer", (e.get("label", "") + e["rid"]), re.I)
                        and e["clickable"]), None)
            if not btn:
                raise PhoneError("numéro composé mais bouton d'appel introuvable : vérifie avec phone_screen")
            self.tap(btn["x"], btn["y"])
        self._publish("call", number=num)
        return f"Appel lancé vers {num}."

    def end_call(self) -> str:
        self.shell("input keyevent 6")
        return "Appel terminé."

    def _find_send(self, els: list[dict]) -> dict | None:
        best = None
        for e in els:
            blob = f"{e.get('label', '')} {e['desc']} {e['rid'].split('/')[-1]}"
            if (e["clickable"] or "send" in e["rid"]) and SEND_RE.search(blob):
                if best is None or ("send" in e["rid"] and "send" not in best["rid"]):
                    best = e
        return best

    def send_sms(self, number: str, message: str) -> str:
        num = self.normalize_number(number)
        if self.termux_api() and not self.connected():
            code, out, err = run_cmd(["termux-sms-send", "-n", num, message], timeout=30)
            if code != 0:
                raise PhoneError(err or out or "échec termux-sms-send")
            return f"SMS envoyé à {num}."
        self.shell(f"am start -a android.intent.action.SENDTO -d {q('smsto:' + num)} --es sms_body {q(message)} "
                   f"--ez exit_on_sent true")
        time.sleep(2.0)
        for attempt in range(3):
            head, els, pkg = self.read_screen()
            btn = self._find_send(els)
            if btn and btn["enabled"]:
                self.tap(btn["x"], btn["y"])
                time.sleep(1.2)
                self._publish("sms", number=num)
                return f"SMS envoyé à {num} (bouton « {btn.get('label') or 'envoyer'} » touché)."
            time.sleep(1.0)
        raise PhoneError("l'appli Messages s'est ouverte avec le texte, mais le bouton Envoyer est introuvable. "
                         "Vérifie avec phone_screen et touche-le toi-même.")

    def whatsapp_package(self) -> str | None:
        pk = set(self.packages())
        for c in ("com.whatsapp", "com.whatsapp.w4b"):
            if c in pk:
                return c
        return None

    def send_whatsapp(self, number: str, message: str) -> str:
        pkg = self.whatsapp_package()
        if not pkg:
            raise PhoneError("WhatsApp n'est pas installé sur ce téléphone")
        num = re.sub(r"[^\d]", "", self.normalize_number(number))
        if len(num) < 8:
            raise PhoneError(f"numéro incomplet « {number} » : donne le numéro international (ex. +243…)")
        url = f"https://api.whatsapp.com/send?phone={num}&text={urllib.parse.quote(message)}"
        self.shell(f"am start -a android.intent.action.VIEW -d {q(url)} -p {pkg}")
        time.sleep(3.0)
        for attempt in range(4):
            head, els, cur = self.read_screen()
            txt = norm(self.last_text)
            if "n'est pas sur whatsapp" in txt or "isn't on whatsapp" in txt or "not on whatsapp" in txt:
                raise PhoneError(f"le numéro +{num} n'est pas sur WhatsApp")
            btn = next((e for e in els if e["rid"].endswith(":id/send")), None) or self._find_send(els)
            if btn:
                self.tap(btn["x"], btn["y"])
                time.sleep(1.5)
                self._publish("whatsapp", number=num)
                return f"Message WhatsApp envoyé à +{num}."
            time.sleep(1.5)
        raise PhoneError("WhatsApp est ouvert sur la conversation mais le bouton Envoyer n'apparaît pas "
                         "(vérifie avec phone_screen).")

    # ------------------------------------------------------------------ données
    def notifications(self, limit: int = 25) -> list[dict]:
        if self.termux_api() and not self.connected():
            code, out, _ = run_cmd(["termux-notification-list"], timeout=15)
            try:
                return [{"app": n.get("packageName"), "title": n.get("title"), "text": n.get("content"),
                         "when": n.get("when")} for n in json.loads(out)][:limit]
            except Exception:
                return []
        out = self.shell("dumpsys notification --noredact", timeout=25)
        res: list[dict] = []
        cur: dict | None = None
        for line in out.splitlines():
            m = re.search(r"NotificationRecord\(.*?pkg=([\w.]+)", line)
            if m:
                if cur and (cur.get("title") or cur.get("text")):
                    res.append(cur)
                cur = {"app": m.group(1), "title": "", "text": ""}
                continue
            if cur is None:
                continue
            for key, field in (("android.title=", "title"), ("android.text=", "text"), ("android.bigText=", "big")):
                if key in line:
                    val = line.split(key, 1)[1].strip()
                    val = re.sub(r"^(String|SpannableString|Spannable\w*)\s*\((.*)\)$", r"\2", val)
                    if val and val != "null":
                        cur[field] = val
        if cur and (cur.get("title") or cur.get("text")):
            res.append(cur)
        seen = set()
        uniq = []
        for n in res:
            if n["app"] in ("android", "com.android.systemui") and not n.get("text"):
                continue
            key = (n["app"], n.get("title"), n.get("text"))
            if key in seen:
                continue
            seen.add(key)
            if n.get("big") and len(n["big"]) > len(n.get("text") or ""):
                n["text"] = n.pop("big")
            n.pop("big", None)
            uniq.append(n)
        return uniq[:limit]

    def contacts(self, query: str = "", limit: int = 20) -> list[dict]:
        rows: list[dict] = []
        if self.termux_api() and not self.connected():
            code, out, _ = run_cmd(["termux-contact-list"], timeout=20)
            try:
                rows = [{"name": c.get("name", ""), "number": c.get("number", "")} for c in json.loads(out)]
            except Exception:
                rows = []
        else:
            out = self.shell("content query --uri content://com.android.contacts/data/phones "
                             "--projection display_name:data1", timeout=25)
            if "Permission Denial" in out or "SecurityException" in out:
                raise PhoneError("Android refuse la lecture des contacts par ADB sur ce modèle : donne le numéro, "
                                 "ou ouvre l'appli Contacts avec phone_open_app puis phone_screen.")
            for line in out.splitlines():
                m = re.search(r"display_name=(.*?), data1=(.*)$", line)
                if m:
                    rows.append({"name": m.group(1).strip(), "number": m.group(2).strip()})
        if query:
            qn = norm(query)
            toks = qn.split()
            rows = [r for r in rows if all(t in norm(r["name"]) for t in toks) or
                    re.sub(r"\D", "", query) and re.sub(r"\D", "", query) in re.sub(r"\D", "", r["number"])]
        uniq, seen = [], set()
        for r in rows:
            k = (r["name"], re.sub(r"\D", "", r["number"]))
            if k not in seen:
                seen.add(k)
                uniq.append(r)
        return uniq[:limit]

    def read_sms(self, limit: int = 10, query: str = "") -> list[dict]:
        if self.termux_api() and not self.connected():
            code, out, err = run_cmd(["termux-sms-list", "-l", str(limit * 3)], timeout=20)
            try:
                rows = [{"from": m.get("number"), "body": m.get("body"), "date": m.get("received")}
                        for m in json.loads(out)]
            except Exception:
                raise PhoneError(err or "lecture des SMS impossible") from None
        else:
            out = self.shell("content query --uri content://sms/inbox --projection address:body:date "
                             "--sort 'date DESC'", timeout=25)
            if "Permission Denial" in out or "SecurityException" in out:
                raise PhoneError("Android refuse la lecture des SMS par ADB sur ce modèle : utilise "
                                 "phone_notifications ou ouvre l'appli Messages avec phone_screen.")
            rows = []
            for line in out.splitlines():
                m = re.search(r"address=(.*?), body=(.*), date=(\d+)$", line)
                if m:
                    rows.append({"from": m.group(1), "body": m.group(2),
                                 "date": time.strftime("%Y-%m-%d %H:%M", time.localtime(int(m.group(3)) / 1000))})
        if query:
            qn = norm(query)
            rows = [r for r in rows if qn in norm(f"{r['from']} {r['body']}")]
        return rows[:limit]

    def wake(self) -> str:
        self.shell("input keyevent 224")
        time.sleep(0.5)
        st = self.screen_state()
        if st["locked"]:
            self.shell("wm dismiss-keyguard >/dev/null 2>&1")
            w, h = self.screen_size()
            self.swipe(w // 2, int(h * 0.85), w // 2, int(h * 0.25), 300)
            time.sleep(0.6)
            from ..config import Config
            pin = Config.secret(self.cfg.get("phone.unlock_pin") or "")
            if pin and self.screen_state()["locked"]:
                self.shell(f"input text {q(pin)}; input keyevent 66")
                time.sleep(1.0)
        st = self.screen_state()
        self._status_cache = (0.0, {})
        return "Écran allumé et déverrouillé." if not st["locked"] else \
            "Écran allumé mais toujours verrouillé (code inconnu : déverrouille-le, ou renseigne phone.unlock_pin)."


    # ------------------------------------------------------------------ réglages rapides
    def _try(self, *cmds: str) -> tuple[bool, str]:
        """Essaie plusieurs commandes équivalentes (selon la version d'Android) ; s'arrête à la première qui passe."""
        last = ""
        for c in cmds:
            try:
                out = self.shell(c + " 2>&1", timeout=15)
            except PhoneError as e:
                last = str(e)
                continue
            low = out.lower()
            if any(w in low for w in ("unknown command", "unknown option", "exception", "not found", "inaccessible",
                                      "permission denial", "usage:", "error", "invalid", "no shell command")):
                last = out.strip()[:200]
                continue
            return True, out.strip()
        return False, last

    def _setting(self, ns: str, key: str) -> str:
        try:
            v = self.shell(f"settings get {ns} {key}", timeout=10).strip()
        except PhoneError:
            return ""
        return "" if v == "null" else v

    def wireless_adb(self) -> bool:
        s = self.serial() or ""
        return ":" in s or s.startswith("adb-")

    def volume(self, stream: int, percent: float | None = None) -> str:
        """Lit (percent=None) ou règle un volume. stream : 2 sonnerie, 3 médias, 4 alarmes, 5 notifications."""
        out = ""
        base = ""
        for b in ("cmd media_session volume", "media volume"):
            try:
                out = self.shell(f"{b} --stream {stream} --get 2>&1", timeout=15)
            except PhoneError:
                continue
            if re.search(r"volume is \d+ in range", out):
                base = b
                break
        m = re.search(r"volume is (\d+) in range \[(\d+)\.\.(\d+)\]", out)
        if not m:
            raise PhoneError("réglage du volume indisponible sur ce téléphone (utilise phone_key volume_up / volume_down)")
        cur, lo, hi = (int(x) for x in m.groups())
        if percent is None:
            return f"{round(100 * (cur - lo) / max(1, hi - lo))} %"
        val = lo + int((hi - lo) * max(0.0, min(100.0, percent)) / 100 + 0.5)
        self.shell(f"{base} --stream {stream} --set {val} 2>&1", timeout=15)
        return f"{round(100 * (val - lo) / max(1, hi - lo))} %"

    def read_settings(self) -> dict[str, Any]:
        keys = [("wifi", "global", "wifi_on"), ("bluetooth", "global", "bluetooth_on"),
                ("donnees", "global", "mobile_data"), ("avion", "global", "airplane_mode_on"),
                ("ne_pas_deranger", "global", "zen_mode"), ("luminosite", "system", "screen_brightness"),
                ("luminosite_auto", "system", "screen_brightness_mode"), ("rotation", "system", "accelerometer_rotation"),
                ("localisation", "secure", "location_mode"), ("mise_en_veille", "system", "screen_off_timeout")]
        out = self.shell("; echo @@; ".join(f"settings get {ns} {k}" for _, ns, k in keys), timeout=20)
        vals = [v.strip() for v in out.split("@@")]
        raw = {name: (vals[i] if i < len(vals) and vals[i] != "null" else "") for i, (name, _, _) in enumerate(keys)}
        res: dict[str, Any] = {}
        for k in ("wifi", "bluetooth", "donnees", "avion", "rotation"):
            if raw[k] != "":
                res[k] = raw[k] not in ("0",) if k != "wifi" else raw[k] in ("1", "2")
        if raw["ne_pas_deranger"] != "":
            res["ne_pas_deranger"] = raw["ne_pas_deranger"] != "0"
        if raw["localisation"] != "":
            res["localisation"] = raw["localisation"] != "0"
        if raw["luminosite"].isdigit():
            res["luminosite"] = "auto" if raw["luminosite_auto"] == "1" else f"{round(int(raw['luminosite']) * 100 / 255)} %"
        if raw["mise_en_veille"].isdigit():
            res["mise_en_veille"] = f"{int(raw['mise_en_veille']) // 1000} s"
        for name, stream in (("volume", 3), ("sonnerie", 2)):
            try:
                res[name] = self.volume(stream)
            except PhoneError:
                pass
        return res

    def set_setting(self, setting: str, value: str) -> str:
        s = norm(setting).replace("-", "_").replace(" ", "_")
        v = norm(str(value)).strip()
        on = v in ("on", "1", "true", "oui", "active", "activer", "allume", "allumer", "enable", "marche", "ouvert")
        off = v in ("off", "0", "false", "non", "desactive", "desactiver", "eteins", "eteindre", "disable", "arret",
                    "coupe", "couper", "ferme")
        num = None
        mnum = re.search(r"-?\d+(?:[.,]\d+)?", v)
        if mnum:
            num = float(mnum.group(0).replace(",", "."))

        def need_bool() -> None:
            if not (on or off):
                raise PhoneError(f"valeur attendue pour {setting} : on ou off")

        def verdict(name: str, art: str, ok: bool, msg: str, fem: bool = False, plural: bool = False,
                    check: tuple | None = None) -> str:
            word = ("activé" if on else "désactivé") + ("e" if fem else "") + ("s" if plural else "")
            if not ok:
                return (f"Impossible de régler {art}{name} directement (Android a répondu : {msg or 'refus'}). "
                        f"Passe par phone_task (« {'active' if on else 'désactive'} {art}{name} dans les réglages "
                        f"rapides »).")
            if check:
                time.sleep(1.0)
                cur = self._setting(check[0], check[1])
                if cur and (cur in check[2]) != on:
                    return (f"Commande envoyée pour {art}{name}, mais l'état lu ne correspond pas (Android demande "
                            f"peut-être une confirmation à l'écran) : vérifie avec phone_screen.")
            return f"{name[0].upper()}{name[1:]} {word} ✓"

        if s in ("wifi", "wi_fi"):
            need_bool()
            ok, msg = self._try(f"cmd wifi set-wifi-enabled {'enabled' if on else 'disabled'}",
                                f"svc wifi {'enable' if on else 'disable'}")
            return verdict("Wi-Fi", "le ", ok, msg, check=("global", "wifi_on", ("1", "2")))
        if s == "bluetooth":
            need_bool()
            ok, msg = self._try(f"cmd bluetooth_manager {'enable' if on else 'disable'}",
                                f"svc bluetooth {'enable' if on else 'disable'}")
            return verdict("Bluetooth", "le ", ok, msg, check=("global", "bluetooth_on", ("1",)))
        if s in ("donnees", "data", "donnees_mobiles", "mobile_data", "internet", "4g", "5g"):
            need_bool()
            ok, msg = self._try(f"svc data {'enable' if on else 'disable'}")
            return verdict("données mobiles", "les ", ok, msg, fem=True, plural=True)
        if s in ("avion", "mode_avion", "airplane"):
            need_bool()
            ok, msg = self._try(f"cmd connectivity airplane-mode {'enable' if on else 'disable'}")
            return verdict("mode avion", "le ", ok, msg, check=("global", "airplane_mode_on", ("1",)))
        if s in ("luminosite", "brightness", "ecran"):
            if v in ("auto", "automatique", "adaptative"):
                self.shell("settings put system screen_brightness_mode 1")
                return "Luminosité automatique activée."
            if num is None:
                if on or off:
                    num = 80.0 if on else 5.0
                else:
                    raise PhoneError("valeur attendue : 0 à 100, ou auto")
            lvl = max(1, round(255 * max(0.0, min(100.0, num)) / 100))
            self.shell(f"settings put system screen_brightness_mode 0; settings put system screen_brightness {lvl}")
            return f"Luminosité réglée à {round(max(0.0, min(100.0, num)))} %."
        if s in ("volume", "volume_media", "media", "son"):
            return "Volume des médias : " + self.volume(3, num if num is not None else (0 if off else 60)) + "."
        if s in ("sonnerie", "volume_sonnerie", "ring"):
            return "Volume de la sonnerie : " + self.volume(2, num if num is not None else (0 if off else 70)) + "."
        if s in ("volume_alarme", "alarm_volume", "volume_alarmes"):
            return "Volume des alarmes : " + self.volume(4, num if num is not None else 80) + "."
        if s in ("silencieux", "mode_silencieux", "silence", "vibreur"):
            need_bool()
            pct = 0.0 if on else 70.0
            self.volume(2, pct)
            try:
                self.volume(5, pct)
            except PhoneError:
                pass
            return "Mode silencieux activé (sonnerie et notifications coupées)." if on else \
                "Mode silencieux désactivé (sonnerie remise à 70 %)."
        if s in ("ne_pas_deranger", "dnd", "nepasderanger"):
            need_bool()
            ok, msg = self._try(f"cmd notification set_dnd {'priority' if on else 'off'}",
                                f"cmd notification set_dnd {'on' if on else 'off'}")
            return verdict("mode Ne pas déranger", "le ", ok, msg)
        if s in ("rotation", "rotation_auto", "autorotation"):
            need_bool()
            self.shell(f"settings put system accelerometer_rotation {1 if on else 0}")
            return f"Rotation automatique {'activée' if on else 'désactivée'}."
        if s in ("localisation", "gps", "location", "position"):
            need_bool()
            ok, msg = self._try(f"cmd location set-location-enabled {'true' if on else 'false'}",
                                f"settings put secure location_mode {3 if on else 0}")
            return verdict("localisation", "la ", ok, msg, fem=True)
        if s in ("mise_en_veille", "veille", "screen_timeout", "delai_ecran"):
            if num is None:
                raise PhoneError("valeur attendue : nombre de secondes")
            self.shell(f"settings put system screen_off_timeout {int(max(10, num) * 1000)}")
            return f"Mise en veille de l'écran après {int(max(10, num))} s."
        if s in ("lampe", "torche", "flashlight", "lampe_torche", "flash"):
            raise PhoneError("pas de commande directe pour la lampe torche : utilise phone_task « allume la lampe "
                             "torche » (volet des réglages rapides)")
        raise PhoneError(f"réglage inconnu « {setting} ». Réglages possibles : wifi, bluetooth, donnees, avion, "
                         f"luminosite, volume, sonnerie, volume_alarme, silencieux, ne_pas_deranger, rotation, "
                         f"localisation, mise_en_veille, etat")

    # ------------------------------------------------------------------ alarmes, minuteurs, agenda
    def alarm(self, hour: int, minute: int, label: str = "", days: list[int] | None = None) -> str:
        cmd = (f"am start -a android.intent.action.SET_ALARM --ei android.intent.extra.alarm.HOUR {int(hour)} "
               f"--ei android.intent.extra.alarm.MINUTES {int(minute)} --ez android.intent.extra.alarm.SKIP_UI true")
        if label:
            cmd += f" --es android.intent.extra.alarm.MESSAGE {q(label)}"
        if days:
            cmd += " --eial android.intent.extra.alarm.DAYS " + ",".join(str(d) for d in days)
        out = self.shell(cmd + " 2>&1")
        if "Error" in out:
            raise PhoneError(out.strip()[:200])
        self._publish("alarm", hour=hour, minute=minute)
        return f"Alarme réglée à {int(hour):02d}:{int(minute):02d}" + (f" « {label} »" if label else "")

    def timer(self, seconds: int, label: str = "") -> str:
        cmd = (f"am start -a android.intent.action.SET_TIMER --ei android.intent.extra.alarm.LENGTH {int(seconds)} "
               f"--ez android.intent.extra.alarm.SKIP_UI true")
        if label:
            cmd += f" --es android.intent.extra.alarm.MESSAGE {q(label)}"
        out = self.shell(cmd + " 2>&1")
        if "Error" in out:
            raise PhoneError(out.strip()[:200])
        self._publish("timer", seconds=seconds)
        m, s = divmod(int(seconds), 60)
        return f"Minuteur lancé : {m} min {s:02d} s" + (f" « {label} »" if label else "")

    def calendar_add(self, title: str, begin: float, end: float, location: str = "", description: str = "") -> str:
        cmd = (f"am start -a android.intent.action.INSERT -d content://com.android.calendar/events "
               f"--es title {q(title)} --el beginTime {int(begin * 1000)} --el endTime {int(end * 1000)}")
        if location:
            cmd += f" --es eventLocation {q(location)}"
        if description:
            cmd += f" --es description {q(description)}"
        self.shell(cmd + " 2>&1")
        time.sleep(2.0)
        for _ in range(3):
            head, els, pkg = self.read_screen()
            btn = next((e for e in els if e["clickable"] and re.search(
                r"^(enregistrer|save|ok|termine|done|ajouter)$", norm(e.get("label", "")), re.I)), None) or \
                next((e for e in els if e["clickable"] and re.search(r"save|enregistr", e["rid"] + " " + e.get("label", ""), re.I)), None)
            if btn:
                self.tap(btn["x"], btn["y"])
                time.sleep(1.0)
                self._publish("calendar", title=title)
                return f"Événement « {title} » ajouté à l'agenda."
            time.sleep(1.0)
        return f"L'agenda s'est ouvert avec « {title} » pré-rempli, mais le bouton Enregistrer est introuvable : vérifie avec phone_screen."

    # ------------------------------------------------------------------ capture annotée
    def annotate(self, shot: Path, elements: list[dict]) -> Path | None:
        """Repères numérotés dessinés sur la capture (aide les modèles qui voient). Nécessite Pillow."""
        try:
            from PIL import Image, ImageDraw, ImageFont  # type: ignore
        except ImportError:
            return None
        try:
            im = Image.open(shot).convert("RGB")
            sw, sh = self.screen_size()
            sx, sy = im.width / max(1, sw), im.height / max(1, sh)  # capture et écran peuvent différer
            dr = ImageDraw.Draw(im)
            fs = max(12, im.width // 40)
            try:
                font = ImageFont.truetype("DejaVuSans-Bold.ttf", fs)
            except Exception:
                try:
                    font = ImageFont.load_default(size=fs)
                except TypeError:
                    font = ImageFont.load_default()
            lw = max(2, im.width // 360)
            for e in elements:
                if not (e["clickable"] or e["editable"] or e["checkable"]):
                    continue
                x1, y1, x2, y2 = (int(e["bounds"][0] * sx), int(e["bounds"][1] * sy), int(e["bounds"][2] * sx),
                                  int(e["bounds"][3] * sy))
                dr.rectangle([x1, y1, x2, y2], outline=(255, 216, 74), width=lw)
                tag = str(e["i"])
                tw, th = int(fs * 0.62 * len(tag) + fs * 0.6), int(fs * 1.25)
                dr.rectangle([x1, y1, x1 + tw, y1 + th], fill=(255, 216, 74))
                dr.text((x1 + fs * 0.3, y1 + fs * 0.08), tag, fill=(20, 16, 0), font=font)
            scale = min(1.0, float(self.cfg.get("phone.screenshot_max") or 1280) / max(im.size))
            if scale < 1:
                im = im.resize((int(im.width * scale), int(im.height * scale)))
            out = shot.with_name(shot.stem + "_reperes.jpg")
            im.save(out, "JPEG", quality=82)
            for old in sorted(shot.parent.glob("ecran_*_reperes.jpg"))[:-10]:
                try:
                    old.unlink()
                except OSError:
                    pass
            return out
        except Exception as e:  # noqa: BLE001
            log.debug("annotation impossible : %s", e)
            return None


# =========================================================================== garde « argent »
def _target(ctx: ToolContext, a: dict) -> dict | None:
    ph = ctx.zeus.phone
    el = a.get("element")
    if el:
        try:
            el = int(el)
        except (TypeError, ValueError):
            return None
        return next((e for e in ph.elements if e["i"] == el), None)
    t = a.get("text")
    if t:
        tn = norm(str(t))
        return next((e for e in ph.elements if tn and tn in norm(e.get("label", ""))), None)
    return None


def money_guard(ctx: ToolContext, a: dict) -> str:
    ph = ctx.zeus.phone
    if is_finance_package(ph.last_pkg):
        return "money"
    tgt = _target(ctx, a)
    label = (tgt or {}).get("label", "") + " " + str(a.get("text", ""))
    if text_mentions_money(label):
        return "money"
    if text_mentions_money(ph.last_text) and re.search(
            r"confirm|valid|envoy|send|ok\b|suivant|continuer|payer|pay|transf|oui|accept", norm(label)):
        return "money"
    typed = str(a.get("text", "")) if "text" in a and "element" in a else ""
    if typed and re.fullmatch(r"\s*\d{4,6}\s*", typed) and re.search(r"pin|code|mot de passe", norm(ph.last_text)):
        return "money"
    if looks_like_ussd(str(a.get("text", ""))):
        return "money"
    return "write"


def type_guard(ctx: ToolContext, a: dict) -> str:
    ph = ctx.zeus.phone
    txt = str(a.get("text", ""))
    if is_finance_package(ph.last_pkg) or looks_like_ussd(txt):
        return "money"
    if re.fullmatch(r"\s*\d{4,6}\s*", txt) and re.search(r"pin|code|secret|mot de passe", norm(ph.last_text)):
        return "money"
    return "write"


def _need(ctx: ToolContext) -> Phone:
    ph = ctx.zeus.phone
    if not ph.connected():
        st = ph.status()
        raise PhoneError(st.get("hint") or st.get("error") or "aucun téléphone Android connecté")
    return ph


def _resolve_point(ctx: ToolContext, element: int | None, x: int | None, y: int | None,
                   text: str | None) -> tuple[int, int, str]:
    ph = ctx.zeus.phone
    if element:
        e = next((e for e in ph.elements if e["i"] == int(element)), None)
        if not e:
            raise PhoneError(f"élément [{element}] inconnu : relis l'écran avec phone_screen")
        return e["x"], e["y"], f"[{e['i']}] « {truncate(e.get('label') or e['cls'], 50)} »"
    if text:
        tn = norm(text)
        if not ph.elements or time.time() - ph.last_screen_ts > 3:
            ph.read_screen()
        cands = [e for e in ph.elements if tn and tn in norm(e.get("label", ""))]
        if not cands:
            ph.read_screen()
            cands = [e for e in ph.elements if tn and tn in norm(e.get("label", ""))]
        if not cands:
            raise PhoneError(f"aucun élément visible contenant « {text} » (relis l'écran, fais défiler ?)")
        cands.sort(key=lambda e: (0 if norm(e.get("label", "")) == tn else 1, 0 if e["clickable"] else 1))
        e = cands[0]
        return e["x"], e["y"], f"[{e['i']}] « {truncate(e.get('label', ''), 50)} »"
    if x is not None and y is not None:
        return int(x), int(y), f"({x},{y})"
    raise PhoneError("indique element (numéro), text, ou x et y")


def _after(ctx: ToolContext, msg: str, wait: float = 0.9, look: bool = True) -> ToolResult:
    """Après un geste : attend un peu puis renvoie le nouvel écran (vérification automatique)."""
    ph = ctx.zeus.phone
    time.sleep(wait)
    if not look:
        return ToolResult(text=msg)
    try:
        head, els, _ = ph.read_screen()
        return ToolResult(text=f"{msg}\n\nNouvel écran — {head}\n" +
                          wrap_untrusted("ecran", format_elements(els) or "(aucun élément lisible)"))
    except PhoneError as e:
        return ToolResult(text=f"{msg}\n(écran non relu : {e})")


# =========================================================================== outils
def _ph_tool(name: str, desc: str, params: dict | None = None, required: list | None = None, risk: str = "write",
             **kw: Any):
    return tool(name, desc, params, required, risk=risk, toolset="phone", **kw)


@_ph_tool("phone_status", "État du téléphone : connexion, modèle, batterie, écran, appli ouverte.", risk="read")
def phone_status(ctx: ToolContext) -> str:
    st = ctx.zeus.phone.status()
    if not st.get("connected"):
        lines = ["Aucun téléphone contrôlable par ADB."]
        if not st.get("adb"):
            lines.append("ADB n'est pas installé (« python zeus.py phone » l'installe).")
        if st.get("devices"):
            lines.append("Appareils vus : " + ", ".join(f"{d['serial']} ({d['state']})" for d in st["devices"]))
        if st.get("hint"):
            lines.append(st["hint"])
        if st.get("termux_api"):
            lines.append("Termux:API disponible : SMS, appels, contacts, notifications fonctionnent.")
        return "\n".join(lines)
    b = st.get("battery") or {}
    return (f"{st.get('manufacturer')} {st.get('model')} — Android {st.get('android')} — série {st.get('serial')}\n"
            f"Batterie : {b.get('level')} %{' (en charge)' if b.get('charging') else ''}\n"
            f"Écran : {'allumé' if st.get('on') else 'éteint'}{', verrouillé' if st.get('locked') else ''}\n"
            f"Appli au premier plan : {PKG_LABELS.get(st.get('app', ''), st.get('app'))}\n"
            f"Saisie avec accents : {'oui (ADBKeyboard)' if st.get('adb_keyboard') else 'non (installe ADBKeyboard)'}")


@_ph_tool("phone_screen", "Lit l'écran du téléphone : éléments numérotés [n] (boutons, champs, textes) avec "
                          "coordonnées. mode=both : liste + capture annotée de repères [n] (modèle qui voit). "
                          "mode=image : capture brute (appli sans éléments lisibles).",
          {"mode": p("string", "ui (défaut), image, ou both", enum=["ui", "image", "both"])}, risk="read")
def phone_screen(ctx: ToolContext, mode: str = "ui") -> ToolResult:
    ph = _need(ctx)
    images: list[str] = []
    text = ""
    if mode in ("ui", "both"):
        try:
            head, els, pkg = ph.read_screen()
            body = format_elements(els)
            text = f"{head}\n" + wrap_untrusted("ecran", body or "(aucun élément lisible : utilise mode=image)")
            if is_finance_package(pkg):
                text += "\n⚠️ Appli financière : toute validation demandera la confirmation du propriétaire."
        except PhoneError as e:
            if mode == "ui":
                mode = "image"
                text = f"(lecture des éléments impossible : {e} — capture à la place)"
            else:
                text = f"(éléments illisibles : {e})"
    if mode in ("image", "both"):
        f = ph.screenshot()
        w, h = ph.screen_size()
        marked = ph.annotate(f, ph.elements) if mode == "both" and ph.elements else None
        if marked:
            images.append(str(marked))
            text += f"\nCapture annotée : {marked} — chaque cadre jaune porte le numéro [n] de l'élément."
        else:
            images.append(str(f))
            text += (f"\nCapture : {f} ({w}×{h}). Coordonnées pour phone_tap(x, y) = pixels de cette capture.")
    ctx.emit("phone_screen", image=images[0] if images else ph.last_shot)
    return ToolResult(text=text.strip(), images=images)


@_ph_tool("phone_tap", "Touche un élément de l'écran : par numéro [n] (recommandé), par texte visible, ou par x/y.",
          {"element": p("integer", "Numéro [n] donné par phone_screen"), "text": p("string", "Texte visible de l'élément"),
           "x": p("integer"), "y": p("integer")}, risk_fn=money_guard,
          summary=lambda a: f"Toucher l'élément {a.get('element') or a.get('text') or (a.get('x'), a.get('y'))} sur le téléphone")
def phone_tap(ctx: ToolContext, element: int | None = None, text: str | None = None, x: int | None = None,
              y: int | None = None) -> ToolResult:
    ph = _need(ctx)
    px, py, what = _resolve_point(ctx, element, x, y, text)
    ph.tap(px, py)
    return _after(ctx, f"Touché {what}.")


@_ph_tool("phone_long_press", "Appui long sur un élément (menu contextuel, sélection…).",
          {"element": p("integer"), "text": p("string"), "x": p("integer"), "y": p("integer"),
           "duration_ms": p("integer", "Durée (900 ms)")}, risk_fn=money_guard)
def phone_long_press(ctx: ToolContext, element: int | None = None, text: str | None = None, x: int | None = None,
                     y: int | None = None, duration_ms: int = 900) -> ToolResult:
    ph = _need(ctx)
    px, py, what = _resolve_point(ctx, element, x, y, text)
    ph.long_press(px, py, duration_ms)
    return _after(ctx, f"Appui long sur {what}.")


@_ph_tool("phone_swipe", "Glisse le doigt d'un point à un autre (coordonnées en pixels).",
          {"x1": p("integer"), "y1": p("integer"), "x2": p("integer"), "y2": p("integer"),
           "duration_ms": p("integer", "Durée (350 ms)")}, required=["x1", "y1", "x2", "y2"])
def phone_swipe(ctx: ToolContext, x1: int, y1: int, x2: int, y2: int, duration_ms: int = 350) -> ToolResult:
    ph = _need(ctx)
    ph.swipe(x1, y1, x2, y2, duration_ms)
    return _after(ctx, "Glissement effectué.")


@_ph_tool("phone_scroll", "Fait défiler l'écran (ou une zone) pour voir la suite : direction bas/haut/gauche/droite.",
          {"direction": p("string", "bas = voir la suite en dessous", enum=["bas", "haut", "gauche", "droite"]),
           "element": p("integer", "Zone défilable [n] (facultatif)"),
           "amount": p("number", "Ampleur 0.2 à 0.9 (0.6)")})
def phone_scroll(ctx: ToolContext, direction: str = "bas", element: int | None = None, amount: float = 0.6) -> ToolResult:
    ph = _need(ctx)
    w, h = ph.screen_size()
    x1, y1, x2, y2 = 0, int(h * 0.12), w, int(h * 0.88)
    if element:
        e = next((e for e in ph.elements if e["i"] == int(element)), None)
        if e:
            x1, y1, x2, y2 = e["bounds"]
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    a = max(0.15, min(float(amount or 0.6), 0.95))
    dy, dx = int((y2 - y1) * a / 2), int((x2 - x1) * a / 2)
    d = norm(direction)
    if d in ("bas", "down"):
        ph.swipe(cx, cy + dy, cx, cy - dy, 400)
    elif d in ("haut", "up"):
        ph.swipe(cx, cy - dy, cx, cy + dy, 400)
    elif d in ("droite", "right"):
        ph.swipe(cx + dx, cy, cx - dx, cy, 350)
    else:
        ph.swipe(cx - dx, cy, cx + dx, cy, 350)
    return _after(ctx, f"Défilement vers {direction}.", 0.8)


@_ph_tool("phone_type", "Écrit du texte dans le champ actif (ou touche d'abord le champ [n]). submit=true valide "
                        "avec Entrée.",
          {"text": p("string", "Texte à écrire"), "element": p("integer", "Champ à toucher avant (facultatif)"),
           "clear": p("boolean", "Effacer le contenu existant avant"),
           "submit": p("boolean", "Appuyer sur Entrée après")}, required=["text"], risk_fn=type_guard,
          summary=lambda a: f"Écrire sur le téléphone : « {truncate(str(a.get('text', '')), 200)} »")
def phone_type(ctx: ToolContext, text: str, element: int | None = None, clear: bool = False,
               submit: bool = False) -> ToolResult:
    ph = _need(ctx)
    if element:
        px, py, _ = _resolve_point(ctx, element, None, None, None)
        ph.tap(px, py)
        time.sleep(0.5)
        if clear:
            e = next((e for e in ph.elements if e["i"] == int(element)), {})
            ph.clear_field(len(e.get("text") or "") + 5 if e else 60)
    elif clear:
        ph.clear_field()
    note = ph.type_text(text)
    if submit:
        time.sleep(0.2)
        ph.key("enter")
    return _after(ctx, f"Texte saisi{note}{' + Entrée' if submit else ''}.", 0.6)


@_ph_tool("phone_key", "Appuie sur une touche : back, home, recents, enter, delete, power, wake, volume_up, "
                       "volume_down, notifications, quick_settings, collapse…",
          {"key": p("string", "Nom de la touche")}, required=["key"], risk_fn=lambda c, a: "money" if (
              norm(a.get("key", "")) in ("enter", "entree") and money_guard(c, {"text": "valider"}) == "money") else "write")
def phone_key(ctx: ToolContext, key: str) -> ToolResult:
    ph = _need(ctx)
    k = ph.key(key)
    return _after(ctx, f"Touche « {k} » pressée.", 0.8 if k not in ("power", "sleep", "veille") else 0.3,
                  look=k not in ("power", "sleep", "veille"))


@_ph_tool("phone_open_app", "Ouvre une application par son nom (WhatsApp, YouTube, M-Pesa…) ou son paquet.",
          {"name": p("string", "Nom de l'appli")}, required=["name"])
def phone_open_app(ctx: ToolContext, name: str) -> ToolResult:
    ph = _need(ctx)
    msg = ph.open_app(name)
    return _after(ctx, msg, 2.0)


@_ph_tool("phone_open_url", "Ouvre un lien sur le téléphone (site web, lien d'appli, maps:, mailto:…).",
          {"url": p("string")}, required=["url"])
def phone_open_url(ctx: ToolContext, url: str) -> ToolResult:
    ph = _need(ctx)
    return _after(ctx, ph.open_url(url), 2.0)


def _call_risk(ctx: ToolContext, a: dict) -> str:
    return "money" if looks_like_ussd(str(a.get("number", ""))) else "external"


@_ph_tool("phone_call", "Passe un appel (numéro ou nom d'un contact). Les codes USSD (*…#) demandent confirmation.",
          {"number": p("string", "Numéro, code USSD ou nom du contact")}, required=["number"], risk="external",
          risk_fn=_call_risk, summary=lambda a: f"Appeler {a.get('number')}")
def phone_call(ctx: ToolContext, number: str) -> ToolResult | str:
    ph = ctx.zeus.phone
    target = number
    if not re.search(r"\d{3,}|[*#]", number):
        found = ph.contacts(number, 3) if (ph.connected() or ph.termux_api()) else []
        if not found:
            return ToolResult.err(f"contact « {number} » introuvable : donne le numéro")
        target = found[0]["number"]
    if not ph.connected() and not ph.termux_api():
        _need(ctx)
    return ph.call(target) + (f" ({number})" if target != number else "")


@_ph_tool("phone_end_call", "Raccroche l'appel en cours.")
def phone_end_call(ctx: ToolContext) -> str:
    return _need(ctx).end_call()


def _resolve_contact(ctx: ToolContext, to: str) -> tuple[str, str]:
    ph = ctx.zeus.phone
    if re.search(r"\d{6,}", to):
        return to, ""
    found = ph.contacts(to, 3)
    if not found:
        mem = ctx.db.search_memories(to, 3)
        for m in mem:
            num = re.search(r"\+?\d[\d\s]{7,}\d", m["content"])
            if num:
                return num.group(0), f" (numéro trouvé en mémoire : {m['content']})"
        raise PhoneError(f"contact « {to} » introuvable dans le téléphone et la mémoire : donne le numéro")
    return found[0]["number"], f" ({found[0]['name']})"


@_ph_tool("phone_send_sms", "Envoie un SMS (numéro ou nom d'un contact). Fiable : ouvre Messages, remplit, envoie.",
          {"to": p("string", "Numéro ou nom du contact"), "message": p("string", "Texte du SMS")},
          required=["to", "message"], risk="external",
          summary=lambda a: f"Envoyer un SMS à {a.get('to')} : « {truncate(str(a.get('message', '')), 300)} »")
def phone_send_sms(ctx: ToolContext, to: str, message: str) -> str:
    ph = ctx.zeus.phone
    if not ph.connected() and not ph.termux_api():
        _need(ctx)
    number, note = _resolve_contact(ctx, to)
    return ph.send_sms(number, message) + note


@_ph_tool("phone_send_whatsapp", "Envoie un message WhatsApp depuis le téléphone (numéro ou nom d'un contact).",
          {"to": p("string", "Numéro international ou nom du contact"), "message": p("string", "Message")},
          required=["to", "message"], risk="external",
          summary=lambda a: f"Envoyer un WhatsApp à {a.get('to')} : « {truncate(str(a.get('message', '')), 300)} »")
def phone_send_whatsapp(ctx: ToolContext, to: str, message: str) -> ToolResult | str:
    ph = _need(ctx)
    number, note = _resolve_contact(ctx, to)
    return ph.send_whatsapp(number, message) + note


@_ph_tool("phone_notifications", "Lit les notifications du téléphone (messages reçus, appels manqués, alertes…).",
          {"limit": p("integer", "Nombre max (20)"), "app": p("string", "Filtrer par appli (ex. whatsapp)")}, risk="read")
def phone_notifications(ctx: ToolContext, limit: int = 20, app: str = "") -> str:
    ph = ctx.zeus.phone
    if not ph.connected() and not ph.termux_api():
        _need(ctx)
    rows = ph.notifications(max(1, min(int(limit or 20), 60)) * 2)
    if app:
        an = norm(app)
        rows = [r for r in rows if an in norm(r["app"]) or an in norm(PKG_LABELS.get(r["app"], ""))]
    rows = rows[:limit]
    if not rows:
        return "Aucune notification."
    body = "\n".join(f"- {PKG_LABELS.get(r['app'], r['app'])} — {r.get('title') or ''} : {truncate(r.get('text') or '', 300)}"
                     for r in rows)
    return wrap_untrusted("notifications", body)


@_ph_tool("phone_contacts", "Cherche des contacts dans le téléphone (nom ou numéro).",
          {"query": p("string", "Nom ou partie du numéro")}, risk="read")
def phone_contacts(ctx: ToolContext, query: str = "") -> str:
    ph = ctx.zeus.phone
    if not ph.connected() and not ph.termux_api():
        _need(ctx)
    rows = ph.contacts(query, 25)
    return "\n".join(f"- {r['name']} : {r['number']}" for r in rows) or f"Aucun contact pour « {query} »."


@_ph_tool("phone_read_sms", "Lit les derniers SMS reçus (filtre facultatif).",
          {"limit": p("integer", "Nombre (10)"), "query": p("string", "Filtre (expéditeur ou texte)")}, risk="read")
def phone_read_sms(ctx: ToolContext, limit: int = 10, query: str = "") -> str:
    ph = ctx.zeus.phone
    if not ph.connected() and not ph.termux_api():
        _need(ctx)
    rows = ph.read_sms(max(1, min(int(limit or 10), 50)), query)
    if not rows:
        return "Aucun SMS trouvé."
    return wrap_untrusted("sms", "\n".join(f"- {r['date']} {r['from']} : {truncate(r['body'] or '', 400)}" for r in rows))


@_ph_tool("phone_wait", "Attend quelques secondes (chargement d'une appli, d'une page…), puis relit l'écran.",
          {"seconds": p("number", "Secondes (2)")}, risk="read")
def phone_wait(ctx: ToolContext, seconds: float = 2) -> ToolResult:
    _need(ctx)
    return _after(ctx, f"Attendu {seconds} s.", max(0.2, min(float(seconds or 2), 30)))


@_ph_tool("phone_wake", "Allume l'écran et le déverrouille (si un code est configuré).")
def phone_wake(ctx: ToolContext) -> ToolResult:
    ph = _need(ctx)
    return _after(ctx, ph.wake(), 0.6)


@_ph_tool("phone_files", "Fichiers du téléphone : list (dossier), pull (téléphone → PC), push (PC → téléphone).",
          {"action": p("string", enum=["list", "pull", "push"]), "source": p("string"),
           "destination": p("string")}, required=["action"],
          risk_fn=lambda c, a: "read" if a.get("action") == "list" else "write")
def phone_files(ctx: ToolContext, action: str, source: str = "/sdcard/Download", destination: str = "") -> ToolResult | str:
    ph = _need(ctx)
    if action == "list":
        return ph.shell(f"ls -la {q(source or '/sdcard')} | head -n 200")
    if action == "pull":
        dest = ctx.resolve(destination or "telephone")
        dest.mkdir(parents=True, exist_ok=True) if not dest.suffix else dest.parent.mkdir(parents=True, exist_ok=True)
        code, out, err = ph._adb(["pull", source, str(dest)], timeout=600)
        if code != 0:
            return ToolResult.err(err or out)
        target = dest / Path(source).name if dest.is_dir() else dest
        return ToolResult(text=f"Copié du téléphone : {target}", files=[str(target)] if target.is_file() else [])
    if action == "push":
        src = ctx.resolve(source)
        if not src.exists():
            return ToolResult.err(f"introuvable : {src}")
        code, out, err = ph._adb(["push", str(src), destination or "/sdcard/Download/"], timeout=600)
        return f"Envoyé sur le téléphone : {destination or '/sdcard/Download/'}" if code == 0 else ToolResult.err(err or out)
    return ToolResult.err("action inconnue")


@_ph_tool("phone_shell", "Commande ADB shell brute sur le téléphone (avancé : réglages, paquets, intents…).",
          {"command": p("string")}, required=["command"], risk="danger",
          summary=lambda a: f"Commande sur le téléphone : {a.get('command')}")
def phone_shell(ctx: ToolContext, command: str) -> str:
    ph = _need(ctx)
    return truncate(ph.shell(command, timeout=60), 8000) or "(aucune sortie)"


@_ph_tool("phone_install", "Installe une application (.apk) sur le téléphone.", {"path": p("string", "Chemin de l'APK")},
          required=["path"], risk="danger")
def phone_install(ctx: ToolContext, path: str) -> ToolResult | str:
    ph = _need(ctx)
    f = ctx.resolve(path)
    if not f.exists():
        return ToolResult.err(f"introuvable : {f}")
    code, out, err = ph._adb(["install", "-r", str(f)], timeout=600)
    return f"Installé : {f.name}" if code == 0 and "Success" in out else ToolResult.err(err or out)


@_ph_tool("phone_location", "Position du téléphone (Termux:API), sinon dernière position connue.", risk="read")
def phone_location(ctx: ToolContext) -> ToolResult | str:
    ph = ctx.zeus.phone
    if ph.termux_api():
        code, out, err = run_cmd(["termux-location", "-p", "network", "-r", "last"], timeout=40)
        try:
            j = json.loads(out)
            return f"Position : {j.get('latitude')}, {j.get('longitude')} (précision {j.get('accuracy')} m) — " \
                   f"https://maps.google.com/?q={j.get('latitude')},{j.get('longitude')}"
        except Exception:
            pass
    ph = _need(ctx)
    out = ph.shell("dumpsys location | grep -m3 -E 'Location\\[(fused|network|gps)'")
    m = re.search(r"(-?\d+\.\d+),(-?\d+\.\d+)", out)
    if m:
        return f"Dernière position connue : {m.group(1)}, {m.group(2)} — https://maps.google.com/?q={m.group(1)},{m.group(2)}"
    return ToolResult.err("position indisponible (active la localisation, ou installe Termux:API)")


@_ph_tool("phone_task", "Confie une mission complète sur le téléphone à l'agent téléphone spécialisé (ex. « active le "
                        "Wi-Fi », « mets la dernière vidéo de X sur YouTube », « réponds au dernier message de Paul »). "
                        "Il observe, agit, vérifie et rend compte.",
          {"goal": p("string", "Mission précise"), "context": p("string", "Infos utiles (noms, numéros…)")},
          required=["goal"], risk="read", parallel_safe=False)
def phone_task(ctx: ToolContext, goal: str, context: str = "") -> ToolResult:
    _need(ctx)
    if ctx.run is None:
        return ToolResult.err("phone_task doit être lancé dans une tâche")
    res = ctx.zeus.agent.run_subagents(ctx.run, [{"goal": goal, "context": context}], profile="phone", max_steps=30)[0]
    return ToolResult(text=("✅ " if res.ok else "⚠️ ") + res.text, images=res.images[-1:])


# =========================================================================== réglages, alarmes, agenda
SETTINGS_READ = ("etat", "status", "tout", "lire", "reglages")


def _settings_risk(ctx: ToolContext, a: dict) -> str:
    s = norm(str(a.get("setting", "")))
    v = norm(str(a.get("value", "")))
    if s in SETTINGS_READ:
        return "read"
    cut = (s in ("wifi", "wi-fi") and v in ("off", "0", "non", "desactive", "desactiver")) or \
          (s in ("avion", "mode avion", "mode_avion", "airplane") and v in ("on", "1", "oui", "active", "activer")) or \
          (s in ("donnees", "data", "internet", "donnees_mobiles") and v in ("off", "0", "non", "desactive"))
    try:
        if cut and ctx.zeus.phone.wireless_adb():
            return "danger"
    except Exception:
        pass
    return "write"


@_ph_tool("phone_settings", "Réglage direct et instantané du téléphone : wifi, bluetooth, donnees, avion, luminosite "
                            "(0-100 ou auto), volume / sonnerie / volume_alarme (0-100), silencieux, ne_pas_deranger, "
                            "rotation, localisation, mise_en_veille (secondes). value : on/off ou un nombre. "
                            "setting=etat : lit tous les réglages.",
          {"setting": p("string", "Réglage, ou etat"), "value": p("string", "on, off, ou nombre")}, required=["setting"],
          risk_fn=_settings_risk, summary=lambda a: f"Téléphone : {a.get('setting')} → {a.get('value')}")
def phone_settings(ctx: ToolContext, setting: str, value: str = "") -> str:
    ph = _need(ctx)
    if norm(setting) in SETTINGS_READ:
        st = ph.read_settings()
        if not st:
            return "Réglages illisibles sur ce téléphone."
        fmt = {True: "activé", False: "désactivé"}
        return "Réglages du téléphone :\n" + "\n".join(f"- {k.replace('_', ' ')} : {fmt.get(v, v) if isinstance(v, bool) else v}"
                                                      for k, v in st.items())
    if not str(value).strip():
        raise PhoneError("indique la valeur (on, off ou un nombre)")
    note = ""
    if _settings_risk(ctx, {"setting": setting, "value": value}) == "danger":
        note = " ⚠️ ZEUS est relié au téléphone par Wi-Fi : la connexion risque d'être coupée."
    return ph.set_setting(setting, value) + note


DAY_NUM = {"dimanche": 1, "lundi": 2, "mardi": 3, "mercredi": 4, "jeudi": 5, "vendredi": 6, "samedi": 7,
           "sunday": 1, "monday": 2, "tuesday": 3, "wednesday": 4, "thursday": 5, "friday": 6, "saturday": 7}


@_ph_tool("phone_alarm", "Règle une alarme (kind=alarme, time « 06:30 », jours facultatifs) ou un minuteur "
                         "(kind=minuteur, seconds) sur le téléphone.",
          {"kind": p("string", enum=["alarme", "minuteur"]), "time": p("string", "Heure de l'alarme, ex. 06:30"),
           "days": p("array", "Jours de répétition (lundi…dimanche)", items={"type": "string"}),
           "seconds": p("integer", "Durée du minuteur en secondes"), "label": p("string", "Libellé")},
          required=["kind"])
def phone_alarm(ctx: ToolContext, kind: str, time: str = "", days: list | None = None, seconds: int = 0,  # noqa: A002
                label: str = "") -> ToolResult | str:
    ph = _need(ctx)
    if kind == "minuteur":
        if not seconds or int(seconds) <= 0:
            return ToolResult.err("indique la durée du minuteur en secondes")
        return ph.timer(int(seconds), label)
    m = re.search(r"(\d{1,2})\s*(?:h|:)\s*(\d{2})?", time or "")
    if not m:
        return ToolResult.err("heure attendue, ex. 06:30 ou 6h30")
    hh, mm = int(m.group(1)), int(m.group(2) or 0)
    if not (0 <= hh < 24 and 0 <= mm < 60):
        return ToolResult.err("heure invalide")
    nums = []
    for d in days or []:
        dn = DAY_NUM.get(norm(str(d)).rstrip("s"))
        if dn and dn not in nums:
            nums.append(dn)
    return ph.alarm(hh, mm, label, sorted(nums) or None)


@_ph_tool("phone_calendar", "Ajoute un événement à l'agenda du téléphone.",
          {"title": p("string"), "start": p("string", "Début, ex. « 2026-11-02 09:00 » ou « demain à 9h »"),
           "duration_minutes": p("integer", "Durée (60)"), "location": p("string"), "description": p("string")},
          required=["title", "start"])
def phone_calendar(ctx: ToolContext, title: str, start: str, duration_minutes: int = 60, location: str = "",
                   description: str = "") -> ToolResult | str:
    ph = _need(ctx)
    from ..scheduler import parse_schedule
    try:
        spec, ts = parse_schedule(start)
    except ValueError as e:
        return ToolResult.err(str(e))
    if not spec.startswith("once"):
        return ToolResult.err("indique une date précise (ex. « 2026-11-02 09:00 » ou « demain à 9h »)")
    return ph.calendar_add(title, ts, ts + max(5, int(duration_minutes or 60)) * 60, location, description)


__all__ = ["Phone", "PhoneError", "parse_ui", "format_elements"]
