"""Connecteurs de modèles et routage.

- Ollama (natif, local) — garde le modèle en mémoire, contexte réglable
- Tout serveur « compatible OpenAI » : OpenAI, OpenRouter, Groq, Mistral, DeepSeek,
  Gemini, xAI, Together, LM Studio, llama.cpp, vLLM…
- Anthropic (Claude), avec cache de prompt

Le routeur essaie le modèle prévu, puis bascule tout seul sur les suivants en cas de
panne, de quota ou de délai. Les modèles sans appel d'outils natif passent
automatiquement en « mode texte » (<tool_call>{json}</tool_call>).
"""

from __future__ import annotations

import base64
import http.client
import json
import re
import socket
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .util import log, parse_json_loose, shrink_image

PRESETS: dict[str, dict[str, str]] = {
    "ollama": {"provider": "ollama", "base_url": "http://localhost:11434"},
    "lmstudio": {"provider": "openai", "base_url": "http://localhost:1234/v1"},
    "llamacpp": {"provider": "openai", "base_url": "http://localhost:8080/v1"},
    "vllm": {"provider": "openai", "base_url": "http://localhost:8000/v1"},
    "openai": {"provider": "openai", "base_url": "https://api.openai.com/v1"},
    "openrouter": {"provider": "openai", "base_url": "https://openrouter.ai/api/v1"},
    "groq": {"provider": "openai", "base_url": "https://api.groq.com/openai/v1"},
    "mistral": {"provider": "openai", "base_url": "https://api.mistral.ai/v1"},
    "deepseek": {"provider": "openai", "base_url": "https://api.deepseek.com/v1"},
    "gemini": {"provider": "openai", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai"},
    "cerebras": {"provider": "openai", "base_url": "https://api.cerebras.ai/v1"},
    "xai": {"provider": "openai", "base_url": "https://api.x.ai/v1"},
    "together": {"provider": "openai", "base_url": "https://api.together.xyz/v1"},
    "anthropic": {"provider": "anthropic", "base_url": "https://api.anthropic.com"},
}

StreamCB = Callable[[str | None], None]


class LLMError(Exception):
    def __init__(self, kind: str, message: str, status: int | None = None, retry_after: float | None = None,
                 kinds: list[str] | None = None):
        super().__init__(message)
        self.kind = kind
        self.status = status
        self.retry_after = retry_after
        self.kinds = kinds or []  # all_failed : type d'erreur de chaque modèle essayé (« :local » si local)

    def __str__(self) -> str:
        return f"[{self.kind}] {self.args[0]}"


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "arguments": self.arguments}


@dataclass
class LLMResponse:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict = field(default_factory=dict)
    model: str = ""
    stop: str = ""
    cost: float | None = None
    lean: bool = False  # réponse du mini-cerveau local (requête légère, sans outils)


def new_call_id() -> str:
    return "call_" + uuid.uuid4().hex[:12]


THINK_RE = re.compile(r"<think>.*?(?:</think>|$)", re.S)


def strip_think(text: str) -> str:
    return THINK_RE.sub("", text or "").strip()


class VisibleStream:
    """Filtre le flux affiché : masque <think>…</think> et les blocs <tool_call>."""

    HIDE = (("<think>", "</think>"), ("<tool_call>", "</tool_call>"))

    def __init__(self, cb: StreamCB | None):
        self.cb = cb
        self.buf = ""
        self.hiding: str | None = None

    def feed(self, s: str) -> None:
        if not self.cb or not s:
            return
        self.buf += s
        out: list[str] = []
        while self.buf:
            if self.hiding:
                i = self.buf.find(self.hiding)
                if i < 0:
                    keep = len(self.hiding) - 1
                    self.buf = self.buf[-keep:]
                    break
                self.buf = self.buf[i + len(self.hiding):]
                self.hiding = None
                continue
            i = self.buf.find("<")
            if i < 0:
                out.append(self.buf)
                self.buf = ""
                break
            out.append(self.buf[:i])
            self.buf = self.buf[i:]
            matched = partial = False
            for start, end in self.HIDE:
                if self.buf.startswith(start):
                    self.buf = self.buf[len(start):]
                    self.hiding = end
                    matched = True
                    break
                if start.startswith(self.buf):
                    partial = True
            if matched:
                continue
            if partial:
                break
            out.append("<")
            self.buf = self.buf[1:]
        text = "".join(out)
        if text:
            self.cb(text)

    def flush(self) -> None:
        if self.cb and self.buf and not self.hiding:
            self.cb(self.buf)
        self.buf = ""


# --------------------------------------------------------------------------- HTTP
# Délai sans aucune nouvelle du serveur (connexion, puis entre deux morceaux de la réponse).
# En ligne, les serveurs envoient vite un premier octet : au-delà d'une minute et demie, c'est une panne ou une
# connexion morte, mieux vaut passer au modèle suivant. Un modèle local sans carte graphique peut mettre 4 à 8 minutes
# avant le premier mot : on lui laisse 10 minutes. Réglable par modèle avec « timeout » (secondes).
CLOUD_TIMEOUT = 90.0
LOCAL_TIMEOUT = 600.0
LOCAL_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "[::1]")


# Dernier signe de vie du serveur, par fil d'appel (réponse reçue, ligne de flux) : sert à prévenir quand un modèle
# en ligne tarde, sans fausse alerte quand il écrit un long appel d'outil (qui n'affiche aucun texte).
_ACTIVITY: dict[int, float] = {}


def _alive() -> None:
    _ACTIVITY[threading.get_ident()] = time.time()


# Coupure d'internet : on attend au plus tant de secondes son retour avant de passer au modèle local (plusieurs
# minutes sans carte graphique). Les micro-coupures (DNS, Wi-Fi, réseau mobile) durent souvent moins d'une minute.
INTERNET_WAIT_BEFORE_LOCAL = 45.0


def _reachable(base_url: str, timeout: float = 3.0) -> bool:
    """Le serveur d'un modèle en ligne répond-il au niveau réseau (DNS + connexion TCP) ?"""
    import socket
    import urllib.parse as _up
    u = _up.urlparse(base_url or "")
    host = u.hostname
    if not host:
        return False
    port = u.port or (443 if u.scheme == "https" else 80)
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


# Au plus tant de secondes d'attente sur une limite de débit avant de passer au modèle local (bien plus lent).
RATE_WAIT_BEFORE_LOCAL = 60

# Mini-cerveau local (minibrain.py) : fenêtre de contexte réduite et modèle gardé en mémoire une heure.
MINI_CONTEXT = 4096
MINI_KEEP_ALIVE = "60m"
MINI_MAX_TOKENS = 450  # réponse du mini-cerveau : 3 à 8 jetons par seconde sur un PC sans carte graphique


def _warm_key(system: str) -> str:
    import hashlib
    return hashlib.sha1(system.encode("utf-8")).hexdigest()


# Offres gratuites qui limitent la taille d'UNE requête (jetons par minute) : Groq gratuit, 8 000 jetons par minute
# et par modèle. Une requête plus grosse est refusée d'office (HTTP 413) : ZEUS raccourcit l'historique avant.
FREE_REQUEST_LIMITS = {"api.groq.com": 8000}


def request_limit(cfg: dict) -> int | None:
    """Taille maximale d'une requête pour ce modèle (jetons), ou None. « max_request_tokens » dans la configuration
    l'impose ; « tier »: « paid » la lève (offre payante)."""
    if cfg.get("max_request_tokens"):
        return int(cfg["max_request_tokens"])
    if str(cfg.get("tier") or "").lower() == "paid":
        return None
    base = str(cfg.get("base_url") or "").lower()
    return next((v for host, v in FREE_REQUEST_LIMITS.items() if host in base), None)


def is_free_tier(cfg: dict) -> bool:
    return request_limit(cfg) is not None and not cfg.get("max_request_tokens")


def is_local_cfg(cfg: dict) -> bool:
    """Modèle qui tourne sur cette machine (Ollama, LM Studio, llama.cpp…) ? « local »: true/false force le choix."""
    if cfg.get("local") is not None:
        return bool(cfg["local"])
    base = str(cfg.get("base_url") or "").lower()
    return cfg.get("provider") == "ollama" or any(x in base for x in LOCAL_HOSTS)


def _http_error(code: int, body: str, headers: Any) -> LLMError:
    msg = body[:800]
    try:
        j = json.loads(body)
        err = j.get("error")
        if isinstance(err, dict):
            msg = err.get("message") or json.dumps(err)
        elif err:
            msg = str(err)
        elif j.get("message"):
            msg = j["message"]
    except Exception:
        pass
    low = (msg or "").lower()
    if "credit balance" in low or "insufficient_quota" in low or "insufficient credit" in low or code == 402:
        kind = "billing"
        msg = "crédits épuisés chez le fournisseur : ajoute des crédits (Claude : platform.claude.com → Settings → " \
              f"Billing → Buy credits). Détail : {msg}"
    elif code in (401, 403):
        kind = "auth"
    elif code == 404:
        kind = "not_found"
    elif code == 429:
        kind = "rate_limit"
    elif code == 413 and ("request too large" in low or "tokens per minute" in low):
        # Groq gratuit : une seule requête dépasse la limite de jetons par minute (8 000). Comme pour une fenêtre de
        # contexte dépassée, l'agent résume le début de la conversation et recommence.
        kind = "context_length"
    elif code in (400, 413, 422):
        if "tool" in low and ("support" in low or "not allowed" in low or "unknown" in low):
            kind = "tools_unsupported"
        elif ("context" in low and ("length" in low or "window" in low or "exceed" in low)) or \
                "too many tokens" in low or "prompt is too long" in low or "maximum context" in low:
            kind = "context_length"
        else:
            kind = "bad_request"
    elif code >= 500:
        kind = "server"
    else:
        kind = "http"
    ra = None
    try:
        ra = float(headers.get("retry-after")) if headers and headers.get("retry-after") else None
    except Exception:
        ra = None
    if ra is None and kind == "rate_limit":  # Groq l'écrit aussi dans le message : « try again in 1m2.5s »
        m = re.search(r"try again in (?:(\d+)m)?([\d.]+)(ms|s)\b", msg)
        if m:
            ra = int(m.group(1) or 0) * 60 + float(m.group(2)) / (1000 if m.group(3) == "ms" else 1)
    return LLMError(kind, f"HTTP {code} : {msg}", status=code, retry_after=ra)


