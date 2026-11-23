"""Contrôle de l'ordinateur : ouvrir, capturer l'écran, clavier/souris, presse-papier, notifications.
Windows, macOS et Linux, sans dépendance (pyautogui utilisé s'il est installé)."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

from ..util import IS_MAC, IS_WINDOWS, human_size, run_cmd, truncate, which
from . import ToolContext, ToolResult, p, tool


def _ps(script: str, timeout: float = 30) -> tuple[int, str, str]:
    return run_cmd(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], timeout=timeout)


def _osa(script: str) -> tuple[int, str, str]:
    return run_cmd(["osascript", "-e", script], timeout=20)


def _pyautogui():
    try:
        import pyautogui  # type: ignore
        pyautogui.FAILSAFE = True
        return pyautogui
    except Exception:
        return None


@tool("computer_open", "Ouvre une application, un fichier, un dossier ou un site web sur l'ordinateur.",
      {"target": p("string", "Nom d'appli (ex. « Chrome », « calculatrice »), chemin, ou URL")},
      required=["target"], risk="write", toolset="computer")
def computer_open(ctx: ToolContext, target: str) -> ToolResult | str:
    t = target.strip()
    path = Path(os.path.expanduser(t))
    is_url = t.startswith(("http://", "https://", "mailto:", "tel:")) or (
        "." in t and " " not in t and not path.exists() and "/" not in t[:8] and t.count(".") >= 1 and
        t.split(".")[-1].isalpha() and len(t.split(".")[-1]) <= 6 and not t.endswith((".exe", ".app")))
    if is_url and not t.startswith(("http", "mailto:", "tel:")):
        t = "https://" + t
    try:
        if IS_WINDOWS:
            if is_url or path.exists():
                os.startfile(t if is_url else str(path))  # type: ignore[attr-defined]
            else:
                aliases = {"calculatrice": "calc", "bloc-notes": "notepad", "bloc notes": "notepad",
                           "explorateur": "explorer", "paint": "mspaint", "invite de commandes": "cmd",
                           "parametres": "ms-settings:", "paramètres": "ms-settings:"}
                exe = aliases.get(t.lower(), t)
                subprocess.Popen(["cmd", "/c", "start", "", exe], creationflags=0x08000000)
        elif IS_MAC:
            if is_url or path.exists():
                code, out, err = run_cmd(["open", t if is_url else str(path)])
            else:
                aliases = {"calculatrice": "Calculator", "navigateur": "Safari", "terminal": "Terminal",
                           "parametres": "System Settings", "paramètres": "System Settings", "notes": "Notes"}
                code, out, err = run_cmd(["open", "-a", aliases.get(t.lower(), t)])
            if code != 0:
                return ToolResult.err(err.strip() or f"impossible d'ouvrir {t}")
        else:
            if is_url or path.exists():
                opener = which("xdg-open") or which("termux-open") or which("gio")
                if not opener:
                    return ToolResult.err("aucun programme d'ouverture (xdg-open) disponible")
                args = [opener, "open", t] if opener.endswith("gio") else [opener, t]
                subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            else:
                aliases = {"calculatrice": "gnome-calculator", "navigateur": "xdg-open https://", "terminal": "x-terminal-emulator"}
                exe = aliases.get(t.lower(), t).split()
                if not which(exe[0]):
                    return ToolResult.err(f"application « {t} » introuvable")
                subprocess.Popen(exe, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except Exception as e:  # noqa: BLE001
        return ToolResult.err(f"ouverture impossible : {e}")
    return f"Ouvert : {t}"


def screenshot_pc(dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if IS_MAC:
        code, out, err = run_cmd(["screencapture", "-x", str(dest)], timeout=20)
    elif IS_WINDOWS:
        script = (
            "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;"
            "$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;"
            "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;"
            "$g=[System.Drawing.Graphics]::FromImage($bmp);"
            "$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size);"
            f"$bmp.Save('{dest}',[System.Drawing.Imaging.ImageFormat]::Png)")
        code, out, err = _ps(script)
    else:
        code, err = 1, "aucun outil de capture"
        for cmd in (["gnome-screenshot", "-f", str(dest)], ["grim", str(dest)], ["scrot", "-o", str(dest)],
                    ["spectacle", "-b", "-n", "-o", str(dest)], ["import", "-window", "root", str(dest)]):
            if which(cmd[0]):
                code, out, err = run_cmd(cmd, timeout=20)
                if code == 0 and dest.exists():
                    break
        if (code != 0 or not dest.exists()) and _pyautogui():
            _pyautogui().screenshot(str(dest))
            code = 0
    if not dest.exists():
        raise RuntimeError(f"capture d'écran impossible : {err}")
    return dest


@tool("computer_screenshot", "Capture l'écran de l'ordinateur (pour le voir ou l'envoyer).", {}, risk="read",
      toolset="computer")
def computer_screenshot(ctx: ToolContext) -> ToolResult:
    f = screenshot_pc(ctx.cfg.dir("captures") / f"pc_{int(time.time())}.png")
    return ToolResult(text=f"Capture de l'écran du PC : {f} ({human_size(f.stat().st_size)})", images=[str(f)])


def _win_input(action: str, x: int | None, y: int | None, text: str, keys: str) -> str:
    import ctypes
    user32 = ctypes.windll.user32  # type: ignore[attr-defined]
    if action in ("click", "double_click", "right_click", "move"):
        if x is not None and y is not None:
            user32.SetCursorPos(int(x), int(y))
        flags = {"click": [(0x2, 0x4)], "double_click": [(0x2, 0x4), (0x2, 0x4)], "right_click": [(0x8, 0x10)],
                 "move": []}[action]
        for down, up in flags:
            user32.mouse_event(down, 0, 0, 0, 0)
            user32.mouse_event(up, 0, 0, 0, 0)
            time.sleep(0.05)
        return f"{action} en ({x},{y})"
    if action == "type":
        esc = text.replace("'", "''")
        code, out, err = _ps("Add-Type -AssemblyName System.Windows.Forms;"
                             f"[System.Windows.Forms.SendKeys]::SendWait('{_sendkeys_escape(esc)}')")
        return "Texte tapé" if code == 0 else f"échec : {err}"
    if action == "keys":
        code, out, err = _ps("Add-Type -AssemblyName System.Windows.Forms;"
                             f"[System.Windows.Forms.SendKeys]::SendWait('{_sendkeys_combo(keys)}')")
        return f"Touches {keys}" if code == 0 else f"échec : {err}"
    if action == "scroll":
        user32.mouse_event(0x0800, 0, 0, int(-120 * 3 if (text or "bas") == "bas" else 120 * 3), 0)
        return "Défilement"
    raise ValueError("action inconnue")


def _sendkeys_escape(s: str) -> str:
    out = []
    for ch in s:
        out.append("{" + ch + "}" if ch in "+^%~(){}[]" else ch)
    return "".join(out)


def _sendkeys_combo(keys: str) -> str:
    mods = {"ctrl": "^", "control": "^", "alt": "%", "shift": "+"}
    named = {"enter": "{ENTER}", "entree": "{ENTER}", "tab": "{TAB}", "esc": "{ESC}", "escape": "{ESC}",
             "backspace": "{BACKSPACE}", "delete": "{DELETE}", "up": "{UP}", "down": "{DOWN}", "left": "{LEFT}",
             "right": "{RIGHT}", "home": "{HOME}", "end": "{END}", "f4": "{F4}", "f5": "{F5}", "space": " ",
             "win": "^{ESC}"}
    parts = [x.strip().lower() for x in keys.replace("-", "+").split("+") if x.strip()]
    prefix = "".join(mods[x] for x in parts if x in mods)
    rest = [named.get(x, x) for x in parts if x not in mods]
    return prefix + "".join(rest)


@tool("computer_input", "Clavier/souris de l'ordinateur : click, double_click, right_click, move (x,y), type (text), "
                        "keys (raccourci ex. « ctrl+s »), scroll (text=bas/haut). Prends une capture avant/après.",
      {"action": p("string", enum=["click", "double_click", "right_click", "move", "type", "keys", "scroll"]),
       "x": p("integer"), "y": p("integer"), "text": p("string"), "keys": p("string")},
      required=["action"], risk="write", toolset="computer",
      summary=lambda a: f"PC : {a.get('action')} {a.get('text') or a.get('keys') or (a.get('x'), a.get('y'))}")
def computer_input(ctx: ToolContext, action: str, x: int | None = None, y: int | None = None, text: str = "",
                   keys: str = "") -> ToolResult | str:
    pg = _pyautogui()
    if pg:
        if action in ("click", "double_click", "right_click", "move"):
            if x is not None and y is not None:
                pg.moveTo(int(x), int(y), duration=0.15)
            {"click": pg.click, "double_click": pg.doubleClick, "right_click": pg.rightClick,
             "move": lambda: None}[action]()
        elif action == "type":
            pg.write(text, interval=0.01) if text.isascii() else _clip_paste(text, pg)
        elif action == "keys":
            pg.hotkey(*[k.strip().lower() for k in keys.replace("-", "+").split("+") if k.strip()])
        elif action == "scroll":
            pg.scroll(-500 if (text or "bas") == "bas" else 500)
        return f"Fait : {action}"
    if IS_WINDOWS:
        return _win_input(action, x, y, text, keys)
    if IS_MAC:
        if action == "type":
            esc = text.replace("\\", "\\\\").replace('"', '\\"')
            code, _, err = _osa(f'tell application "System Events" to keystroke "{esc}"')
            return "Texte tapé" if code == 0 else ToolResult.err(err + " (autorise Terminal/Python dans Accessibilité)")
        if action == "keys":
            parts = [k.strip().lower() for k in keys.replace("-", "+").split("+")]
            mods = [m for m in parts if m in ("cmd", "command", "ctrl", "control", "alt", "option", "shift")]
            key = [k for k in parts if k not in mods]
            using = ", ".join({"cmd": "command down", "command": "command down", "ctrl": "control down",
                               "control": "control down", "alt": "option down", "option": "option down",
                               "shift": "shift down"}[m] for m in mods)
            k = key[0] if key else ""
            codes = {"enter": 36, "return": 36, "tab": 48, "esc": 53, "escape": 53, "space": 49, "delete": 51,
                     "up": 126, "down": 125, "left": 123, "right": 124}
            if k in codes:
                script = f'tell application "System Events" to key code {codes[k]}' + (f" using {{{using}}}" if using else "")
            else:
                script = f'tell application "System Events" to keystroke "{k}"' + (f" using {{{using}}}" if using else "")
            code, _, err = _osa(script)
            return f"Touches {keys}" if code == 0 else ToolResult.err(err)
        if which("cliclick") and action in ("click", "double_click", "right_click", "move"):
            op = {"click": "c", "double_click": "dc", "right_click": "rc", "move": "m"}[action]
            code, _, err = run_cmd(["cliclick", f"{op}:{x},{y}"])
            return f"{action} en ({x},{y})" if code == 0 else ToolResult.err(err)
        return ToolResult.err("installe pyautogui (pip install pyautogui) ou cliclick (brew install cliclick) pour la souris")
    if which("xdotool"):
        if action in ("click", "double_click", "right_click", "move"):
            args = ["xdotool"]
            if x is not None and y is not None:
                args += ["mousemove", str(x), str(y)]
            if action != "move":
                args += ["click", "--repeat", "2" if action == "double_click" else "1", "3" if action == "right_click" else "1"]
            code, _, err = run_cmd(args)
        elif action == "type":
            code, _, err = run_cmd(["xdotool", "type", "--delay", "8", text])
        elif action == "keys":
            code, _, err = run_cmd(["xdotool", "key", keys.replace("ctrl", "ctrl").replace("+", "+")])
        else:
            code, _, err = run_cmd(["xdotool", "click", "5" if (text or "bas") == "bas" else "4"])
        return f"Fait : {action}" if code == 0 else ToolResult.err(err)
    return ToolResult.err("aucun moyen de piloter clavier/souris : installe pyautogui (pip install pyautogui) ou xdotool")


def _clip_paste(text: str, pg) -> None:
    clipboard_set(text)
    pg.hotkey("command" if IS_MAC else "ctrl", "v")


def clipboard_set(text: str) -> bool:
    if IS_WINDOWS:
        return run_cmd(["clip"], input_data=text.encode("utf-16-le"))[0] == 0
    if IS_MAC:
        return run_cmd(["pbcopy"], input_data=text.encode())[0] == 0
    for cmd in (["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "-b", "-i"], ["termux-clipboard-set"]):
        if which(cmd[0]):
            return run_cmd(cmd, input_data=text.encode())[0] == 0
    return False


def clipboard_get() -> str:
    if IS_WINDOWS:
        return _ps("Get-Clipboard -Raw")[1]
    if IS_MAC:
        return run_cmd(["pbpaste"])[1]
    for cmd in (["wl-paste"], ["xclip", "-selection", "clipboard", "-o"], ["xsel", "-b", "-o"], ["termux-clipboard-get"]):
        if which(cmd[0]):
            return run_cmd(cmd)[1]
    return ""


@tool("clipboard", "Lit (get) ou remplit (set) le presse-papier de l'ordinateur.",
      {"action": p("string", enum=["get", "set"]), "text": p("string", "Texte pour set")}, required=["action"],
      risk_fn=lambda c, a: "read" if a.get("action") == "get" else "write", toolset="computer")
def clipboard(ctx: ToolContext, action: str, text: str = "") -> str:
    if action == "set":
        return "Copié dans le presse-papier." if clipboard_set(text) else "ERREUR : presse-papier indisponible"
    return truncate(clipboard_get(), 8000) or "(presse-papier vide)"


def notify_pc(title: str, message: str) -> bool:
    if IS_MAC:
        t = title.replace('"', "'")
        m = message.replace('"', "'")
        return _osa(f'display notification "{m}" with title "{t}"')[0] == 0
    if IS_WINDOWS:
        t = title.replace("'", "''")
        m = message.replace("'", "''")
        script = ("Add-Type -AssemblyName System.Windows.Forms;$n=New-Object System.Windows.Forms.NotifyIcon;"
                  "$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;"
                  f"$n.ShowBalloonTip(8000,'{t}','{m}',[System.Windows.Forms.ToolTipIcon]::Info);Start-Sleep 9;$n.Dispose()")
        subprocess.Popen(["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", script],
                         creationflags=0x08000000)
        return True
    if which("notify-send"):
        return run_cmd(["notify-send", title, message])[0] == 0
    if which("termux-notification"):
        return run_cmd(["termux-notification", "--title", title, "--content", message])[0] == 0
    return False


@tool("computer_notify", "Affiche une notification sur l'ordinateur.",
      {"title": p("string"), "message": p("string")}, required=["message"], toolset="computer")
def computer_notify(ctx: ToolContext, message: str, title: str = "ZEUS") -> str:
    return "Notification affichée." if notify_pc(title, message) else "ERREUR : notifications indisponibles"


@tool("system_info", "Infos sur l'ordinateur : système, processeur, mémoire, disque, batterie, réseau.", {},
      toolset="computer")
def system_info(ctx: ToolContext) -> str:
    lines = [f"Système : {platform.system()} {platform.release()} ({platform.machine()})",
             f"Python : {sys.version.split()[0]}", f"Processeurs : {os.cpu_count()}"]
    try:
        du = shutil.disk_usage(str(Path.home()))
        lines.append(f"Disque : {human_size(du.free)} libres sur {human_size(du.total)}")
    except OSError:
        pass
    if IS_MAC:
        lines.append("Batterie : " + run_cmd(["pmset", "-g", "batt"])[1].strip().replace("\n", " "))
    elif IS_WINDOWS:
        code, out, _ = _ps("(Get-CimInstance Win32_Battery).EstimatedChargeRemaining")
        if out.strip():
            lines.append(f"Batterie : {out.strip()} %")
        code, out, _ = _ps("[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,1)")
        if out.strip():
            lines.append(f"Mémoire libre : {out.strip()} Go")
    else:
        bat = Path("/sys/class/power_supply/BAT0/capacity")
        if bat.exists():
            lines.append(f"Batterie : {bat.read_text().strip()} %")
        mem = Path("/proc/meminfo")
        if mem.exists():
            info = dict(ln.split(":", 1) for ln in mem.read_text().splitlines() if ":" in ln)
            avail = int(info.get("MemAvailable", "0 kB").split()[0]) * 1024
            lines.append(f"Mémoire disponible : {human_size(avail)}")
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lines.append(f"Adresse locale : {s.getsockname()[0]}")
        s.close()
    except OSError:
        lines.append("Réseau : hors ligne ?")
    return "\n".join(lines)
