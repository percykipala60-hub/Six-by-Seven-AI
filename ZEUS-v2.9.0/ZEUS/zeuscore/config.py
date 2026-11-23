"""Configuration de ZEUS : data/zeus.json fusionné avec les valeurs par défaut."""

from __future__ import annotations

import copy
import json
import os
import secrets
import threading
from pathlib import Path
from typing import Any

DEFAULT_CONFIG: dict[str, Any] = {
    "version": 1,
    "owner": {
        "name": "",
        "city": "",
        "telegram_ids": [],
        "whatsapp_numbers": [],
        "phone_numbers": [],
        "emails": [],
    },
    "assistant": {
        "name": "ZEUS",
        "language": "fr",
        "personality": "calme, rapide, loyal, direct, avec une pointe d'humour quand c'est approprié",
    },
    # Liste des modèles. Exemple :
    # {"id": "local", "provider": "ollama", "base_url": "http://localhost:11434", "model": "qwen3:14b"}
    "models": [],
    # default = cerveau principal ; fast = tâches de fond ; vision = images ; max = « mode maximum » choisi par
    # conversation ; fallback = secours en cas de panne
    "routing": {"default": "", "fast": "", "vision": "", "max": "", "fallback": []},
    # Plafond de dépenses des modèles payants (0 = pas de plafond). on_limit : local = continuer avec les
    # modèles gratuits ; stop = tout arrêter jusqu'au mois suivant.
    "budget": {"monthly_usd": 0, "warn_percent": 80, "on_limit": "local"},
    "agent": {
        "max_steps": 40,
        "parallel_tools": 6,
        "context_tokens": 24000,
        "temperature": 0.3,
        "all_tools": False,
        "auto_learn": True,
        "tool_output_chars": 12000,
    },
    "security": {
        # prudent : demande avant toute modification
        # equilibre : agit seul en local, demande avant d'envoyer / supprimer / payer
        # autonome : agit seul, ne demande que pour l'argent et les commandes catastrophiques
        "autonomy": "equilibre",
        "confirm_payments": True,
        "approval_timeout": 600,
        "always_allow": [],
        "workspace": "",
    },
    "web": {
        "host": "127.0.0.1",
        "port": 7777,
        "token": "",
        "https": False,
        "ssl_cert": "",
        "ssl_key": "",
        "open_browser": True,
        # Ouvrir ZEUS dans sa propre fenêtre (Edge ou Chrome en mode application) plutôt que dans un onglet
        "app_window": True,
    },
    "telegram": {"enabled": False, "bot_token": "", "allow_external": False},
    "whatsapp": {
        "enabled": False,
        "phone_number_id": "",
        "access_token": "",
        "verify_token": "",
        "app_secret": "",
        "allow_external": True,
        "api_version": "v21.0",
    },
    "email": {
        "enabled": False,
        "imap_host": "",
        "imap_port": 993,
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_ssl": False,
        "username": "",
        "password": "",
        "from_name": "ZEUS",
        "poll_seconds": 60,
        "allow_external": True,
        "folder": "INBOX",
    },
    "browser": {"headless": False},
    "phone": {"enabled": True, "adb_path": "", "serial": "", "unlock_pin": "", "screenshot_max": 1280,
              "country_code": "", "watch_seconds": 20},
    # SMS reçus et envoyés par TON téléphone Android (guichet par SMS, sans internet pour l'usager)
    "sms": {"enabled": False, "allow_external": True, "poll_seconds": 20, "max_per_hour": 6, "max_chars": 459,
            "notify_owner": False},
    # Mode serveur MCP (python zeus.py mcp) : boîtes d'outils exposées aux autres IA
    # ZEUS lui-même comme serveur MCP (python zeus.py mcp) pour Claude Desktop, Cursor, VS Code, Hermes…
    "mcp_server": {"toolsets": ["phone", "dossiers", "computer", "browser"],
                   "tools": ["web_search", "fetch_url", "read_file", "list_dir", "remember", "recall"],
                   "allow_tasks": True,      # outil zeus_ask : confier une tâche entière à ZEUS
                   "approval": "host",       # host = le client MCP demande ton accord ; zeus = validations ZEUS
                   "connect_mcp": False},    # relayer aussi les serveurs MCP branchés sur ZEUS
    "voice": {
        "stt": {"base_url": "", "api_key": "", "model": "whisper-1"},
        "tts": {"base_url": "", "api_key": "", "model": "", "voice": ""},
        "wake_word": "zeus",
        # Langue de la reconnaissance vocale : "" = automatique (fr, en, es, de…), sinon "fr", "en", "es", "de"
        "language": "",
        # Répondre aussi en vocal quand on me parle en vocal (Telegram)
        "reply_voice": True,
    },
    # Professeur de langue : seconde lecture des corrections par le modèle rapide (auto = seulement s'il est en
    # ligne ; always = toujours ; off = jamais)
    "learning": {"verify_corrections": "auto", "goals": {"cards": 10, "speak_min": 5, "msgs": 3}},
    # Bibliothèque : dossiers et fichiers que ZEUS indexe pour chercher dans tes documents (cours, notes, PDF…)
    "knowledge": {"folders": [], "files": [], "ocr_images": False, "max_file_mb": 40, "auto_index_minutes": 30},
    # Calendriers externes lus par ZEUS (adresse secrète iCal de Google Agenda, calendrier publié d'Outlook…)
    "calendar": {"feeds": [], "sync_minutes": 15, "past_days": 7, "future_days": 120},
    "search": {"provider": "auto", "brave_api_key": "", "tavily_api_key": "", "searxng_url": ""},
    "guichet": {
        "enabled": True,
        "organisation": "",
        "auto_relance": False,
        "relance_hours": 48,
        "max_relances": 3,
        "welcome": "",
    },
    # "nom": {"command": "npx", "args": [...], "env": {}, "trust": "external"} ou {"url": "https://..."}
    "mcp_servers": {},
}