def http_json(url: str, payload: dict | None = None, headers: dict | None = None, timeout: float = 60,
              method: str | None = None) -> Any:
    """Requête JSON simple (non streamée)."""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"),
                                 headers={"Content-Type": "application/json", "User-Agent": "ZEUS/1.0",
                                          **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        raise _http_error(e.code, body, e.headers) from None
    except urllib.error.URLError as e:
        raise LLMError("connection", f"{url} injoignable : {e.reason}") from None
    except (socket.timeout, TimeoutError):
        raise LLMError("timeout", f"{url} ne répond pas") from None


def _open_stream(url: str, payload: dict, headers: dict, timeout: float):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Content-Type": "application/json", "Accept": "text/event-stream, application/json",
        "User-Agent": "ZEUS/1.0", **headers})
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        _alive()
        return resp
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            pass
        raise _http_error(e.code, body, e.headers) from None
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        if isinstance(reason, (socket.timeout, TimeoutError)):
            raise LLMError("timeout", f"{url} ne répond pas") from None
        raise LLMError("connection", f"{url} injoignable : {reason}") from None
    except (socket.timeout, TimeoutError):
        raise LLMError("timeout", f"{url} ne répond pas (délai {timeout:.0f} s)") from None
    except (ConnectionError, OSError) as e:
        raise LLMError("connection", f"{url} : {e}") from None


def _open_local_stream(url: str, payload: dict, headers: dict, timeout: float, cancel: threading.Event | None):
    """Comme _open_stream, mais ⏹️ coupe la connexion tout de suite, même pendant les minutes où un modèle local lit
    les consignes sans rien envoyer : Ollama voit la déconnexion et arrête de calculer (le PC est libéré)."""
    import urllib.parse as _up
    u = _up.urlparse(url)
    cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
    conn = cls(u.hostname or "localhost", u.port or (443 if u.scheme == "https" else 80), timeout=timeout)
    finished = threading.Event()

    def cut() -> None:
        try:
            if conn.sock is not None:
                conn.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass

    def watch() -> None:
        while cancel is not None and not finished.is_set():
            if cancel.wait(0.25):
                for _ in range(30):  # la connexion peut s'ouvrir juste après : on recoupe pendant quelques secondes
                    cut()
                    if finished.wait(0.2):
                        return
                return

    if cancel is not None:
        if cancel.is_set():
            raise LLMError("cancelled", "annulé")
        threading.Thread(target=watch, name="arret-modele-local", daemon=True).start()
    body = json.dumps(payload).encode("utf-8")
    try:
        conn.request("POST", (u.path or "/") + (f"?{u.query}" if u.query else ""), body=body, headers={
            "Content-Type": "application/json", "Accept": "application/x-ndjson", "User-Agent": "ZEUS/1.0", **headers})
        resp = conn.getresponse()
    except (socket.timeout, TimeoutError):
        finished.set()
        raise LLMError("timeout", f"{url} ne répond pas (délai {timeout:.0f} s)") from None
    except (ConnectionError, http.client.HTTPException, OSError) as e:
        finished.set()
        if cancel is not None and cancel.is_set():
            raise LLMError("cancelled", "annulé") from None
        raise LLMError("connection", f"{url} injoignable : {e}") from None
    _alive()
    if resp.status >= 400:
        raw = resp.read().decode("utf-8", "replace")
        finished.set()
        conn.close()
        raise _http_error(resp.status, raw, resp.headers)
    resp._zeus_done = finished  # type: ignore[attr-defined]  — arrête la surveillance à la fin de la lecture
    resp._zeus_conn = conn  # type: ignore[attr-defined]  — fermée avec la réponse
    return resp


def _iter_lines(resp, cancel: threading.Event | None):
    try:
        for raw in resp:
            if cancel is not None and cancel.is_set():
                raise LLMError("cancelled", "annulé")
            _alive()
            yield raw.decode("utf-8", "replace").rstrip("\r\n")
    except (socket.timeout, TimeoutError):
        raise LLMError("timeout", "le modèle a cessé de répondre") from None
    except (ConnectionError, http.client.HTTPException, OSError) as e:
        if cancel is not None and cancel.is_set():
            raise LLMError("cancelled", "annulé") from None
        raise LLMError("connection", f"connexion coupée pendant la réponse ({type(e).__name__})") from None
    finally:
        done = getattr(resp, "_zeus_done", None)
        if done is not None:
            done.set()
        try:
            resp.close()
        except Exception:
            pass
        conn = getattr(resp, "_zeus_conn", None)
        if conn is not None:
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass


# --------------------------------------------------------------------------- contenus
def content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")
    return str(content or "")


def has_images(messages: list[dict]) -> bool:
    for m in messages:
        c = m.get("content")
        if isinstance(c, list) and any(isinstance(p, dict) and p.get("type") == "image" for p in c):
            return True
    return False


def strip_images(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages:
        c = m.get("content")
        if isinstance(c, list):
            parts = []
            for p in c:
                if isinstance(p, dict) and p.get("type") == "image":
                    parts.append({"type": "text", "text": f"[image : {p.get('path', 'jointe')} — ce modèle ne voit "
                                                         f"pas les images ; utilise look_at_image si besoin]"})
                else:
                    parts.append(p)
            m = {**m, "content": parts}
        out.append(m)
    return out


_IMG_CACHE: dict[str, tuple[str, str]] = {}


def image_b64(part: dict, max_side: int = 1280) -> tuple[str, str]:
    """Renvoie (mime, base64) d'une partie image (chemin ou données)."""
    if part.get("data"):
        return part.get("mime", "image/png"), part["data"]
    path = part.get("path", "")
    key = f"{path}:{max_side}"
    if key in _IMG_CACHE:
        return _IMG_CACHE[key]
    raw = Path(path).read_bytes()
    data, mime, _ = shrink_image(raw, max_side)
    res = (mime, base64.b64encode(data).decode())
    if len(_IMG_CACHE) > 32:
        _IMG_CACHE.clear()
    _IMG_CACHE[key] = res
    return res


def _tools_openai(tools: list[dict]) -> list[dict]:
    return [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                              "parameters": t["parameters"]}} for t in tools]


# --------------------------------------------------------------------------- fournisseurs
class Provider:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.base_url = (cfg.get("base_url") or "").rstrip("/")
        self.model = cfg.get("model", "")
        self.timeout = float(cfg.get("timeout") or (LOCAL_TIMEOUT if is_local_cfg(cfg) else CLOUD_TIMEOUT))
        self._dropped: set[str] = set()

    @property
    def api_key(self) -> str:
        from .config import Config
        return Config.secret(self.cfg.get("api_key", ""))

    def chat(self, messages: list[dict], tools: list[dict] | None, stream_cb: StreamCB | None,
             cancel: threading.Event | None, temperature: float | None, max_tokens: int | None) -> LLMResponse:
        raise NotImplementedError


