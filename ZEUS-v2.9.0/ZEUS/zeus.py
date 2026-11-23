#!/usr/bin/env python3
"""ZEUS — lanceur.

    python zeus.py            démarre ZEUS (interface web + canaux + tâches)
    python zeus.py setup      assistant de configuration (modèle, téléphone, Telegram…)
    python zeus.py chat       discuter dans le terminal
    python zeus.py phone      brancher et tester le téléphone Android (installe ADB si besoin)
    python zeus.py doctor     diagnostic complet
    python zeus.py mcp        ZEUS comme serveur MCP (Claude Desktop, Cursor, VS Code, Hermes…)
    python zeus.py raccourci  icône ZEUS sur le bureau (s'ouvre dans sa propre fenêtre)
    python zeus.py test       tests automatiques
    python zeus.py mesure     mesure réelle de la vitesse des modèles (réseau, 1er mot, durée, jetons/s)
    python zeus.py mesure --mini   vitesse du mini-cerveau local (secours quand Groq est bloqué)
    python zeus.py banc       banc de tests ZEUS : score par catégorie et régressions
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

if sys.version_info < (3, 10):
    print("ZEUS a besoin de Python 3.10 ou plus récent (tu as %s). Télécharge-le sur python.org." % platform.python_version())
    sys.exit(1)

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from zeuscore import __version__  # noqa: E402
from zeuscore.util import IS_MAC, IS_TERMUX, IS_WINDOWS, fix_console, norm, run_cmd, which  # noqa: E402

Y, B, G, R, D, C0 = "\033[33m", "\033[1m", "\033[32m", "\033[31m", "\033[2m", "\033[0m"
if not sys.stdout.isatty():
    Y = B = G = R = D = C0 = ""

COUNTRY_HINT = "243 = RDC, 242 = Congo, 241 = Gabon, 237 = Cameroun, 225 = Côte d'Ivoire, 221 = Sénégal, 33 = France"
OLLAMA_PREFS = ["qwen3", "qwen2.5", "llama3.3", "llama3.1", "mistral-small", "mistral", "gemma3", "phi4", "llama3.2"]
VISION_HINTS = ("vl", "vision", "llava", "gemma3", "minicpm-v", "moondream")


def ok(msg: str) -> None:
    print(f"  {G}✓{C0} {msg}")


def bad(msg: str) -> None:
    print(f"  {R}✗{C0} {msg}")


def info(msg: str) -> None:
    print(f"  {D}·{C0} {msg}")


def ask(q: str, default: str = "", secret: bool = False) -> str:
    suffix = f" [{default}]" if default and not secret else ""
    try:
        if secret:
            import getpass
            v = getpass.getpass(f"{q}{suffix} : ")
        else:
            v = input(f"{q}{suffix} : ")
    except (EOFError, KeyboardInterrupt):
        print()
        sys.exit(0)
    return v.strip() or default


def yes(q: str, default: bool = True) -> bool:
    v = ask(q + (" (O/n)" if default else " (o/N)"), "").lower()
    if not v:
        return default
    return v.startswith(("o", "y"))


def home_dir(args: argparse.Namespace) -> Path:
    return Path(args.home or os.environ.get("ZEUS_HOME") or ROOT / "data").expanduser().resolve()


# =========================================================================== modèles
def autodetect_ollama(cfg) -> list[str]:
    """Branche Ollama tout seul s'il est installé et qu'aucun modèle n'est configuré."""
    from zeuscore.llm import list_ollama_models
    if cfg.get("models"):
        return []
    models = list_ollama_models()
    if not models:
        return []
    names = [m["name"] for m in models]
    text_models = [n for n in names if not any(h in n.lower() for h in ("embed", "nomic", "bge", "minilm"))]
    main = None
    for pref in OLLAMA_PREFS:
        cands = [n for n in text_models if n.lower().startswith(pref) and not any(h in n.lower() for h in ("vl", "vision"))]
        if cands:
            main = cands[0]
            break
    main = main or (text_models[0] if text_models else None)
    if not main:
        return []
    entries = [{"id": "local", "provider": "ollama", "base_url": "http://localhost:11434", "model": main,
                "vision": any(h in main.lower() for h in VISION_HINTS), "context": 16384}]
    if main.lower().startswith("qwen3"):
        entries[0]["think"] = False  # plus rapide pour agir ; mets true pour les problèmes difficiles
    vis = next((n for n in text_models if n != main and any(h in n.lower() for h in VISION_HINTS)), None)
    if vis:
        entries.append({"id": "vision", "provider": "ollama", "base_url": "http://localhost:11434", "model": vis,
                        "vision": True, "context": 8192})
    cfg.set("models", entries, save=False)
    cfg.set("routing", {"default": "local", "fast": "local", "vision": "vision" if vis else "", "fallback": []})
    return [e["model"] for e in entries]


def autodetect_env_keys(cfg) -> list[str]:
    """Aucun modèle configuré mais une clé Claude dans .env → « Puissance maximale » branchée toute seule."""
    if cfg.get("models") or not os.environ.get("ANTHROPIC_API_KEY"):
        return []
    from zeuscore.llm import apply_claude_preset
    return apply_claude_preset(cfg, "env:ANTHROPIC_API_KEY")


def autodetect_models(cfg) -> list[str]:
    """Premier démarrage (aucun modèle configuré) : branche tout ce qui est disponible, dans l'ordre de secours
    Claude/Groq (en ligne) puis Ollama (local, dernier secours car lent sans carte graphique).

    - ANTHROPIC_API_KEY dans .env → « Puissance maximale » Claude ;
    - GROQ_API_KEY dans .env → Groq (principal sans Claude, secours avec Claude) ; ignoré si Groq est injoignable ;
    - Ollama installé → modèle local, en dernier secours (ou principal s'il est seul).
    Les clés restent dans .env : zeus.json ne garde que des renvois « env:NOM »."""
    if cfg.get("models"):
        return []
    from zeuscore.llm import LLMError, apply_groq_preset
    found = autodetect_env_keys(cfg)
    if os.environ.get("GROQ_API_KEY"):
        try:
            r = apply_groq_preset(cfg, "env:GROQ_API_KEY")
            found += r["models"]
        except LLMError as e:  # pas d'internet au démarrage, ou clé refusée : on continue sans Groq
            print(f"  {Y}Groq non branché : {e}{C0}")
    if not found:
        return autodetect_ollama(cfg)
    online = list(cfg.get("models") or [])
    cfg.set("models", [], save=False)  # autodetect_ollama ne travaille que sur une configuration vide
    routing = dict(cfg.get("routing") or {})
    local = autodetect_ollama(cfg)
    local_entries = list(cfg.get("models") or [])
    cfg.set("models", online + local_entries, save=False)
    if local_entries:
        ids = [m["id"] for m in local_entries]
        routing["fallback"] = [x for x in (routing.get("fallback") or []) if x not in ids] + ids[:1]
        if not routing.get("vision") and len(ids) > 1:
            routing["vision"] = ids[1]
    cfg.set("routing", routing)
    return found + local