def load_dotenv(*paths: Path) -> list[str]:
    """Charge les fichiers .env (CLÉ=valeur) dans l'environnement, sans écraser une variable déjà définie.

    Les clés y restent hors de zeus.json : dans la configuration, « env:ANTHROPIC_API_KEY » renvoie vers elles."""
    loaded: list[str] = []
    for p in paths:
        try:
            lines = Path(p).read_text(encoding="utf-8-sig").splitlines()
        except OSError:
            continue
        for line in lines:
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            key, val = s.split("=", 1)
            key = key.strip().removeprefix("export ").strip()
            val = val.strip()
            if val[:1] in ("'", '"') and val.count(val[0]) >= 2:
                val = val[1:val.index(val[0], 1)]
            elif " #" in val:
                val = val.split(" #", 1)[0].rstrip()
            if not key or not val or val.startswith("votre_") or val.endswith("_ici"):
                continue  # valeur d'exemple non remplie
            if key not in os.environ:
                os.environ[key] = val
                loaded.append(key)
    return loaded


def _deep_merge(base: dict, extra: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


class Config:
    def __init__(self, home: Path):
        self.home = Path(home)
        self.home.mkdir(parents=True, exist_ok=True)
        self.path = self.home / "zeus.json"
        self._lock = threading.RLock()
        self.data: dict[str, Any] = {}
        self.load()

    # ------------------------------------------------------------------ fichiers
    def load(self) -> None:
        with self._lock:
            raw: dict[str, Any] = {}
            if self.path.exists():
                try:
                    raw = json.loads(self.path.read_text(encoding="utf-8"))
                except Exception as e:  # fichier abîmé : on garde une copie
                    bad = self.path.with_suffix(".json.bad")
                    self.path.replace(bad)
                    import sys
                    print(f"[ZEUS] zeus.json illisible ({e}) — sauvegardé dans {bad.name}", file=sys.stderr)
            self.data = _deep_merge(DEFAULT_CONFIG, raw)
            changed = not self.path.exists()
            if not self.data["web"].get("token"):
                self.data["web"]["token"] = secrets.token_urlsafe(18)
                changed = True
            if changed:
                self.save()

    def save(self) -> None:
        with self._lock:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(tmp, self.path)
            try:
                os.chmod(self.path, 0o600)
            except Exception:
                pass

    # ------------------------------------------------------------------ accès
    def get(self, dotted: str, default: Any = None) -> Any:
        cur: Any = self.data
        for part in dotted.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                return default
        return cur

    def set(self, dotted: str, value: Any, save: bool = True) -> None:
        with self._lock:
            parts = dotted.split(".")
            cur = self.data
            for p in parts[:-1]:
                cur = cur.setdefault(p, {})
            cur[parts[-1]] = value
            if save:
                self.save()

    def update(self, patch: dict, save: bool = True) -> None:
        with self._lock:
            self.data = _deep_merge(self.data, patch)
            if save:
                self.save()

    @staticmethod
    def secret(value: Any) -> str:
        """« env:NOM » → variable d'environnement ; sinon la valeur telle quelle."""
        if isinstance(value, str) and value.startswith("env:"):
            return os.environ.get(value[4:].strip(), "")
        return value or ""

    # ------------------------------------------------------------------ chemins
    @property
    def workspace(self) -> Path:
        ws = self.get("security.workspace") or ""
        p = Path(os.path.expanduser(ws)) if ws else self.home / "workspace"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def dir(self, name: str) -> Path:
        p = self.home / name
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def assistant_name(self) -> str:
        return self.get("assistant.name") or "ZEUS"

    @property
    def owner_name(self) -> str:
        return self.get("owner.name") or ""