class OpenAIProvider(Provider):
    def _messages(self, messages: list[dict]) -> list[dict]:
        out: list[dict] = []
        for m in messages:
            role = m["role"]
            if role == "tool":
                out.append({"role": "tool", "tool_call_id": m.get("tool_call_id", ""),
                            "content": content_text(m.get("content"))})
                continue
            c = m.get("content")
            if isinstance(c, list):
                parts = []
                for p in c:
                    if p.get("type") == "image":
                        try:
                            mime, b64 = image_b64(p)
                            parts.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
                        except Exception as e:
                            parts.append({"type": "text", "text": f"[image illisible : {e}]"})
                    elif p.get("type") == "text":
                        parts.append({"type": "text", "text": p.get("text", "")})
                content: Any = parts if any(p["type"] == "image_url" for p in parts) else content_text(c)
            else:
                content = c or ""
            msg: dict[str, Any] = {"role": role, "content": content}
            if role == "assistant" and m.get("tool_calls"):
                msg["tool_calls"] = [{"id": tc["id"], "type": "function",
                                      "function": {"name": tc["name"],
                                                   "arguments": json.dumps(tc.get("arguments") or {},
                                                                           ensure_ascii=False)}}
                                     for tc in m["tool_calls"]]
                if not content:
                    msg["content"] = None
            out.append(msg)
        return out

    def chat(self, messages, tools, stream_cb, cancel, temperature, max_tokens):
        payload: dict[str, Any] = {"model": self.model, "messages": self._messages(messages), "stream": True}
        if tools:
            payload["tools"] = _tools_openai(tools)
            if "tool_choice" not in self._dropped:
                payload["tool_choice"] = "auto"
        if temperature is not None and "temperature" not in self._dropped:
            payload["temperature"] = temperature
        if max_tokens:
            payload["max_completion_tokens" if "max_tokens" in self._dropped else "max_tokens"] = max_tokens
        for k, v in (self.cfg.get("extra") or {}).items():
            payload[k] = v
        headers = dict(self.cfg.get("headers") or {})
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if "openrouter.ai" in self.base_url:
            headers.setdefault("HTTP-Referer", "https://github.com/zeus-agent")
            headers.setdefault("X-Title", "ZEUS")
        for _ in range(3):
            try:
                return self._stream(payload, headers, stream_cb, cancel)
            except LLMError as e:
                low = str(e).lower()
                if e.kind == "bad_request":
                    if "temperature" in low and "temperature" in payload:
                        self._dropped.add("temperature")
                        payload.pop("temperature", None)
                        continue
                    if "max_tokens" in low and "max_tokens" in payload:
                        self._dropped.add("max_tokens")
                        payload["max_completion_tokens"] = payload.pop("max_tokens")
                        continue
                    if "tool_choice" in low and "tool_choice" in payload:
                        self._dropped.add("tool_choice")
                        payload.pop("tool_choice", None)
                        continue
                raise
        raise LLMError("bad_request", "paramètres refusés par le serveur")

    def _stream(self, payload, headers, stream_cb, cancel) -> LLMResponse:
        resp = _open_stream(f"{self.base_url}/chat/completions", payload, headers, self.timeout)
        ctype = (resp.headers.get("Content-Type") or "").lower()
        vis = VisibleStream(stream_cb)
        text_parts: list[str] = []
        calls: dict[int, dict] = {}
        usage: dict = {}
        stop = ""
        done = False
        other: list[str] = []
        for line in _iter_lines(resp, cancel):
            s = line.strip()
            if not s or s.startswith(":"):
                continue
            if not s.startswith("data:"):
                other.append(line)
                continue
            data = s[5:].strip()
            if data == "[DONE]":
                done = True
                break
            try:
                chunk = json.loads(data)
            except Exception:
                continue
            if chunk.get("error"):
                err = chunk["error"]
                raise LLMError("server", err.get("message", str(err)) if isinstance(err, dict) else str(err))
            for ch in chunk.get("choices") or []:
                d = ch.get("delta") or ch.get("message") or {}
                c = d.get("content")
                if isinstance(c, str) and c:
                    text_parts.append(c)
                    vis.feed(c)
                for tc in d.get("tool_calls") or []:
                    idx = tc.get("index")
                    if idx is None:
                        idx = len(calls)
                    slot = calls.setdefault(idx, {"id": None, "name": "", "args": ""})
                    if tc.get("id"):
                        slot["id"] = tc["id"]
                    fn = tc.get("function") or {}
                    if fn.get("name"):
                        if not slot["name"]:
                            slot["name"] = fn["name"]
                        elif fn["name"] not in slot["name"]:
                            slot["name"] += fn["name"]
                    a = fn.get("arguments")
                    if isinstance(a, dict):
                        slot["args"] = json.dumps(a)
                    elif a:
                        slot["args"] += a
                if ch.get("finish_reason"):
                    stop = ch["finish_reason"]
            if chunk.get("usage"):
                usage = chunk["usage"]
            elif isinstance(chunk.get("x_groq"), dict) and chunk["x_groq"].get("usage"):
                usage = chunk["x_groq"]["usage"]  # Groq : « x_groq » existe (doc officielle) ; les compteurs
                # du flux y sont décrits par des bibliothèques clientes, pas par la doc : simple secours sans effet sinon
        if other and not text_parts and not calls:
            # Le serveur a ignoré « stream » et renvoyé un JSON entier.
            try:
                whole = json.loads("\n".join(other))
                if whole.get("error"):
                    raise LLMError("server", str(whole["error"]))
                msg = (whole.get("choices") or [{}])[0].get("message") or {}
                c = msg.get("content") or ""
                text_parts.append(c)
                vis.feed(c)
                for i, tc in enumerate(msg.get("tool_calls") or []):
                    fn = tc.get("function") or {}
                    a = fn.get("arguments")
                    calls[i] = {"id": tc.get("id"), "name": fn.get("name", ""),
                                "args": json.dumps(a) if isinstance(a, dict) else (a or "")}
                usage = whole.get("usage") or {}
            except LLMError:
                raise
            except Exception:
                if "json" in ctype:
                    raise LLMError("server", "réponse illisible : " + "\n".join(other)[:300]) from None
        elif not done and not stop:
            # ni « [DONE] » ni raison d'arrêt : la connexion est tombée au milieu, la réponse est incomplète
            raise LLMError("connection", "connexion coupée au milieu de la réponse (réponse incomplète)")
        vis.flush()
        out_calls = []
        for idx in sorted(calls):
            slot = calls[idx]
            if not slot["name"]:
                continue
            try:
                args = parse_json_loose(slot["args"]) if slot["args"].strip() else {}
                if not isinstance(args, dict):
                    args = {"value": args}
            except Exception:
                args = {"_invalid_json": slot["args"][:2000]}
            out_calls.append(ToolCall(slot["id"] or new_call_id(), slot["name"], args))
        return LLMResponse(text=strip_think("".join(text_parts)), tool_calls=out_calls, usage=usage, stop=stop)


class OllamaProvider(Provider):
    def _messages(self, messages: list[dict]) -> list[dict]:
        out: list[dict] = []
        for m in messages:
            role = m["role"]
            c = m.get("content")
            msg: dict[str, Any] = {"role": role, "content": content_text(c)}
            if isinstance(c, list):
                imgs = []
                for p in c:
                    if p.get("type") == "image":
                        try:
                            imgs.append(image_b64(p)[1])
                        except Exception:
                            pass
                if imgs:
                    msg["images"] = imgs
            if role == "assistant" and m.get("tool_calls"):
                msg["tool_calls"] = [{"function": {"name": tc["name"], "arguments": tc.get("arguments") or {}}}
                                     for tc in m["tool_calls"]]
            if role == "tool":
                msg["tool_name"] = m.get("name", "")
            out.append(msg)
        return out

    def chat(self, messages, tools, stream_cb, cancel, temperature, max_tokens):
        opts: dict[str, Any] = {"num_ctx": int(self.cfg.get("context") or 16384)}
        if temperature is not None:
            opts["temperature"] = temperature
        if max_tokens:
            opts["num_predict"] = max_tokens
        payload: dict[str, Any] = {"model": self.model, "messages": self._messages(messages), "stream": True,
                                   "options": opts, "keep_alive": self.cfg.get("keep_alive", "30m")}
        if tools:
            payload["tools"] = _tools_openai(tools)
        if self.cfg.get("think") is not None:
            payload["think"] = bool(self.cfg["think"])
        headers = dict(self.cfg.get("headers") or {})
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        resp = _open_local_stream(f"{self.base_url}/api/chat", payload, headers, self.timeout, cancel)
        vis = VisibleStream(stream_cb)
        parts: list[str] = []
        calls: list[ToolCall] = []
        usage: dict = {}
        stop = ""
        for line in _iter_lines(resp, cancel):
            if not line.strip():
                continue
            try:
                j = json.loads(line)
            except Exception:
                continue
            if j.get("error"):
                e = str(j["error"])
                if "does not support tools" in e:
                    raise LLMError("tools_unsupported", e)
                raise LLMError("server", e)
            msg = j.get("message") or {}
            c = msg.get("content")
            if c:
                parts.append(c)
                vis.feed(c)
            for tc in msg.get("tool_calls") or []:
                fn = tc.get("function") or {}
                args = fn.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = parse_json_loose(args)
                    except Exception:
                        args = {"_invalid_json": args}
                calls.append(ToolCall(tc.get("id") or new_call_id(), fn.get("name", ""), args))
            if j.get("done"):
                stop = j.get("done_reason", "stop")
                usage = {"prompt_tokens": j.get("prompt_eval_count"), "completion_tokens": j.get("eval_count")}
                break
        if not stop:
            raise LLMError("connection", "le modèle local s'est interrompu au milieu de la réponse")
        vis.flush()
        return LLMResponse(text=strip_think("".join(parts)), tool_calls=[c for c in calls if c.name],
                           usage=usage, stop=stop)


ANTHROPIC_VERSION = "2026-10-21"
ANTHROPIC_LEGACY_VERSION = "2023-06-01"