# =========================================================================== fenêtre d'application
def app_browsers() -> list[str]:
    """Navigateurs capables d'ouvrir ZEUS dans une fenêtre d'application (sans barre d'adresse), Edge d'abord :
    ses voix « Natural » sont les plus naturelles et sa reconnaissance vocale marche sans réglage."""
    env = os.environ
    if IS_WINDOWS:
        cands = [Path(env.get(v, "")) / sub for v in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")
                 for sub in ("Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe")]
        return [str(c) for c in cands if str(c).strip() and c.is_file()]
    if IS_MAC:
        cands = ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                 "/Applications/Chromium.app/Contents/MacOS/Chromium"]
        return [c for c in cands if Path(c).is_file()]
    return [p for p in (which(n) for n in ("microsoft-edge", "google-chrome", "chromium", "chromium-browser")) if p]


def open_ui(url: str, app_window: bool = True) -> str:
    """Ouvre l'interface, dans une fenêtre d'application si possible ; renvoie le moyen utilisé."""
    if app_window:
        for exe in app_browsers():
            try:
                flags = {"creationflags": 0x00000008 | 0x00000200} if IS_WINDOWS else {"start_new_session": True}
                subprocess.Popen([exe, f"--app={url}", "--window-size=1280,860"], stdin=subprocess.DEVNULL,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **flags)
                return Path(exe).stem
            except OSError:
                continue
    import webbrowser
    webbrowser.open(url)
    return "navigateur"


def _png(width: int, pixels: bytes) -> bytes:
    import struct
    import zlib

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + pixels[y * width * 4:(y + 1) * width * 4] for y in range(width))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, width, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def make_icon(dest: Path) -> Path:
    """Icône du raccourci (.ico) : le logo de ZEUS (zeuscore/ui/icon-256.png). À défaut, dessine l'ancien éclair doré."""
    import struct
    logo = ROOT / "zeuscore" / "ui" / "icon-256.png"
    if logo.is_file():
        png = logo.read_bytes()
        dest.write_bytes(struct.pack("<HHH", 0, 1, 1) + struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png), 22) + png)
        return dest
    size, ss = 256, 2
    bolt = [(22, 4), (44, 4), (30, 28), (46, 28), (18, 60), (26, 34), (14, 34)]  # même éclair que l'interface (64 × 64)
    poly = [((x - 32) * 0.8 * size / 64 + size / 2, (y - 32) * 0.8 * size / 64 + size / 2) for x, y in bolt]

    def inside(px: float, py: float) -> bool:
        c = False
        for i in range(len(poly)):
            (x1, y1), (x2, y2) = poly[i], poly[i - 1]
            if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
                c = not c
        return c
    out = bytearray()
    r0 = size / 2 - 2
    for y in range(size):
        for x in range(size):
            disc = bol = 0
            for sy in range(ss):
                for sx in range(ss):
                    px, py = x + (sx + 0.5) / ss, y + (sy + 0.5) / ss
                    if (px - size / 2) ** 2 + (py - size / 2) ** 2 <= r0 * r0:
                        disc += 1
                        bol += inside(px, py)
            n = ss * ss
            a, b = disc / n, bol / n
            # fond : obsidienne (#080c16 → #0f1626), anneau cyan (#00e5ff) ; éclair : or (#f5c400)
            d = ((x + .5 - size / 2) ** 2 + (y + .5 - size / 2) ** 2) ** .5
            ring = 1.0 if r0 - 12 <= d <= r0 - 6 else 0.0
            base = (8 + 7 * y / size, 12 + 10 * y / size, 22 + 16 * y / size)
            if ring:
                base = (0, 229, 255)
            f = b / max(a, 1e-9)
            rr = (base[0] * (1 - f) + 245 * f) if a else 0
            gg = (base[1] * (1 - f) + 196 * f) if a else 0
            bb = (base[2] * (1 - f) + 0 * f) if a else 0
            k = 1
            out += bytes((int(rr * k), int(gg * k), int(bb * k), int(255 * a)))
    png = _png(size, bytes(out))
    dest.write_bytes(struct.pack("<HHH", 0, 1, 1) + struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png), 22) + png)
    return dest


def cmd_shortcut(args: argparse.Namespace) -> None:
    print(f"\n  {Y}{B}⚡ Raccourci ZEUS{C0}\n")
    if IS_WINDOWS:
        icon = make_icon(ROOT / "zeuscore" / "ui" / "zeus.ico")
        desktop = Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop"
        ps = (f"$d=[Environment]::GetFolderPath('Desktop');$s=(New-Object -ComObject WScript.Shell).CreateShortcut("
              f"(Join-Path $d 'ZEUS.lnk'));$s.TargetPath='{ROOT / 'DEMARRER-ZEUS.bat'}';$s.WorkingDirectory='{ROOT}';"
              f"$s.IconLocation='{icon},0';$s.WindowStyle=7;$s.Description='ZEUS — ton IA personnelle';$s.Save()")
        code, _, err = run_cmd(["powershell", "-NoProfile", "-Command", ps], timeout=60)
        if code == 0:
            ok(f"Icône « ZEUS » créée sur le bureau ({desktop}). Double-clique dessus : ZEUS s'ouvre dans sa propre fenêtre.")
        else:
            bad(f"Création du raccourci impossible : {err.strip()[:300]}")
    elif not IS_MAC:
        apps = Path.home() / ".local/share/applications"
        apps.mkdir(parents=True, exist_ok=True)
        icon = make_icon(ROOT / "zeuscore" / "ui" / "zeus.ico")
        (apps / "zeus.desktop").write_text(
            "[Desktop Entry]\nType=Application\nName=ZEUS\nComment=Ton IA personnelle\n"
            f"Exec=sh \"{ROOT / 'demarrer-zeus.sh'}\"\nIcon={icon}\nTerminal=true\nCategories=Utility;\n", encoding="utf-8")
        ok("ZEUS ajouté au menu des applications.")
    else:
        info("Sur Mac : glisse demarrer-zeus.sh dans le Dock, ou crée une app avec Automator (« Exécuter un script shell »).")
    print()