class AnthropicProvider(Provider):
    """API Messages de Claude (version 2026-10-21, repli automatique sur 2023-06-01).

    Coûts : le début de la conversation (outils, consignes, messages déjà envoyés) est mis en cache à chaque
    étape ; l'étape suivante le relit au tarif « cache » (5 % du prix d'entrée pour Opus 5.5 et Sonnet 5.5).
    """

    def __init__(self, cfg: dict):
        super().__init__(cfg)
        self.version = str(cfg.get("api_version") or ANTHROPIC_VERSION)

    def _headers(self) -> dict[str, str]:
        from .config import Config
        key = self.api_key
        h = {"anthropic-version": self.version}
        official = not self.base_url or "api.anthropic.com" in self.base_url
        if (self.cfg.get("auth") or ("bearer" if official else "x-api-key")) == "bearer":
            h["Authorization"] = f"Bearer {key}"
        else:
            h["x-api-key"] = key
        ws = Config.secret(str(self.cfg.get("workspace_id") or "")).strip()
        if ws:
            h["anthropic-workspace-id"] = ws
        h.update(self.cfg.get("headers") or {})
        return h

    def _cache_control(self) -> dict:
        cc: dict[str, Any] = {"type": "ephemeral"}
        if self.cfg.get("cache_ttl") == "1h":
            cc["ttl"] = "1h"
        return cc

    def _convert(self, messages: list[dict]) -> tuple[str, list[dict]]:
        system: list[str] = []
        out: list[dict] = []

        def push(role: str, blocks: list[dict]) -> None:
            if not blocks:
                return
            if out and out[-1]["role"] == role:
                if role == "user":
                    # les tool_result doivent précéder le reste
                    tr = [b for b in blocks if b["type"] == "tool_result"]
                    other = [b for b in blocks if b["type"] != "tool_result"]
                    prev = out[-1]["content"]
                    prev_tr = [b for b in prev if b["type"] == "tool_result"]
                    prev_other = [b for b in prev if b["type"] != "tool_result"]
                    out[-1]["content"] = prev_tr + tr + prev_other + other
                else:
                    out[-1]["content"].extend(blocks)
            else:
                out.append({"role": role, "content": list(blocks)})

        for m in messages:
            role = m["role"]
            c = m.get("content")
            if role == "system":
                system.append(content_text(c))
                continue
            if role == "tool":
                block: dict[str, Any] = {"type": "tool_result", "tool_use_id": m.get("tool_call_id", ""),
                                         "content": content_text(c) or "(vide)"}
                if (m.get("meta") or {}).get("error"):
                    block["is_error"] = True
                push("user", [block])
                continue
            volatile = bool(m.get("volatile"))
            blocks: list[dict] = []
            if isinstance(c, list):
                for p in c:
                    if p.get("type") == "text" and p.get("text"):
                        blocks.append({"type": "text", "text": p["text"]})
                    elif p.get("type") == "image":
                        try:
                            mime, b64 = image_b64(p)
                            blocks.append({"type": "image", "source": {"type": "base64", "media_type": mime,
                                                                       "data": b64}})
                        except Exception as e:
                            blocks.append({"type": "text", "text": f"[image illisible : {e}]"})
            elif c:
                blocks.append({"type": "text", "text": c})
            if role == "assistant":
                for tc in m.get("tool_calls") or []:
                    blocks.append({"type": "tool_use", "id": tc["id"], "name": tc["name"],
                                   "input": tc.get("arguments") or {}})
            if volatile:
                for b in blocks:
                    b["_volatile"] = True
            push("assistant" if role == "assistant" else "user", blocks)
        if out and out[0]["role"] != "user":
            out.insert(0, {"role": "user", "content": [{"type": "text", "text": "(suite de la conversation)"}]})
        # point de cache : dernier bloc stable de la conversation (les notes volatiles, comme le plan, restent après)
        marked = self.cfg.get("cache") is False
        for msg in reversed(out):
            for b in reversed(msg["content"]):
                if not marked and not b.get("_volatile") and b.get("type") in ("text", "image", "tool_result",
                                                                                 "tool_use"):
                    b["cache_control"] = self._cache_control()
                    marked = True
                b.pop("_volatile", None)
        return "\n\n".join(s for s in system if s), out

    def chat(self, messages, tools, stream_cb, cancel, temperature, max_tokens):
        system, conv = self._convert(messages)
        payload: dict[str, Any] = {"model": self.model,
                                   "max_tokens": int(max_tokens or self.cfg.get("max_tokens") or 16384),
                                   "messages": conv, "stream": True}
        if system:
            payload["system"] = [{"type": "text", "text": system, "cache_control": self._cache_control()}]
        if tools:
            ts = [{"name": t["name"], "description": t["description"], "input_schema": t["parameters"]} for t in tools]
            ts[-1]["cache_control"] = self._cache_control()
            payload["tools"] = ts
        # Les modèles Claude récents n'acceptent que l'échantillonnage par défaut (et la version 2026-10-21
        # refuse temperature/top_p/top_k) : on ne l'envoie que si tu l'as réglé toi-même dans le modèle.
        if self.cfg.get("temperature") not in (None, "") and "temperature" not in self._dropped:
            payload["temperature"] = float(self.cfg["temperature"])
        if self.cfg.get("effort") and "output_config" not in self._dropped:
            payload["output_config"] = {"effort": str(self.cfg["effort"])}
        url = f"{self.base_url or 'https://api.anthropic.com'}/v1/messages"
        resp = None
        for _ in range(4):
            try:
                resp = _open_stream(url, payload, self._headers(), self.timeout)
                break
            except LLMError as e:
                low = str(e).lower()
                if e.kind != "bad_request":
                    raise
                if "temperature" in payload and "temperature" in low:
                    self._dropped.add("temperature")
                    payload.pop("temperature")
                    continue
                if "output_config" in payload and ("effort" in low or "output_config" in low):
                    self._dropped.add("output_config")
                    payload.pop("output_config")
                    continue
                if self.version != ANTHROPIC_LEGACY_VERSION and ("anthropic-version" in low or "api version" in low):
                    self.version = ANTHROPIC_LEGACY_VERSION
                    continue
                if "workspace" in low:
                    raise LLMError("auth", "ta clé Claude n'est liée à aucun workspace : recrée-la en choisissant un "
                                           "workspace (platform.claude.com → Settings → API keys), ou indique "
                                           f"« workspace_id » dans ce modèle. Détail : {e}") from None
                raise
        if resp is None:
            raise LLMError("bad_request", "requête refusée par l'API Claude")
        vis = VisibleStream(stream_cb)
        blocks: dict[int, dict] = {}
        usage: dict = {}
        stop = ""
        finished = False
        for line in _iter_lines(resp, cancel):
            s = line.strip()
            if not s.startswith("data:"):
                continue
            try:
                ev = json.loads(s[5:])
            except Exception:
                continue
            t = ev.get("type")
            if t == "content_block_start":
                cb = ev.get("content_block") or {}
                blocks[ev.get("index", len(blocks))] = {"type": cb.get("type"), "text": cb.get("text") or "",
                                                         "id": cb.get("id"), "name": cb.get("name"), "json": ""}
                if cb.get("text"):
                    vis.feed(cb["text"])
            elif t == "content_block_delta":
                d = ev.get("delta") or {}
                b = blocks.setdefault(ev.get("index", 0), {"type": "text", "text": "", "json": ""})
                if d.get("type") == "text_delta":
                    b["text"] += d.get("text", "")
                    vis.feed(d.get("text", ""))
                elif d.get("type") == "input_json_delta":
                    b["json"] += d.get("partial_json", "")
            elif t == "message_start":
                usage.update((ev.get("message") or {}).get("usage") or {})
            elif t == "message_delta":
                stop = (ev.get("delta") or {}).get("stop_reason") or stop
                usage.update(ev.get("usage") or {})
            elif t == "error":
                err = ev.get("error") or {}
                kind = "rate_limit" if err.get("type") == "rate_limit_error" else "server"
                raise LLMError(kind, err.get("message", "erreur Anthropic"))
            elif t == "message_stop":
                finished = True
                break
        if not finished and not stop:
            raise LLMError("connection", "connexion coupée au milieu de la réponse de Claude (réponse incomplète)")
        vis.flush()
        text = "".join(b["text"] for _, b in sorted(blocks.items()) if b.get("type") == "text")
        if stop == "refusal" and not text.strip():
            text = "(Le modèle a refusé de traiter cette demande.)"
        calls = []
        for _, b in sorted(blocks.items()):
            if b.get("type") == "tool_use":
                try:
                    args = parse_json_loose(b["json"]) if b["json"].strip() else {}
                except Exception:
                    args = {"_invalid_json": b["json"][:2000]}
                calls.append(ToolCall(b.get("id") or new_call_id(), b.get("name") or "", args))
        return LLMResponse(text=strip_think(text), tool_calls=calls, usage=usage, stop=stop)


class ScriptedProvider(Provider):
    """Modèle simulé pour les tests : rejoue une liste de réponses ou une fonction."""

    def __init__(self, cfg: dict, script: list | Callable | None = None):
        super().__init__(cfg)
        self.script = script if script is not None else []
        self.calls: list[dict] = []
        self._lock = threading.Lock()

    def chat(self, messages, tools, stream_cb, cancel, temperature, max_tokens):
        with self._lock:
            self.calls.append({"messages": messages, "tools": [t["name"] for t in (tools or [])]})
            if callable(self.script):
                r = self.script(messages, tools)
            elif self.script:
                r = self.script.pop(0)
            else:
                r = "OK."
        if isinstance(r, LLMResponse):
            resp = r
        elif isinstance(r, dict):
            resp = LLMResponse(text=r.get("text", ""),
                               tool_calls=[ToolCall(tc.get("id") or new_call_id(), tc["name"], tc.get("arguments", {}))
                                           for tc in r.get("tool_calls", [])])
        else:
            resp = LLMResponse(text=str(r))
        if stream_cb and resp.text:
            vis = VisibleStream(stream_cb)
            for i in range(0, len(resp.text), 12):
                vis.feed(resp.text[i:i + 12])
            vis.flush()
        resp.text = strip_think(resp.text)
        return resp


PROVIDERS = {"openai": OpenAIProvider, "ollama": OllamaProvider, "anthropic": AnthropicProvider}


# --------------------------------------------------------------------------- outils en texte
TEXT_TOOLS_PROMPT = """
# Comment utiliser les outils
Pour appeler un outil, écris EXACTEMENT ce format (JSON valide, guillemets doubles) :
<tool_call>{{"name": "nom_outil", "arguments": {{"parametre": "valeur"}}}}</tool_call>
Tu peux enchaîner plusieurs blocs <tool_call> dans le même message. N'invente jamais un résultat :
attends le message <tool_result>. Quand la tâche est terminée, réponds normalement, sans <tool_call>.

Outils disponibles (* = obligatoire) :
{tools}
"""

TOOL_CALL_RE = re.compile(r"<tool_call>\s*(.*?)\s*(?:</tool_call>|$)", re.S)
FENCE_RE = re.compile(r"```(?:json|tool_call|tool)?\s*(\{.*?\})\s*```", re.S)


def tool_signature(t: dict) -> str:
    props = (t.get("parameters") or {}).get("properties") or {}
    req = set((t.get("parameters") or {}).get("required") or [])
    ps = []
    for k, v in props.items():
        typ = v.get("type", "any")
        if v.get("enum"):
            typ = "|".join(map(str, v["enum"]))
        ps.append(f"{k}{'*' if k in req else ''}: {typ}")
    return f"- {t['name']}({', '.join(ps)}) — {t['description']}"


def to_text_tool_messages(messages: list[dict], tools: list[dict]) -> list[dict]:
    sig = "\n".join(tool_signature(t) for t in tools)
    out: list[dict] = []
    sys_added = False
    for m in messages:
        role = m["role"]
        if role == "system" and not sys_added:
            out.append({"role": "system", "content": content_text(m["content"]) + "\n" +
                        TEXT_TOOLS_PROMPT.format(tools=sig)})
            sys_added = True
            continue
        if role == "assistant" and m.get("tool_calls"):
            txt = content_text(m.get("content"))
            blocks = "".join(f'<tool_call>{json.dumps({"name": tc["name"], "arguments": tc.get("arguments") or {}}, ensure_ascii=False)}</tool_call>'
                             for tc in m["tool_calls"])
            out.append({"role": "assistant", "content": (txt + "\n" if txt else "") + blocks})
            continue
        if role == "tool":
            block = f'<tool_result name="{m.get("name", "")}">\n{content_text(m.get("content"))}\n</tool_result>'
            if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], str) and \
                    out[-1]["content"].startswith("<tool_result"):
                out[-1] = {"role": "user", "content": out[-1]["content"] + "\n" + block}
            else:
                out.append({"role": "user", "content": block})
            continue
        out.append(m)
    if not sys_added:
        out.insert(0, {"role": "system", "content": TEXT_TOOLS_PROMPT.format(tools=sig)})
    return out


def parse_text_tool_calls(text: str, known: set[str]) -> tuple[str, list[ToolCall]]:
    calls: list[ToolCall] = []

    def add(obj: Any, strict: bool) -> bool:
        if not isinstance(obj, dict):
            return False
        name = obj.get("name") or obj.get("tool") or obj.get("function") or obj.get("tool_name")
        if isinstance(name, dict):
            name = name.get("name")
        args = obj.get("arguments", obj.get("args", obj.get("parameters", obj.get("input", {}))))
        if isinstance(args, str):
            try:
                args = parse_json_loose(args)
            except Exception:
                args = {"value": args}
        if not name or (strict and name not in known):
            return False
        calls.append(ToolCall(new_call_id(), str(name), args if isinstance(args, dict) else {"value": args}))
        return True

    for m in TOOL_CALL_RE.finditer(text or ""):
        try:
            obj = parse_json_loose(m.group(1))
        except Exception:
            continue
        if isinstance(obj, list):
            for o in obj:
                add(o, False)
        else:
            add(obj, False)
    clean = TOOL_CALL_RE.sub("", text or "")
    if not calls:
        for m in FENCE_RE.finditer(text or ""):
            try:
                if add(parse_json_loose(m.group(1)), True):
                    clean = clean.replace(m.group(0), "")
            except Exception:
                continue
    if not calls:
        s = (text or "").strip()
        if s.startswith("{") and s.endswith("}"):
            try:
                if add(parse_json_loose(s), True):
                    clean = ""
            except Exception:
                pass
    return strip_think(clean).strip(), calls


# --------------------------------------------------------------------------- routeur
class ModelHandle:
    def __init__(self, cfg: dict, provider: Provider | None = None):
        preset = PRESETS.get(cfg.get("provider", ""), {})
        self.cfg = {**preset, **{k: v for k, v in cfg.items() if v not in (None, "")}}
        self.id = self.cfg.get("id") or self.cfg.get("model") or "modele"
        kind = self.cfg.get("provider", "openai")
        self.provider = provider or PROVIDERS.get(kind, OpenAIProvider)(self.cfg)
        self.tool_mode = self.cfg.get("tool_mode", "auto")
        self.vision = bool(self.cfg.get("vision"))
        self.context = int(self.cfg.get("context") or (16384 if kind == "ollama" else 100000))
        self.cooldown_until = 0.0
        self.last_error = ""
        self.last_kind = ""
        self.last_ok = 0.0
        self.latency = 0.0
        self.is_local = is_local_cfg(self.cfg)
        self.request_limit = request_limit(self.cfg)
        self._lean: Provider | None = None
        self._warm_lock = threading.Lock()
        self.warming = False
        self.warm_key = ""        # consignes du mini-cerveau déjà en mémoire dans le modèle local
        self.warm_until = 0.0
        self.last_warm = 0.0      # durée du dernier préchauffage (secondes)

    # ------------------------------------------------------------------ mini-cerveau local
    def lean_provider(self) -> Provider:
        """Fournisseur du mini-cerveau : pour Ollama, une fenêtre de contexte réduite (chargement plus rapide, moins de
        mémoire) et un modèle gardé en mémoire plus longtemps."""
        if self._lean is None:
            if self.cfg.get("provider") == "ollama":
                self._lean = OllamaProvider({**self.cfg, "context": int(self.cfg.get("mini_context") or MINI_CONTEXT),
                                             "keep_alive": self.cfg.get("mini_keep_alive") or MINI_KEEP_ALIVE})
            else:
                self._lean = self.provider
        return self._lean

    def _keep_seconds(self) -> float:
        v = str(self.cfg.get("mini_keep_alive") or MINI_KEEP_ALIVE).strip().lower()
        m = re.fullmatch(r"(\d+)\s*([smh]?)", v)
        if not m:
            return 1800.0
        return float(m.group(1)) * {"s": 1, "m": 60, "h": 3600, "": 1}[m.group(2)]

    def remember_warm(self, system: str) -> None:
        self.warm_key = _warm_key(system)
        self.warm_until = time.time() + max(60.0, self._keep_seconds() - 60)

    def is_warm(self, system: str) -> bool:
        return self.warm_key == _warm_key(system) and time.time() < self.warm_until

    def warm(self, system: str) -> bool:
        """Préchauffage : charge le modèle local et lui fait lire les consignes du mini-cerveau (une seule fois). La
        vraie demande, qui commence par les mêmes consignes, les reprend ensuite de la mémoire d'Ollama."""
        if self.cfg.get("provider") != "ollama" or not system:
            return False
        with self._warm_lock:
            if self.warming or self.is_warm(system):
                return False
            self.warming = True
        t0 = time.time()
        try:
            prov = self.lean_provider()
            headers = dict(self.cfg.get("headers") or {})
            if prov.api_key:
                headers["Authorization"] = f"Bearer {prov.api_key}"
            payload = {"model": prov.model, "stream": False, "keep_alive": prov.cfg.get("keep_alive"),
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": "Bonjour"}],
                       "options": {"num_ctx": int(prov.cfg.get("context") or MINI_CONTEXT), "num_predict": 1}}
            http_json(f"{prov.base_url}/api/chat", payload, headers, timeout=prov.timeout)
            self.remember_warm(system)
            self.last_warm = round(time.time() - t0, 1)
            log.info("modèle local %s préchauffé en %.0f s", self.id, self.last_warm)
            return True
        except LLMError as e:
            log.info("préchauffage du modèle local %s impossible : %s", self.id, e)
            return False
        finally:
            self.warming = False

    @property
    def label(self) -> str:
        """Nom lisible pour les annonces : « groq (llama-3.3-70b-versatile) »."""
        m = str(self.cfg.get("model") or "")
        return f"{self.id} ({m})" if m and m != self.id else self.id

    def call(self, messages, tools, stream_cb, cancel, temperature, max_tokens, lean: bool = False) -> LLMResponse:
        t0 = time.time()
        if lean:
            resp = self.lean_provider().chat(messages, None, stream_cb, cancel, temperature, max_tokens)
            if messages and messages[0].get("role") == "system":
                self.remember_warm(str(messages[0].get("content") or ""))
        elif tools and self.tool_mode == "text":
            msgs = to_text_tool_messages(messages, tools)
            resp = self.provider.chat(msgs, None, stream_cb, cancel, temperature, max_tokens)
            clean, calls = parse_text_tool_calls(resp.text, {t["name"] for t in tools})
            resp.text, resp.tool_calls = clean, calls
        else:
            resp = self.provider.chat(messages, tools, stream_cb, cancel, temperature, max_tokens)
        self.latency = time.time() - t0
        self.last_ok = time.time()
        self.last_error = ""
        self.last_kind = ""
        resp.model = self.id
        resp.lean = lean
        return resp

    def describe(self) -> dict:
        return {"id": self.id, "provider": self.cfg.get("provider"), "model": self.cfg.get("model"),
                "base_url": self.cfg.get("base_url"), "vision": self.vision, "tool_mode": self.tool_mode,
                "context": self.context, "healthy": time.time() >= self.cooldown_until, "local": self.is_local,
                "last_error": self.last_error, "latency": round(self.latency, 2), "last_ok": self.last_ok,
                "mini_ready": self.is_local and time.time() < self.warm_until}