# =========================================================================== serve
def cmd_serve(args: argparse.Namespace) -> None:
    from zeuscore.core import Zeus
    from zeuscore.channels.web import WebServer
    home = home_dir(args)
    zeus = Zeus(home, verbose=args.verbose)
    cfg = zeus.config
    if getattr(args, "https", False):
        cfg.set("web.https", True, save=False)
    found = autodetect_models(cfg)
    if found:
        zeus.router.reload()
    host = "0.0.0.0" if args.lan else (args.host or cfg.get("web.host"))
    web = WebServer(zeus, host=host, port=args.port or cfg.get("web.port"))
    try:
        web.start()
    except OSError as e:
        print(f"{R}Impossible d'ouvrir le port {web.port} : {e}{C0}\nUn autre ZEUS tourne peut-être déjà, "
              f"ou choisis un autre port : python zeus.py --port 7788")
        sys.exit(1)
    zeus.start(channels=True)
    url = web.url()
    print(f"\n  {Y}{B}⚡ ZEUS {__version__}{C0} est prêt.\n")
    print(f"  Interface : {B}{url}{C0}")
    if web.host == "0.0.0.0":
        lan = web.url(lan=True)
        print(f"  Depuis ton téléphone (même Wi-Fi) : {B}{lan}{C0}")
        if web.scheme == "https":
            print(f"  {D}Certificat créé par ZEUS : au premier accès, le téléphone affiche un avertissement →"
                  f" « Paramètres avancés » → « Continuer ». Le micro et le mode Jarvis marchent ensuite.{C0}")
        else:
            print(f"  {D}Pour le micro et le mode Jarvis sur le téléphone : python zeus.py --lan --https{C0}")
        try:
            from zeuscore.qr import qr_matrix
            m = qr_matrix(lan)
            print()
            for y in range(-1, len(m) + 1, 2):
                line = "  "
                for x in range(-2, len(m) + 2):
                    top = m[y][x] if 0 <= y < len(m) and 0 <= x < len(m) else False
                    bot = m[y + 1][x] if 0 <= y + 1 < len(m) and 0 <= x < len(m) else False
                    line += "\033[47m\033[30m" + (" " if not top and not bot else "▀" if top and not bot else "▄" if bot and not top else "█")
                print(line + C0)
            print()
        except Exception:
            pass
    if found:
        print(f"  Modèles : {', '.join(found)} branché(s) automatiquement.")
    elif zeus.router.available():
        print("  Modèles : " + ", ".join(f"{h.id} ({h.cfg.get('model')})" for h in zeus.router.handles))
    else:
        print(f"  {Y}Aucun modèle d'IA branché.{C0} Ouvre l'interface → Réglages → Modèles, ou lance : python zeus.py setup")
    print("  " + zeus.phone_summary())
    for name, ch in zeus.channels.items():
        st = ch.status()
        print(f"  {name.capitalize()} : {'connecté' if st.get('connected') else 'erreur ' + str(st.get('error'))}"
              + (f" (@{st['bot']})" if st.get("bot") else ""))
    if cfg.get("telegram.enabled") and not cfg.get("owner.telegram_ids"):
        print(f"  Code d'appairage Telegram : {B}{cfg.get('telegram.pairing_code')}{C0} (envoie-le à ton bot)")
    print(f"\n  {D}Données : {home}  ·  Ctrl+C pour arrêter{C0}\n")
    if cfg.get("web.open_browser", True) and not args.no_browser and not IS_TERMUX:
        try:
            how = open_ui(url, bool(cfg.get("web.app_window", True)))
            if how != "navigateur":
                print(f"  {D}Fenêtre ZEUS ouverte ({how}). Mode Jarvis : bouton 🎙️ Jarvis ou Alt+J.{C0}\n")
        except Exception:
            pass
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n  Arrêt de ZEUS…")
    finally:
        zeus.stop()
        web.stop()


# =========================================================================== chat
def cmd_chat(args: argparse.Namespace) -> None:
    from zeuscore.core import Zeus
    from zeuscore.channels.cli import run_cli
    zeus = Zeus(home_dir(args), verbose=args.verbose)
    if autodetect_ollama(zeus.config):
        zeus.router.reload()
    zeus.start(channels=False)
    if not zeus.router.available():
        print(f"{Y}Aucun modèle branché : lance d'abord « python zeus.py setup ».{C0}")
    try:
        run_cli(zeus)
    finally:
        zeus.stop()


# =========================================================================== setup
PROVIDERS_MENU = [
    ("claude_max", "PUISSANCE MAXIMALE — Claude Opus 5.5 + Fable 5.1 + Haiku 5.5 (payant, clé sur platform.claude.com)", ""),
    ("groq_fast", "RAPIDE ET GRATUIT — Groq : clé gratuite, ZEUS choisit le meilleur modèle et branche la voix (console.groq.com)", ""),
    ("ollama", "Ollama — local, gratuit, privé (seulement avec une carte graphique : sinon plusieurs minutes par réponse)", "qwen3:8b"),
    ("anthropic", "Anthropic Claude — un seul modèle Claude, au choix (clé sur platform.claude.com)", "claude-sonnet-5-5"),
    ("openrouter", "OpenRouter — des centaines de modèles avec une seule clé (openrouter.ai)", ""),
    ("openai", "OpenAI (platform.openai.com)", ""),
    ("gemini", "Google Gemini (aistudio.google.com)", ""),
    ("groq", "Groq — très rapide, offre gratuite (console.groq.com)", ""),
    ("mistral", "Mistral (console.mistral.ai)", ""),
    ("deepseek", "DeepSeek (platform.deepseek.com)", ""),
    ("lmstudio", "LM Studio — local", ""),
]