SLOW_NOTICE = 20.0  # secondes sans un mot d'un modèle en ligne avant de prévenir l'utilisateur

_WHY = {"connection": "injoignable (internet coupé ?)", "timeout": "ne répond plus (connexion lente ?)",
        "rate_limit": "limite de requêtes atteinte", "auth": "clé refusée", "billing": "crédits épuisés",
        "server": "en panne chez le fournisseur", "not_found": "modèle introuvable chez le fournisseur",
        "bad_request": "requête refusée"}


def _why(e: LLMError) -> str:
    return _WHY.get(e.kind, "erreur")


class LLMRouter:
    def __init__(self, config: Any = None, handles: list[ModelHandle] | None = None):
        self.config = config
        self.handles: list[ModelHandle] = handles or []
        self._lock = threading.Lock()
        self.tracker: Any = None  # CostTracker : dépenses et plafond mensuel
        if handles is None:
            self.reload()

    def reload(self) -> None:
        if self.config is None:
            return
        hs = []
        for m in self.config.get("models") or []:
            if not m.get("model") or m.get("enabled") is False:
                continue
            try:
                hs.append(ModelHandle(m))
            except Exception as e:  # noqa: BLE001
                log.warning("modèle %s ignoré : %s", m.get("id"), e)
        with self._lock:
            self.handles = hs

    def available(self) -> bool:
        return bool(self.handles)

    def get(self, mid: str) -> ModelHandle | None:
        for h in self.handles:
            if h.id == mid:
                return h
        return None

    def order(self, purpose: str = "default", need_vision: bool = False) -> list[ModelHandle]:
        r = (self.config.get("routing") if self.config else None) or {}
        ids: list[str] = []
        if need_vision and r.get("vision"):
            ids.append(r["vision"])
        if purpose and r.get(purpose):
            ids.append(r[purpose])
        if r.get("default"):
            ids.append(r["default"])
        ids += list(r.get("fallback") or [])
        ordered: list[ModelHandle] = []
        for i in ids:
            h = self.get(i)
            if h and h not in ordered:
                ordered.append(h)
        for h in self.handles:
            if h not in ordered:
                ordered.append(h)
        if len(ordered) > 1:
            # Le cerveau choisi garde la 1re place. Parmi les secours, les modèles en ligne passent avant les
            # modèles locaux : sans carte graphique, un modèle local met plusieurs minutes à répondre.
            first, rest = ordered[0], ordered[1:]
            ordered = [first] + [h for h in rest if not h.is_local] + [h for h in rest if h.is_local]
        if need_vision:
            ordered.sort(key=lambda h: 0 if h.vision else 1)
        return ordered

    def vision_available(self) -> bool:
        return any(h.vision for h in self.handles)

    def primary(self, purpose: str = "default") -> ModelHandle | None:
        o = self.order(purpose)
        return o[0] if o else None

    def chat(self, messages: list[dict], tools: list[dict] | None = None, purpose: str = "default",
             stream_cb: StreamCB | None = None, cancel: threading.Event | None = None,
             need_vision: bool | None = None, temperature: float | None = None,
             max_tokens: int | None = None, notice_cb: Callable[[str], None] | None = None,
             lean: Callable[[], tuple[list[dict], list[dict] | None]] | None = None) -> LLMResponse:
        """Essaie les modèles dans l'ordre et bascule tout seul en cas de panne.

        notice_cb(texte) reçoit les annonces destinées à l'utilisateur (« Groq ne répond plus, je passe à Claude »,
        « modèle local : plusieurs minutes »). cancel interrompt l'attente tout de suite (bouton Stop).
        lean() fabrique la requête du mini-cerveau (minibrain.build) : quand un modèle local remplace un modèle en
        ligne, il reçoit cette requête légère au lieu de la requête complète."""
        if not self.handles:
            raise LLMError("no_model", "Aucun modèle configuré. Ouvre Réglages → Modèles (ou lance "
                                       "« python zeus.py setup »).")
        if need_vision is None:
            need_vision = has_images(messages)
        errors: list[str] = []
        kinds: list[str] = []
        order = self.order(purpose, need_vision)
        chosen = order[0] if order else None  # cerveau choisi : s'il est local, il reçoit la requête complète
        mini_on = (lean is not None and any(not x.is_local for x in self.handles)
                   and (self.config is None or self.config.get("local.mini", True) is not False))
        lean_box: dict[str, Any] = {}

        def lean_req() -> tuple[list[dict], list[dict] | None] | None:
            if "v" not in lean_box:
                try:
                    lean_box["v"] = lean() if lean else None
                except Exception:  # noqa: BLE001 — sans mini-cerveau, on garde la requête complète
                    log.exception("mini-cerveau")
                    lean_box["v"] = None
            return lean_box["v"]

        def stand_in(x: ModelHandle) -> bool:
            return mini_on and x.is_local and x is not chosen and lean_req() is not None

        def prewarm() -> None:
            """Pendant qu'on attend Groq ou internet, le modèle local se charge et lit ses consignes."""
            for x in order:
                if stand_in(x):
                    req = lean_req()
                    system = str(req[0][0].get("content") or "") if req and req[0] else ""
                    if system and not x.warming and not x.is_warm(system):
                        threading.Thread(target=x.warm, args=(system,), daemon=True,
                                         name=f"prechauffage-{x.id}").start()
                    return

        if self.tracker is not None:
            allowed = [h for h in order if self.tracker.allow(h)]
            if not allowed:
                raise LLMError("budget", self.tracker.blocked_message())
            if len(allowed) < len(order) and self.config is not None and self.config.get("budget.on_limit") == "stop":
                raise LLMError("budget", self.tracker.blocked_message())
            order = allowed

        def notice(text: str) -> None:
            log.info("%s", text)
            if notice_cb:
                try:
                    notice_cb(text)
                except Exception:  # noqa: BLE001 — une annonce ne doit jamais casser l'appel
                    pass

        failed: ModelHandle | None = None  # dernier modèle tombé, pour annoncer la bascule
        failed_why = ""
        waited_online = False
        waited_net = False
        while True:
            restart = False
            for n, h in enumerate(order):
                last = n == len(order) - 1
                # Un modèle en ligne tombé pour « injoignable » (échec instantané) est réessayé plutôt que de laisser
                # la main au modèle local, très lent : après une micro-coupure d'internet, on retrouve Groq/Claude
                # tout de suite. Un modèle tombé pour délai dépassé (échec lent) reste en pause.
                only_local_left = all(x.is_local or time.time() < x.cooldown_until for x in order[n + 1:])
                retry_now = not h.is_local and h.last_kind == "connection" and only_local_left
                if time.time() < h.cooldown_until and not last and not retry_now:
                    errors.append(f"{h.id} : en pause après une erreur ({h.last_error[:80]})")
                    kinds.append("cooldown")
                    continue
                # Avant de passer au modèle local (plusieurs minutes sans carte graphique) : si un modèle en ligne
                # n'est en pause que pour une limite de débit qui se lève dans moins d'une minute (Groq gratuit :
                # jetons par minute), mieux vaut attendre ces secondes et le reprendre. Une seule fois par demande.
                if h.is_local and n > 0 and not waited_online:
                    soon = [x for x in order[:n] if not x.is_local and x.last_kind == "rate_limit"
                            and 0 < x.cooldown_until - time.time() <= RATE_WAIT_BEFORE_LOCAL]
                    if soon:
                        x = min(soon, key=lambda m: m.cooldown_until)
                        wait = x.cooldown_until - time.time() + 0.5
                        prewarm()
                        notice(f"⏳ {x.label} : limite de débit atteinte, je reprends dans {round(wait)} s "
                               "(bien plus rapide que le modèle local).")
                        if self._sleep(wait, cancel):
                            raise LLMError("cancelled", "annulé") from None
                        waited_online = True
                        failed = None
                        for m in soon:
                            m.cooldown_until = 0.0
                        restart = True
                        break
                # Internet coupé : on guette son retour un moment plutôt que de partir sur le modèle local.
                if h.is_local and n > 0 and not waited_net:
                    cut = [x for x in order[:n] if not x.is_local and x.last_kind == "connection"]
                    if cut:
                        waited_net = True
                        prewarm()
                        notice(f"📶 {cut[0].label} injoignable (internet coupé ?). J'attends le retour de la connexion "
                               f"({int(INTERNET_WAIT_BEFORE_LOCAL)} s au plus) avant le modèle local, bien plus lent.")
                        deadline = time.time() + INTERNET_WAIT_BEFORE_LOCAL
                        back = False
                        while time.time() < deadline:
                            if any(_reachable(str(x.cfg.get("base_url") or "")) for x in cut):
                                back = True
                                break
                            if self._sleep(5.0, cancel):
                                raise LLMError("cancelled", "annulé") from None
                        if back:
                            notice("📶 Connexion revenue, je reprends.")
                            failed = None
                            for m in cut:
                                m.cooldown_until = 0.0
                            restart = True
                            break
                if failed is not None:
                    notice(f"⚠️ {failed.label} : {failed_why}. Je passe à {h.label}.")
                    failed = None
                use_lean = stand_in(h)
                if use_lean:
                    req = lean_req() or ([], None)
                    ready = bool(req[0]) and h.is_warm(str(req[0][0].get("content") or ""))
                    notice(f"🧠 Mini-cerveau local ({h.cfg.get('model') or h.id}) en attendant le cerveau en ligne : "
                           "réponse courte, sans internet ni outils. " +
                           ("Il est déjà chargé." if ready else "La première réponse peut prendre une à deux minutes, "
                                                                "le temps de le charger ; les suivantes sont plus rapides.")
                           + " Tu peux arrêter avec ⏹️.")
                elif h.is_local and n > 0:
                    notice(f"🐢 Bascule sur le modèle local ({h.cfg.get('model') or h.id}) : sans carte graphique, la première réponse peut "
                           "prendre plusieurs minutes. Tu peux arrêter avec ⏹️.")
                msgs = messages if (h.vision or not need_vision) else strip_images(messages)
                call_tools, call_max = tools, max_tokens
                if use_lean:
                    msgs, call_tools = lean_req() or (msgs, tools)
                    call_max = min(max_tokens or MINI_MAX_TOKENS, MINI_MAX_TOKENS)
                attempt = 0
                while attempt < 3:
                    attempt += 1
                    try:
                        if n > 0 or attempt > 1:
                            if stream_cb:
                                stream_cb(None)  # signale à l'interface d'effacer le texte partiel
                        resp = self._call(h, msgs, call_tools, stream_cb, cancel, temperature, call_max, notice,
                                          lean=use_lean)
                        if self.tracker is not None:
                            try:
                                resp.cost = self.tracker.record(h, resp.usage, purpose)
                            except Exception as e:  # noqa: BLE001
                                log.warning("compteur de dépenses : %s", e)
                        return resp
                    except LLMError as e:
                        h.last_error = str(e)
                        h.last_kind = e.kind
                        log.warning("modèle %s : %s", h.id, e)
                        if e.kind == "cancelled":
                            raise
                        if e.kind == "tools_unsupported" and call_tools and h.tool_mode != "text":
                            h.tool_mode = "text"
                            attempt -= 1
                            continue
                        if e.kind == "context_length":
                            if n == 0 or last:
                                raise  # l'agent résume la conversation et recommence
                            # modèle de secours à petite fenêtre (Cerebras gratuit : 8 000 jetons) : on passe au suivant
                            h.cooldown_until = time.time() + 5
                            errors.append(f"{h.id} : {e}")
                            kinds.append(e.kind + (":local" if h.is_local else ""))
                            failed, failed_why = h, "conversation trop longue pour lui"
                            break
                        if e.kind == "rate_limit" and attempt < 3:
                            wait = e.retry_after if e.retry_after is not None else 2.0 * attempt
                            # Limite de débit courte (Groq gratuit : jetons par minute) alors qu'il ne reste que le modèle
                            # local, qui met plusieurs minutes : mieux vaut attendre ces secondes et réessayer (une fois).
                            rest_local = all(x.is_local or time.time() < x.cooldown_until for x in order[n + 1:])
                            patient = (not last and not h.is_local and rest_local and attempt == 1
                                       and wait <= RATE_WAIT_BEFORE_LOCAL)
                            if wait <= 5 or last or patient:
                                if patient:
                                    prewarm()
                                    notice(f"⏳ {h.label} : limite de débit atteinte, je réessaie dans {round(wait)} s "
                                           "(plus rapide que le modèle local).")
                                # attente courte, ou plus aucun autre modèle : on patiente (au plus 20 s)
                                if self._sleep(min(wait + (0.5 if patient else 0), RATE_WAIT_BEFORE_LOCAL if patient else 20),
                                               cancel):
                                    raise LLMError("cancelled", "annulé") from None
                                continue
                            # longue attente annoncée et un autre modèle est là : on le prend tout de suite
                            h.cooldown_until = time.time() + min(wait, 600)
                            errors.append(f"{h.id} : {e}")
                            kinds.append(e.kind + (":local" if h.is_local else ""))
                            failed, failed_why = h, _why(e)
                            break
                        # 5xx passager : un 2e essai. Délai dépassé : inutile de ré-attendre si un autre modèle existe.
                        retry = (e.kind == "server" or (e.kind == "timeout" and last and not h.is_local)) and attempt < 2
                        if retry:
                            if self._sleep(1.5, cancel):
                                raise LLMError("cancelled", "annulé") from None
                            continue
                        h.cooldown_until = time.time() + (600 if e.kind == "billing" else
                                                          45 if e.kind in ("connection", "server", "timeout", "auth")
                                                          else 5)
                        errors.append(f"{h.id} : {e}")
                        kinds.append(e.kind + (":local" if h.is_local else ""))
                        failed, failed_why = h, _why(e)
                        break
                    except Exception as e:  # noqa: BLE001 — bug réseau inattendu : on bascule
                        h.last_error = str(e)
                        log.exception("modèle %s : erreur inattendue", h.id)
                        errors.append(f"{h.id} : {e}")
                        kinds.append("unexpected")
                        h.cooldown_until = time.time() + 20
                        failed, failed_why = h, "erreur inattendue"
                        break
            if not restart:
                break
        raise LLMError("all_failed", "Aucun modèle n'a pu répondre :\n- " + "\n- ".join(errors), kinds=kinds)

    @staticmethod
    def _sleep(seconds: float, cancel: threading.Event | None) -> bool:
        """Attend ; renvoie True si l'utilisateur a demandé l'arrêt entre-temps."""
        if cancel is None:
            time.sleep(seconds)
            return False
        return cancel.wait(seconds)

    @staticmethod
    def _call(h: ModelHandle, msgs, tools, stream_cb, cancel, temperature, max_tokens,
              notice: Callable[[str], None], lean: bool = False) -> LLMResponse:
        """Appelle le modèle dans un fil à part pour que ⏹️ Stop agisse tout de suite, même pendant les minutes où un
        modèle local lit les consignes sans rien envoyer. Prévient aussi quand un modèle en ligne tarde."""
        alive = threading.Event()
        alive.set()
        box: dict[str, Any] = {}

        def cb(delta: str | None) -> None:
            if stream_cb and alive.is_set():
                stream_cb(delta)

        def work() -> None:
            try:
                box["resp"] = (h.call(msgs, tools, cb, cancel, temperature, max_tokens, lean=True) if lean else
                               h.call(msgs, tools, cb, cancel, temperature, max_tokens))
            except BaseException as e:  # noqa: BLE001 — renvoyé au fil appelant
                box["err"] = e

        t = threading.Thread(target=work, name=f"llm-{h.id}", daemon=True)
        t0 = time.time()
        t.start()
        warned = False
        try:
            while t.is_alive():
                t.join(0.2)
                if cancel is not None and cancel.is_set() and t.is_alive():
                    alive.clear()  # le fil finira seul (délai ou fin de réponse) ; on n'affiche plus rien de lui
                    raise LLMError("cancelled", "annulé")
                if not warned and not h.is_local and time.time() - _ACTIVITY.get(t.ident or 0, t0) > SLOW_NOTICE:
                    warned = True
                    notice(f"⏳ {h.label} tarde à répondre (connexion lente ?). J'attends encore un peu, puis je "
                           "passerai à un autre modèle s'il y en a un.")
        finally:
            _ACTIVITY.pop(t.ident or 0, None)
        if "err" in box:
            raise box["err"]
        return box["resp"]

    def test(self, mid: str) -> dict:
        h = self.get(mid)
        if not h:
            return {"ok": False, "error": "modèle inconnu"}
        t0 = time.time()
        try:
            r = h.call([{"role": "system", "content": "Tu es un test de connexion."},
                        {"role": "user", "content": "Réponds seulement : OK"}], None, None, None, 0, 20)
            return {"ok": True, "latency": round(time.time() - t0, 2), "reply": r.text[:200]}
        except LLMError as e:
            return {"ok": False, "error": str(e)}


# --------------------------------------------------------------------------- préréglages
CLAUDE_MAX = {
    "claude": ("claude-opus-5-5", "Cerveau principal : Claude Opus 5.5"),
    "claude-max": ("claude-fable-5-1", "Mode maximum : Claude Fable 5.1"),
    "claude-rapide": ("claude-haiku-5-5", "Tâches de fond : Claude Haiku 5.5"),
}


def apply_claude_preset(config: Any, api_key: str, workspace_id: str = "", budget: float | None = None) -> list[str]:
    """« Puissance maximale » : Opus 5.5 principal (voit les images), Fable 5.1 en mode maximum, Haiku 5.5 pour
    les tâches de fond ; les modèles locaux déjà branchés restent en secours."""
    keep = [m for m in (config.get("models") or []) if m.get("id") not in CLAUDE_MAX]
    new = []
    for mid, (model, _) in CLAUDE_MAX.items():
        m: dict[str, Any] = {"id": mid, "provider": "anthropic", "base_url": "https://api.anthropic.com",
                             "model": model, "api_key": api_key, "vision": True, "context": 200000}
        if workspace_id:
            m["workspace_id"] = workspace_id
        new.append(m)
    config.set("models", new + keep, save=False)
    local = [m["id"] for m in keep if m.get("provider") in ("ollama", "lmstudio", "llamacpp")]
    groq = [m["id"] for m in keep if m.get("id") in ("groq", "groq-rapide") or m.get("provider") == "openai" and "groq" in (m.get("base_url") or "")]
    if groq:
        # Priorité 1 : Groq → Claude → Ollama (les modèles locaux) quand un service tombe.
        config.set("routing", {"default": groq[0], "fast": groq[-1], "vision": "claude", "max": "claude-max",
                               "fallback": [x for x in [groq[-1], "claude", "claude-rapide"] + local if x != groq[0]]}, save=False)
    else:
        config.set("routing", {"default": "claude", "fast": "claude-rapide", "vision": "claude", "max": "claude-max",
                               "fallback": ["claude-rapide"] + local}, save=False)
    if int(config.get("agent.context_tokens") or 0) < 100000:
        config.set("agent.context_tokens", 100000, save=False)  # le cache rend les longues conversations abordables
    if budget is not None:
        config.set("budget.monthly_usd", max(0.0, float(budget)), save=False)
    config.save()
    return [m["id"] for m in new]