def cmd_setup(args: argparse.Namespace) -> None:
    from zeuscore.config import Config
    from zeuscore.llm import PRESETS, LLMRouter, list_ollama_models
    cfg = Config(home_dir(args))
    print(f"\n{Y}{B}⚡ Configuration de ZEUS{C0}  (Entrée = garder la valeur proposée)\n")
    cfg.set("owner.name", ask("Ton prénom", cfg.get("owner.name") or ""), save=False)
    cfg.set("owner.city", ask("Ta ville (météo du brief du matin)", cfg.get("owner.city") or ""), save=False)
    cfg.set("assistant.name", ask("Nom de ton assistant", cfg.get("assistant.name") or "ZEUS"))

    print(f"\n{B}1. Le cerveau (modèle d'IA){C0}")
    models = list(cfg.get("models") or [])
    if models:
        info("Déjà configuré : " + ", ".join(f"{m['id']} ({m.get('model')})" for m in models))
    if not models or yes("Ajouter ou remplacer un modèle ?", default=not models):
        found = list_ollama_models()
        if found:
            ok("Ollama est lancé avec : " + ", ".join(m["name"] for m in found))
        for i, (k, label, _) in enumerate(PROVIDERS_MENU, 1):
            print(f"   {i}. {label}")
        choice = ask("Ton choix", "2" if not models else "")
        if choice == "1":
            from zeuscore.llm import apply_claude_preset
            print("   Prix officiels par million de jetons (entrée / sortie) : Opus 5.5 = 4 $ / 20 $, "
                  "Fable 5.1 = 10 $ / 50 $, Haiku 5.5 = 0,10 $ / 0,50 $.")
            print("   Crée ta clé sur platform.claude.com → Settings → API keys (en choisissant un workspace),")
            print("   après avoir acheté des crédits dans Settings → Billing.")
            key = ask("Clé API Claude (sk-ant-…, ou env:NOM_DE_VARIABLE)", secret=True)
            if key:
                ws = ask("Identifiant du workspace (Entrée si ta clé est liée à un workspace)", "")
                bud = ask("Plafond de dépenses par mois, en dollars (0 = sans plafond)",
                          str(cfg.get("budget.monthly_usd") or 30))
                try:
                    bud_v = float(bud.replace(",", ".") or 0)
                except ValueError:
                    bud_v = 30.0
                apply_claude_preset(cfg, key, ws, bud_v)
                print("   Test de connexion…", end=" ", flush=True)
                r = LLMRouter(cfg).test("claude")
                print(f"{G}OK ({r['latency']} s){C0}" if r.get("ok") else f"{R}échec : {r.get('error')}{C0}")
                info("Mode maximum (Fable 5.1) : choisis « Maximum » en haut d'une conversation, ou /max sur Telegram.")
            choice = ""
        if choice == "2":
            from zeuscore.llm import LLMError, apply_groq_preset
            print("   1. Crée un compte gratuit sur console.groq.com   2. API Keys → Create API Key   3. Colle-la ici.")
            key = ask("Clé Groq (gsk_…, ou env:NOM_DE_VARIABLE)", secret=True)
            if key:
                try:
                    r = apply_groq_preset(cfg, key)
                    ok(f"Groq branché : {r['main']} (cerveau) · {r['fast']} (tâches rapides) · voix Whisper.")
                    print("   Test de connexion…", end=" ", flush=True)
                    t = LLMRouter(cfg).test("groq")
                    print(f"{G}OK ({t['latency']} s){C0}" if t.get("ok") else f"{R}échec : {t.get('error')}{C0}")
                except LLMError as e:
                    bad(str(e.args[0]))
            choice = ""
        if choice.isdigit() and 3 <= int(choice) <= len(PROVIDERS_MENU):
            key, label, default_model = PROVIDERS_MENU[int(choice) - 1]
            entry = {"id": key if key != "ollama" else "local", "provider": key, **PRESETS.get(key, {})}
            entry["provider"] = key
            if key == "ollama":
                if found:
                    for j, m in enumerate(found, 1):
                        print(f"   {j}. {m['name']} {m.get('params') or ''}")
                    c = ask("Quel modèle ?", "1")
                    entry["model"] = found[int(c) - 1]["name"] if c.isdigit() and 1 <= int(c) <= len(found) else c
                else:
                    print("   Ollama ne répond pas. Installe-le (ollama.com), puis lance : ollama pull qwen3:8b")
                    entry["model"] = ask("Nom du modèle Ollama", default_model)
                entry["context"] = 16384
                entry["vision"] = any(h in entry["model"].lower() for h in VISION_HINTS)
                if entry["model"].lower().startswith("qwen3"):
                    entry["think"] = False
            elif key in ("lmstudio", "llamacpp", "vllm"):
                from zeuscore.llm import list_openai_models
                avail = list_openai_models(entry["base_url"])
                if avail:
                    for j, m in enumerate(avail, 1):
                        print(f"   {j}. {m}")
                    c = ask("Quel modèle ?", "1")
                    entry["model"] = avail[int(c) - 1] if c.isdigit() and 1 <= int(c) <= len(avail) else c
                else:
                    print(f"   {label.split(' —')[0]} ne répond pas sur {entry['base_url']} : lance son serveur local.")
                    entry["model"] = ask("Nom du modèle", default_model or "local-model")
                entry["vision"] = yes("Ce modèle voit-il les images (vision) ?", False)
            else:
                entry["api_key"] = ask("Clé API (ou env:NOM_DE_VARIABLE)", secret=True)
                entry["model"] = ask("Nom exact du modèle", default_model)
                entry["vision"] = yes("Ce modèle voit-il les images (vision) ?", True)
            models = [m for m in models if m.get("id") != entry["id"]] + [entry]
            cfg.set("models", models, save=False)
            routing = cfg.get("routing") or {}
            if not routing.get("default") or yes(f"Faire de « {entry['id']} » le modèle principal ?", True):
                routing["default"] = entry["id"]
            routing["fallback"] = [m["id"] for m in models if m["id"] != routing.get("default")]
            if entry.get("vision") and not routing.get("vision"):
                routing["vision"] = entry["id"]
            cfg.set("routing", routing, save=False)
            cfg.save()
            print("   Test de connexion…", end=" ", flush=True)
            r = LLMRouter(cfg).test(entry["id"])
            print(f"{G}OK ({r['latency']} s){C0}" if r.get("ok") else f"{R}échec : {r.get('error')}{C0}")

    print(f"\n{B}2. Téléphone Android{C0}")
    print(f"   Indicatif du pays pour les numéros locaux ({COUNTRY_HINT})")
    cfg.set("phone.country_code", ask("Indicatif", str(cfg.get("phone.country_code") or "")).lstrip("+"))
    info("Pour brancher le téléphone : python zeus.py phone")

    print(f"\n{B}3. Te parler depuis ton téléphone{C0}")
    if yes("Activer Telegram (bot privé, gratuit, marche partout) ?", bool(cfg.get("telegram.enabled"))):
        print("   Sur Telegram : écris à @BotFather → /newbot → copie le jeton.")
        tok = ask("Jeton du bot", secret=True) or cfg.get("telegram.bot_token")
        cfg.set("telegram.bot_token", tok, save=False)
        cfg.set("telegram.enabled", bool(tok), save=False)
        info(f"Une fois ZEUS lancé, envoie à ton bot le code : {cfg.get('telegram.pairing_code') or '(affiché au démarrage)'}")
    lan = yes("Ouvrir l'interface aux appareils du même Wi-Fi (ton téléphone) ?", cfg.get("web.host") == "0.0.0.0")
    cfg.set("web.host", "0.0.0.0" if lan else "127.0.0.1")

    print(f"\n{B}4. Autonomie{C0}")
    print("   1. Prudent — demande avant toute modification")
    print("   2. Équilibré — agit seul en local, demande avant d'envoyer, supprimer ou payer (recommandé)")
    print("   3. Autonome — agit seul ; ne demande que pour l'argent et les actions catastrophiques")
    cur = {"prudent": "1", "equilibre": "2", "autonome": "3"}.get(cfg.get("security.autonomy"), "2")
    c = ask("Ton choix", cur)
    cfg.set("security.autonomy", {"1": "prudent", "2": "equilibre", "3": "autonome"}.get(c, "equilibre"))

    print(f"\n{B}5. Guichet administratif (le métier de NEO){C0}")
    if yes("Activer l'accueil des usagers et la gestion de dossiers ?", bool(cfg.get("guichet.enabled", True))):
        cfg.set("guichet.enabled", True, save=False)
        cfg.set("guichet.organisation", ask("Nom de ton organisation (mairie, école, service…)",
                                            cfg.get("guichet.organisation") or ""), save=False)
    else:
        cfg.set("guichet.enabled", False, save=False)
    cfg.save()
    print(f"\n{G}{B}C'est prêt.{C0} Lance ZEUS avec : {B}python zeus.py{C0}\n")