GROQ_BASE = "https://api.groq.com/openai/v1"
# Ordre de préférence ; si aucun n'existe plus, ZEUS prend le plus gros modèle de texte proposé par Groq.
GROQ_PREFS = ["openai/gpt-oss-120b", "moonshotai/kimi-k2-instruct", "llama-3.3-70b-versatile", "qwen/qwen3-32b",
              "openai/gpt-oss-20b", "llama-3.1-8b-instant"]
GROQ_FAST_PREFS = ["llama-3.1-8b-instant", "openai/gpt-oss-20b", "qwen/qwen3-32b"]


def pick_model(available: list[str], prefs: list[str]) -> str:
    for p in prefs:
        if p in available:
            return p
    text = [m for m in available if not re.search(r"whisper|guard|tts|playai|distil|embed|orpheus|compound", m, re.I)]

    def size(m: str) -> int:
        found = re.findall(r"(\d+)b\b", m.lower())
        return int(found[-1]) if found else 0
    return max(text, key=size) if text else ""


def apply_groq_preset(config: Any, api_key: str, available: list[str] | None = None) -> dict:
    """« Rapide et gratuit » : Groq devient le cerveau (le meilleur modèle disponible avec la clé) et la voix
    (Whisper). Si Claude est déjà branché, il reste le cerveau principal et Groq passe en secours."""
    from .config import Config
    available = available if available is not None else list_openai_models(GROQ_BASE, Config.secret(api_key))
    if not available:
        raise LLMError("auth", "clé Groq refusée, ou Groq injoignable (vérifie la clé et ta connexion)")
    main = pick_model(available, GROQ_PREFS)
    fast = pick_model(available, GROQ_FAST_PREFS) or main
    keep = [m for m in (config.get("models") or []) if m.get("id") not in ("groq", "groq-rapide")]
    new = [{"id": "groq", "provider": "openai", "base_url": GROQ_BASE, "model": main, "api_key": api_key,
            "context": 32000}]
    if fast != main:
        new.append({"id": "groq-rapide", "provider": "openai", "base_url": GROQ_BASE, "model": fast,
                    "api_key": api_key, "context": 32000})
    config.set("models", new + keep, save=False)
    routing = dict(config.get("routing") or {})
    fast_id = new[-1]["id"]
    local = [m["id"] for m in keep if m.get("provider") in ("ollama", "lmstudio", "llamacpp")]
    claude = [m["id"] for m in keep if m.get("provider") == "anthropic"]
    if claude:
        # Priorité 1 : Groq (rapide/gratuit) → Claude → modèles locaux (Ollama) en secours automatique.
        routing.update({"default": "groq", "fast": fast_id, "vision": claude[0], "max": routing.get("max") or "claude-max",
                        "fallback": [x for x in [fast_id, claude[0]] + claude[1:] + local if x != "groq"]})
    else:
        routing.update({"default": "groq", "fast": fast_id,
                        "fallback": [x for x in [fast_id] + local if x != "groq"]})
    config.set("routing", routing, save=False)
    if not (config.get("voice.stt") or {}).get("base_url"):
        config.set("voice.stt", {"base_url": GROQ_BASE, "api_key": api_key, "model": "whisper-large-v3-turbo"},
                   save=False)
    config.save()
    return {"models": [m["id"] for m in new], "main": main, "fast": fast}


# --------------------------------------------------------------------------- 2e cerveau en ligne gratuit
# Un second fournisseur gratuit, placé juste après Groq : quand Groq atteint sa limite du jour (200 000 jetons par
# modèle), ZEUS continue en ligne au lieu de passer au modèle local. Les limites gratuites changent souvent : ZEUS
# choisit le modèle parmi ceux que la clé propose réellement.
FREE_PROVIDERS: dict[str, dict[str, Any]] = {
    "cerebras": {"label": "Cerebras", "base_url": "https://api.cerebras.ai/v1", "vision": False, "context": 8192,
                 "prefs": ["gpt-oss-120b", "llama-3.3-70b", "qwen-3-235b-a22b-instruct-2507", "qwen-3-32b"],
                 "signup": "cloud.cerebras.ai → API Keys",
                 "about": "environ 1 million de jetons gratuits par jour (5 fois Groq), très rapide ; ne voit pas les images"},
    "gemini": {"label": "Google Gemini", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
               "vision": True, "context": 32000, "prefs": [],
               "signup": "aistudio.google.com/apikey",
               "about": "quelques centaines de requêtes gratuites par jour ; voit les images (captures, photos)"},
}
_FREE_SKIP = re.compile(r"embed|tts|image|imagen|veo|live|audio|aqa|learnlm|gemma|guard|whisper|robotics|computer-use"
                        r"|thinking|exp(?:erimental)?\b|-exp-", re.I)


def _version(mid: str) -> tuple:
    m = re.search(r"(\d+(?:\.\d+)?)", mid)
    return (float(m.group(1)) if m else 0.0,)


def pick_free_model(provider: str, available: list[str]) -> str:
    ids = [a.split("/", 1)[1] if a.startswith("models/") else a for a in available]
    ids = [m for m in ids if m and not _FREE_SKIP.search(m)]
    prefs = FREE_PROVIDERS.get(provider, {}).get("prefs") or []
    for p in prefs:
        if p in ids:
            return p
    if provider == "gemini":
        # Flash-Lite : la plus grande quantité de requêtes gratuites par jour, appels d'outils et images compris.
        for want in ("flash-lite", "flash"):
            cands = [m for m in ids if want in m and "preview" not in m] or [m for m in ids if want in m]
            if want == "flash":
                cands = [m for m in cands if "lite" not in m] or cands
            if cands:
                return max(cands, key=lambda m: (_version(m), "latest" in m, -len(m)))
        return ""
    return pick_model(ids, prefs)


def apply_free_preset(config: Any, provider: str, api_key: str, available: list[str] | None = None) -> dict:
    """Branche Cerebras ou Gemini comme 2e cerveau en ligne gratuit, juste après Groq dans l'ordre de secours."""
    from .config import Config
    info = FREE_PROVIDERS.get(provider)
    if not info:
        raise LLMError("bad_request", f"fournisseur inconnu : {provider} ({', '.join(FREE_PROVIDERS)})")
    base = info["base_url"]
    if available is None:
        available = list_openai_models(base, Config.secret(api_key))
    if not available:
        raise LLMError("auth", f"clé {info['label']} refusée, ou {info['label']} injoignable (vérifie la clé et ta "
                               "connexion)")
    model = pick_free_model(provider, available)
    if not model:
        raise LLMError("not_found", f"aucun modèle de discussion utilisable chez {info['label']} avec cette clé")
    entry = {"id": provider, "provider": "openai", "base_url": base, "model": model, "api_key": api_key,
             "context": info["context"], "vision": info["vision"]}
    models = [m for m in (config.get("models") or []) if m.get("id") != provider]
    online = [m for m in models if not is_local_cfg(m)]
    local = [m for m in models if is_local_cfg(m)]
    config.set("models", online + [entry] + local, save=False)
    routing = dict(config.get("routing") or {})
    fb = [x for x in (routing.get("fallback") or []) if x != provider]
    after_groq = max((i + 1 for i, x in enumerate(fb) if str(x).startswith("groq")), default=0)
    fb.insert(after_groq, provider)
    routing["fallback"] = fb
    if not routing.get("default"):
        routing["default"] = provider
    if info["vision"] and not routing.get("vision"):
        routing["vision"] = provider
    config.set("routing", routing, save=False)
    config.save()
    return {"id": provider, "label": info["label"], "model": model, "vision": info["vision"]}


# --------------------------------------------------------------------------- découverte
def list_ollama_models(base_url: str = "http://localhost:11434", timeout: float = 4) -> list[dict]:
    try:
        j = http_json(f"{base_url.rstrip('/')}/api/tags", timeout=timeout)
    except LLMError:
        return []
    out = []
    for m in j.get("models") or []:
        det = m.get("details") or {}
        out.append({"name": m.get("name"), "size": m.get("size"), "family": det.get("family"),
                    "params": det.get("parameter_size")})
    return out


def list_openai_models(base_url: str, api_key: str = "", timeout: float = 8) -> list[str]:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        j = http_json(f"{base_url.rstrip('/')}/models", headers=headers, timeout=timeout)
    except LLMError:
        return []
    return sorted(m.get("id", "") for m in (j.get("data") or []) if m.get("id"))