# =========================================================================== téléphone
PLATFORM_TOOLS = {
    "win": "https://dl.google.com/android/repository/platform-tools-latest-windows.zip",
    "mac": "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip",
    "linux": "https://dl.google.com/android/repository/platform-tools-latest-linux.zip",
}
ADBKEYBOARD_APK = "https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "ZEUS"})
    with urllib.request.urlopen(req, timeout=120) as r, dest.open("wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        got = 0
        while True:
            chunk = r.read(65536)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if total:
                print(f"\r   Téléchargement… {got * 100 // total} %", end="", flush=True)
    print()


def install_adb(home: Path) -> str | None:
    if IS_TERMUX:
        print("   Sur Termux : pkg install android-tools")
        return None
    key = "win" if IS_WINDOWS else "mac" if IS_MAC else "linux"
    tools = home / "tools"
    z = tools / "platform-tools.zip"
    print("   Téléchargement des outils Android officiels (Google, ~10 Mo)…")
    download(PLATFORM_TOOLS[key], z)
    with zipfile.ZipFile(z) as zf:
        zf.extractall(tools)
    z.unlink()
    adb = tools / "platform-tools" / ("adb.exe" if IS_WINDOWS else "adb")
    if not IS_WINDOWS:
        for f in (tools / "platform-tools").iterdir():
            if f.is_file():
                f.chmod(0o755)
    return str(adb) if adb.exists() else None


def cmd_phone(args: argparse.Namespace) -> None:
    from zeuscore.core import Zeus
    zeus = Zeus(home_dir(args), verbose=args.verbose)
    ph = zeus.phone
    print(f"\n{Y}{B}⚡ Brancher ton téléphone Android à ZEUS{C0}\n")
    adb = ph.adb_path()
    if not adb:
        bad("ADB (outil Android) n'est pas installé.")
        if yes("Le télécharger et l'installer maintenant ?", True):
            adb = install_adb(zeus.config.home)
            if adb:
                zeus.config.set("phone.adb_path", adb)
                ok(f"ADB installé : {adb}")
        if not adb:
            print("   Installe les « Android SDK Platform-Tools » puis relance cette commande.")
            return
    else:
        ok(f"ADB : {adb}")
    print(f"""
   Sur le téléphone :
   1. Paramètres → À propos du téléphone → touche 7 fois « Numéro de build » (mode développeur activé).
   2. Paramètres → Options pour les développeurs → active « Débogage USB ».
   3. Branche le câble USB et accepte « Autoriser le débogage USB » (coche « Toujours autoriser »).
   Sans câble : active « Débogage sans fil » → « Associer avec un code » (même Wi-Fi que le PC).
""")
    devs = ph.devices(fresh=True)
    if not any(d["state"] == "device" for d in devs) and yes("Connexion sans fil (Wi-Fi) plutôt que USB ?", False):
        pair = ask("Adresse de jumelage affichée (ex. 192.168.1.20:37099)")
        code = ask("Code de jumelage à 6 chiffres")
        if pair and code:
            c, out, err = run_cmd([adb, "pair", pair, code], timeout=30)
            print("   " + (out or err).strip())
        conn = ask("Adresse de connexion affichée sur l'écran « Débogage sans fil » (ex. 192.168.1.20:41235)")
        if conn:
            c, out, err = run_cmd([adb, "connect", conn], timeout=20)
            print("   " + (out or err).strip())
    for _ in range(20):
        devs = ph.devices(fresh=True)
        if any(d["state"] == "device" for d in devs):
            break
        if any(d["state"] == "unauthorized" for d in devs):
            print("   Accepte la fenêtre d'autorisation sur le téléphone…", end="\r")
        else:
            print("   En attente du téléphone… (branche-le et active le débogage USB)", end="\r")
        time.sleep(2)
    print()
    if not any(d["state"] == "device" for d in devs):
        bad("Aucun téléphone autorisé. Vérifie le câble (certains ne font que charger) et le débogage USB.")
        return
    st = ph.status()
    ok(f"Connecté : {st.get('manufacturer')} {st.get('model')} — Android {st.get('android')}")
    try:
        head, els, pkg = ph.read_screen()
        ok(f"Lecture de l'écran : {len(els)} éléments ({head.split(' · ')[0]})")
    except Exception as e:  # noqa: BLE001
        bad(f"Lecture de l'écran : {e} (déverrouille l'écran et réessaie)")
    try:
        f = ph.screenshot()
        ok(f"Capture d'écran : {f}")
    except Exception as e:  # noqa: BLE001
        bad(f"Capture : {e}")
    if ph.has_adb_keyboard():
        ok("ADBKeyboard installé : ZEUS peut écrire avec accents et emoji.")
    else:
        info("Pour écrire les accents et emoji, ZEUS utilise le clavier « ADBKeyboard » (libre, GitHub senzhk).")
        if yes("L'installer maintenant sur le téléphone ?", True):
            apk = zeus.config.home / "tools" / "ADBKeyboard.apk"
            try:
                download(ADBKEYBOARD_APK, apk)
                c, out, err = run_cmd([adb, "-s", ph.serial() or "", "install", "-r", str(apk)], timeout=180)
                if c == 0:
                    run_cmd([adb, "-s", ph.serial() or "", "shell", "ime enable com.android.adbkeyboard/.AdbIME"])
                    ph._adbkbd = None
                    ok("ADBKeyboard installé. ZEUS l'active seulement le temps d'écrire, puis remet ton clavier.")
                else:
                    bad((err or out).strip())
            except Exception as e:  # noqa: BLE001
                bad(f"Installation impossible : {e}")
    print(f"\n{G}{B}Ton téléphone est prêt.{C0} Dis par exemple à ZEUS : « lis mes notifications » ou "
          f"« envoie un WhatsApp à Maman ».\n")


# =========================================================================== doctor
def cmd_doctor(args: argparse.Namespace) -> None:
    from zeuscore.core import Zeus
    from zeuscore.llm import list_ollama_models
    from zeuscore.tools.documents import ocr_available
    print(f"\n{Y}{B}⚡ Diagnostic de ZEUS {__version__}{C0}\n")
    ok(f"Python {platform.python_version()} sur {platform.system()} {platform.release()}" + (" (Termux)" if IS_TERMUX else ""))
    zeus = Zeus(home_dir(args), verbose=args.verbose)
    ok(f"Données : {zeus.config.home}")
    (ok if zeus.db.fts else bad)("Recherche plein texte SQLite (FTS5)" + ("" if zeus.db.fts else " absente : la mémoire marche en mode simple"))
    print(f"\n{B}Modèles{C0}")
    if not zeus.router.handles:
        bad("Aucun modèle configuré → python zeus.py setup")
    for h in zeus.router.handles:
        r = zeus.router.test(h.id)
        (ok if r.get("ok") else bad)(f"{h.id} ({h.cfg.get('provider')} · {h.cfg.get('model')}) : "
                                     + (f"répond en {r['latency']} s" if r.get("ok") else r.get("error", "")))
    om = list_ollama_models()
    (ok if om else info)("Ollama : " + (", ".join(m["name"] for m in om) if om else "non détecté (facultatif)"))
    c = zeus.costs.status()
    (bad if c["exhausted"] else info)(f"Dépenses du mois : {c['month']:.2f} $"
                                      + (f" sur un plafond de {c['limit']:.2f} $" if c["limit"] else " (pas de plafond)"))
    if c["unknown_prices"]:
        info("Prix inconnus (dépenses non comptées) : " + ", ".join(c["unknown_prices"]))
    print(f"\n{B}Téléphone{C0}")
    st = zeus.phone.status()
    (ok if st.get("adb") else bad)("ADB " + ("installé" if st.get("adb") else "absent → python zeus.py phone"))
    (ok if st.get("connected") else info)(zeus.phone.summary())
    if st.get("termux_api"):
        ok("Termux:API disponible")
    print(f"\n{B}Documents{C0}")
    try:
        import pypdf  # noqa: F401
        ok("pypdf (lecture PDF de qualité)")
    except ImportError:
        info("pypdf absent (facultatif : pip install pypdf pour mieux lire les PDF)")
    (ok if which("pdftotext") else info)("pdftotext " + ("présent" if which("pdftotext") else "absent (facultatif)"))
    (ok if ocr_available() else info)("Tesseract OCR " + ("présent" if ocr_available() else "absent (facultatif : lire les photos de documents)"))
    print(f"\n{B}Réseau et canaux{C0}")
    try:
        urllib.request.urlopen("https://www.google.com/generate_204", timeout=8)
        ok("Internet accessible")
    except Exception:
        info("Internet inaccessible (ZEUS marche quand même avec un modèle local)")
    for ch in ("telegram", "whatsapp", "email", "sms"):
        info(f"{ch} : {'activé' if zeus.config.get(ch + '.enabled') else 'désactivé'}")
    n_trg = len(zeus.db.list_triggers(enabled_only=True))
    info(f"Surveillance du téléphone : {n_trg} déclencheur(s) actif(s)")
    print(f"\n{B}Outils{C0}")
    ok(f"{len(zeus.registry.tools)} outils dans {len(zeus.registry.toolsets())} boîtes")
    try:
        from zeuscore.mcp_server import MCPServer
        ok(f"Serveur MCP prêt : {len(MCPServer(zeus).tool_list())} outils pour Claude Desktop, Cursor… "
           f"(python zeus.py mcp --print-config)")
    except Exception as e:  # noqa: BLE001
        bad(f"Serveur MCP : {e}")
    print()


def cmd_mcp(args: argparse.Namespace) -> None:
    """Serveur MCP sur stdio. --print-config affiche le bloc à coller dans le client MCP."""
    import json
    from zeuscore.mcp_server import client_config, run_stdio
    if args.print_config:
        fix_console()
        conf = client_config(sys.executable, str(ROOT / "zeus.py"))
        if args.home:
            conf["mcpServers"]["zeus"]["args"] += ["--home", str(home_dir(args))]
        print(json.dumps(conf, indent=2, ensure_ascii=False))
        print(f"\n{D}Colle ce bloc dans la configuration MCP de ton application (Claude Desktop : "
              f"Réglages → Développeur → Modifier la configuration), puis redémarre-la.{C0}", file=sys.stderr)
        return

    def prepare(z) -> None:
        if autodetect_ollama(z.config):
            z.router.reload()
    sys.exit(run_stdio(home_dir(args), verbose=args.verbose, prepare=prepare))


def cmd_bench(args: argparse.Namespace) -> None:
    """Mesure réelle de la vitesse des cerveaux (réseau, question courte, vraie requête ZEUS, bout en bout)."""
    from zeuscore.bench import run_benchmark, save_report
    from zeuscore.core import Zeus
    zeus = Zeus(home_dir(args), verbose=args.verbose)
    print(f"\n{Y}{B}⚡ Mesure de vitesse de ZEUS {__version__}{C0}\n")
    if not zeus.router.handles:
        bad("Aucun modèle configuré → python zeus.py setup")
        return

    def confirm(question: str) -> bool:
        if args.oui:
            print(f"  {question} → oui (--oui)")
            return True
        return yes(question, False)
    try:
        if args.mini:
            from zeuscore.bench import run_minibrain_benchmark
            report = run_minibrain_benchmark(zeus)
        else:
            report = run_benchmark(zeus, models=args.modele or None, reps=max(1, args.repetitions),
                                   include_local=args.local, confirm=confirm, e2e=not args.sans_bout_en_bout)
    except KeyboardInterrupt:
        print("\n  Mesure interrompue (Ctrl+C) : résultats partiels non enregistrés.")
        return
    finally:
        zeus.stop()
    if report.get("models") or report.get("end_to_end"):
        path = save_report(zeus, report)
        print(f"\n  {G}Résultats enregistrés :{C0} {path}\n  Envoie ce fichier à Claude pour l'analyse.\n")


def cmd_cas(args: argparse.Namespace) -> None:
    """Les erreurs signalées avec « ZEUS s'est trompé » (interface, Telegram /erreur)."""
    from zeuscore.config import Config
    from zeuscore.store import Store
    from zeuscore import feedback
    home = home_dir(args)
    cfg = Config(home)
    db = Store(home / "zeus.db")

    class _Z:  # le strict nécessaire pour feedback.*, sans démarrer ZEUS
        pass
    z = _Z()
    z.db, z.config = db, cfg
    try:
        _cas(z, home, args)
    finally:
        db.close()


def _cas(z, home: Path, args: argparse.Namespace) -> None:
    from zeuscore import feedback
    if args.statut:
        fid, status = args.statut
        ok = feedback.set_status(z, int(fid), status)
        print(f"Cas n° {fid} : {status}." if ok else f"Cas n° {fid} introuvable.")
        return
    cases = feedback.list_cases(z, "", 200)
    if not cases:
        print("Aucune erreur signalée. Sous chaque réponse de ZEUS : « ZEUS s'est trompé » (ou /erreur sur Telegram).")
        return
    print(f"{len(cases)} cas signalé(s) — dossier : {home / 'cas'}\n")
    for c in cases:
        k = c["case"]
        print(f"#{c['id']} [{c['status']}] {time.strftime('%d/%m %H:%M', time.localtime(c['ts']))} · {c['role']} · "
              f"{c['model'] or '?'} · {feedback.KINDS.get(c['kind'], c['kind'])}")
        print(f"   question : {(k.get('question') or '')[:110]}")
        print(f"   réponse  : {(k.get('answer') or '')[:110]}")
        if c.get("expected"):
            print(f"   attendu  : {c['expected'][:110]}")
    print("\nPour classer un cas : python zeus.py cas --statut N test|traite|ignore")


def cmd_pedagogie(args: argparse.Namespace) -> None:
    """Banc d'essai du professeur de langue : phrases à erreurs connues, dans un ZEUS temporaire."""
    import shutil
    import tempfile
    from zeuscore.core import Zeus
    from zeuscore.pedagogie import CASES, run_eval, save_report
    from zeuscore.util import setup_logging
    home = home_dir(args)
    # Le journal va dans les vrais journaux (data/logs) : sous Windows, un fichier journal ouvert dans le dossier
    # temporaire empêchait de l'effacer à la fin.
    setup_logging(home / "logs", args.verbose)
    tmp = Path(tempfile.mkdtemp(prefix="zeus-pedagogie-"))
    zeus = None
    print(f"\n{Y}{B}⚡ Banc d'essai du professeur de langue — ZEUS {__version__}{C0}\n"
          "  (ZEUS temporaire : tes cartes, ton journal d'erreurs et tes conversations ne sont pas touchés)\n")
    try:
        if (home / "zeus.json").exists():
            shutil.copy2(home / "zeus.json", tmp / "zeus.json")
        zeus = Zeus(tmp, verbose=args.verbose)
        zeus.config.set("agent.auto_learn", False)  # pas de mémoire tirée des phrases de test
        if not zeus.router.handles and autodetect_models(zeus.config):
            zeus.router.reload()
        if not zeus.router.handles:
            bad("Aucun modèle configuré → python zeus.py setup")
            return
        langs = {x.strip().lower() for x in (args.langue or []) for x in x.split(",") if x.strip()}
        cases = [c for c in CASES if not langs or c["lang"] in langs]

        def confirm(question: str) -> bool:
            if args.oui:
                print(f"  {question} → oui (--oui)")
                return True
            return yes(question, False)
        try:
            report = run_eval(zeus, cases, confirm=confirm)
        except KeyboardInterrupt:
            print("\n  Essai interrompu (Ctrl+C) : résultats partiels non enregistrés.")
            return
        if report.get("results"):
            path = save_report(home / "logs", report)
            print(f"\n  {G}Résultats enregistrés :{C0} {path}\n  Envoie ce fichier à Claude pour l'analyse.\n")
    finally:
        if zeus is not None:
            zeus.stop()
            zeus.db.close()
        _remove_tree(tmp)


def cmd_banc(args: argparse.Namespace) -> None:
    """Banc de tests ZEUS : un score par catégorie, comparé au banc précédent (régressions et progrès)."""
    import tempfile
    from zeuscore import evaluation as ev
    from zeuscore.core import Zeus
    from zeuscore.store import Store
    from zeuscore.util import setup_logging
    home = home_dir(args)
    setup_logging(home / "logs", args.verbose)
    tmp = Path(tempfile.mkdtemp(prefix="zeus-banc-"))
    zeus = None
    print(f"\n{Y}{B}⚡ Banc de tests ZEUS {__version__}{C0}\n"
          "  (ZEUS temporaire : tes conversations, ta mémoire et tes fichiers ne sont pas touchés ; toute demande "
          "d'autorisation est refusée)\n")
    try:
        if (home / "zeus.json").exists():
            shutil.copy2(home / "zeus.json", tmp / "zeus.json")
        tests = list(ev.TESTS)
        if (home / "zeus.db").exists():
            db = Store(home / "zeus.db")
            try:
                tests += ev.case_tests(db)
            finally:
                db.close()
        cats = {norm(x.strip()).replace("é", "e") for x in (args.categorie or []) for x in x.split(",") if x.strip()}
        if cats:
            tests = [t for t in tests if t["cat"] in cats]
        zeus = Zeus(tmp, verbose=args.verbose)
        zeus.config.set("agent.auto_learn", False, save=False)
        zeus.config.set("security.autonomy", "equilibre", save=False)
        zeus.config.set("security.approval_timeout", 5, save=False)
        if not zeus.router.handles:
            bad("Aucun modèle configuré → python zeus.py setup")
            return
        print(f"  {len(tests)} tests : " + ", ".join(sorted({ev.CATEGORIES[t['cat']] for t in tests})))
        print("  Environ 5 000 jetons par test sur Groq gratuit : le banc complet utilise une bonne part du quota du "
              "jour.\n")
        if not args.oui and not yes("Lancer le banc ?", True):
            return
        try:
            report = ev.run(zeus, tmp, tests)
        except KeyboardInterrupt:
            print("\n  Banc interrompu (Ctrl+C) : résultats partiels non enregistrés.")
            return
        prev = ev.last_report(home / "logs")
        report["comparison"] = ev.compare(prev, report)
        s = report["summary"]
        print(f"\n  {B}Score : {s['ok']}/{s['total']} ({s['score']} %){C0}" +
              (f" · temps médian {s['median_seconds']} s" if s.get("median_seconds") else ""))
        for cat, d in s["by_category"].items():
            print(f"    {ev.CATEGORIES.get(cat, cat):<26} {d['ok']}/{d['n']}")
        c = report["comparison"]
        if c["previous"]:
            print(f"\n  Banc précédent ({c['previous']['date']}, ZEUS {c['previous']['version']}) : "
                  f"{c['previous']['score']} %")
            if c["regressions"]:
                print(f"  {R}Régressions (réussis avant, ratés maintenant) : {', '.join(c['regressions'])}{C0}")
            if c["fixed"]:
                print(f"  {G}Progrès : {', '.join(c['fixed'])}{C0}")
        path = ev.save(home / "logs", report)
        print(f"\n  {G}Résultats enregistrés :{C0} {path}\n  Envoie ce fichier à Claude pour l'analyse.\n")
    finally:
        if zeus is not None:
            zeus.stop()
            zeus.db.close()
        _remove_tree(tmp)


def _remove_tree(path: Path, tries: int = 5) -> None:
    """Efface un dossier temporaire. Sous Windows, un fichier encore ouvert (antivirus, journal) bloque l'effacement
    quelques instants : on referme les journaux qui pointent dedans et on réessaie."""
    import logging
    import shutil
    for lg in (logging.getLogger("zeus"), logging.getLogger()):
        for hd in list(lg.handlers):
            if str(path) in str(getattr(hd, "baseFilename", "")):
                hd.close()
                lg.removeHandler(hd)
    for i in range(tries):
        shutil.rmtree(path, ignore_errors=True)
        if not path.exists():
            return
        time.sleep(0.3 * (i + 1))


def cmd_test(args: argparse.Namespace) -> None:
    import unittest
    sys.path.insert(0, str(ROOT / "tests"))
    suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"), pattern="test_*.py")
    res = unittest.TextTestRunner(verbosity=2 if args.verbose else 1).run(suite)
    sys.exit(0 if res.wasSuccessful() else 1)


def main() -> None:
    if sys.argv[1:2] != ["mcp"]:  # en mode MCP, la console appartient au protocole : on n'y touche pas
        fix_console()
    ap = argparse.ArgumentParser(prog="zeus", description="ZEUS — ton IA personnelle agentique")
    ap.add_argument("command", nargs="?", default="serve",
                    choices=["serve", "setup", "chat", "phone", "doctor", "mcp", "test", "version", "raccourci",
                             "shortcut", "mesure", "bench", "pedagogie", "cas", "banc"])
    ap.add_argument("--home", help="dossier des données (défaut : ./data)")
    ap.add_argument("--port", type=int, help="port de l'interface web (défaut 7777)")
    ap.add_argument("--host", help="adresse d'écoute (défaut 127.0.0.1)")
    ap.add_argument("--lan", action="store_true", help="accessible depuis les appareils du même Wi-Fi")
    ap.add_argument("--https", action="store_true",
                    help="HTTPS avec un certificat créé par ZEUS (micro et mode Jarvis sur le téléphone)")
    ap.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur")
    ap.add_argument("-v", "--verbose", action="store_true", help="journal détaillé")
    ap.add_argument("--print-config", action="store_true", help="mcp : affiche la configuration pour le client MCP")
    ap.add_argument("--modele", action="append", help="mesure : seulement ce modèle (id, répétable)")
    ap.add_argument("--repetitions", type=int, default=3, help="mesure : nombre d'essais par modèle (défaut 3)")
    ap.add_argument("--local", action="store_true", help="mesure : inclure les modèles locaux (plusieurs minutes)")
    ap.add_argument("--oui", action="store_true", help="mesure : ne pas demander confirmation du coût")
    ap.add_argument("--mini", action="store_true", help="mesure : vitesse du mini-cerveau local (gratuit)")
    ap.add_argument("--sans-bout-en-bout", action="store_true", help="mesure : sauter l'essai complet dans ZEUS")
    ap.add_argument("--statut", nargs=2, metavar=("N", "STATUT"), help="cas : classer le cas N (test, traite, ignore)")
    ap.add_argument("--categorie", action="append", help="banc : seulement ces catégories (maths, securite… ; répétable)")
    ap.add_argument("--langue", action="append", help="pedagogie : seulement ces langues (en, es, de, fr ; répétable)")
    args = ap.parse_args()
    from zeuscore.config import load_dotenv
    load_dotenv(ROOT / ".env")  # peut définir ZEUS_HOME…
    load_dotenv(home_dir(args) / ".env")  # …puis le .env du dossier de données
    if args.command == "version":
        print(f"ZEUS {__version__}")
        return
    {"serve": cmd_serve, "setup": cmd_setup, "chat": cmd_chat, "phone": cmd_phone, "doctor": cmd_doctor,
     "mcp": cmd_mcp, "test": cmd_test, "raccourci": cmd_shortcut, "shortcut": cmd_shortcut,
     "mesure": cmd_bench, "bench": cmd_bench, "pedagogie": cmd_pedagogie, "cas": cmd_cas, "banc": cmd_banc}[args.command](args)


if __name__ == "__main__":
    main()
