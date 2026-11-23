"""Pont d'outils : un script lancé par ZEUS (run_python) appelle les outils de ZEUS en une ligne.

    from zeus_outils import outil
    ecran = outil("phone_screen")
    for nom in ("Maman", "Patrick"):
        outil("phone_send_whatsapp", to=nom, message="Bonne fête !")

Chaque appel passe par les mêmes garde-fous qu'un appel de l'agent (niveau de risque, validation, journal).
Serveur HTTP local (127.0.0.1, port aléatoire), jeton unique par script, révoqué à la fin du script.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .tools import ToolResult
from .util import log

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

CLIENT_DIR = Path(__file__).resolve().parent / "bridge_client"
# outils réservés à la boucle de l'agent (ou qui n'ont pas de sens depuis un script)
BLOCKED = {"run_python", "delegate", "update_plan", "enable_tools"}


class _Handler(BaseHTTPRequestHandler):
    bridge: "ToolBridge"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:  # silence
        pass

    def _send(self, code: int, obj: dict) -> None:
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _entry(self) -> dict | None:
        ent = self.bridge.lookup(self.headers.get("X-Zeus-Token") or "")
        if ent is None:
            self._send(403, {"error": "jeton invalide ou expiré : zeus_outils ne marche que pendant un script "
                                      "lancé par ZEUS"})
        return ent

    def do_GET(self) -> None:  # noqa: N802
        ent = self._entry()
        if ent is None:
            return
        if self.path.rstrip("/") == "/outils":
            self._send(200, {"tools": self.bridge.list_tools(ent)})
        else:
            self._send(404, {"error": "chemin inconnu"})

    def do_POST(self) -> None:  # noqa: N802
        ent = self._entry()
        if ent is None:
            return
        n = int(self.headers.get("Content-Length") or 0)
        if n > 8_000_000:
            self._send(413, {"error": "requête trop grosse"})
            return
        try:
            payload = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except (ValueError, UnicodeDecodeError):
            self._send(400, {"error": "JSON invalide"})
            return
        if self.path.rstrip("/") != "/outil":
            self._send(404, {"error": "chemin inconnu"})
            return
        name = str(payload.get("tool") or "").strip()
        args = payload.get("args") or {}
        if not name or not isinstance(args, dict):
            self._send(400, {"error": "attendu : {\"tool\": nom, \"args\": {…}}"})
            return
        res = self.bridge.call(ent, name, args)
        self._send(200, {"ok": not res.error, "text": res.text, "images": res.images, "files": res.files,
                         "data": res.data})


class ToolBridge:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self._tokens: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._server: ThreadingHTTPServer | None = None
        self.port = 0
        self.calls = 0

    # ------------------------------------------------------------------ serveur
    def ensure(self) -> int:
        with self._lock:
            if self._server is not None:
                return self.port
            handler = type("PontHandler", (_Handler,), {"bridge": self})
            srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            srv.daemon_threads = True
            self._server = srv
            self.port = srv.server_address[1]
            threading.Thread(target=srv.serve_forever, daemon=True, name="pont-outils").start()
            log.debug("pont d'outils sur 127.0.0.1:%s", self.port)
            return self.port

    def stop(self) -> None:
        with self._lock:
            srv, self._server = self._server, None
            self._tokens.clear()
        if srv is not None:
            try:
                srv.shutdown()
                srv.server_close()
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------------ jetons
    def issue(self, session: dict, run: Any = None, ttl: float = 900) -> str:
        tok = secrets.token_urlsafe(24)
        with self._lock:
            now = time.time()
            self._tokens = {k: v for k, v in self._tokens.items() if v["expires"] > now}
            self._tokens[tok] = {"session_id": session.get("id"), "session": session, "run": run,
                                 "expires": now + max(30.0, float(ttl))}
        return tok

    def revoke(self, token: str) -> None:
        with self._lock:
            self._tokens.pop(token, None)

    def lookup(self, token: str) -> dict | None:
        if not token:
            return None
        with self._lock:
            ent = self._tokens.get(token)
            if ent and ent["expires"] < time.time():
                self._tokens.pop(token, None)
                return None
            return ent

    def env(self, token: str, base: dict | None = None) -> dict[str, str]:
        base = base if base is not None else dict(os.environ)
        pp = base.get("PYTHONPATH", "")
        return {"ZEUS_BRIDGE_URL": f"http://127.0.0.1:{self.port}", "ZEUS_BRIDGE_TOKEN": token,
                "PYTHONPATH": str(CLIENT_DIR) + (os.pathsep + pp if pp else "")}

    # ------------------------------------------------------------------ appels
    def _session(self, ent: dict) -> dict:
        return self.zeus.db.get_session(ent["session_id"]) or ent["session"]

    def list_tools(self, ent: dict) -> list[dict]:
        trust = self._session(ent).get("trust", "owner")
        out = []
        for t in self.zeus.registry.tools.values():
            if t.name in BLOCKED or not (trust in t.trust or (trust == "system" and "owner" in t.trust)):
                continue
            out.append({"name": t.name, "description": t.description, "toolset": t.toolset,
                        "parameters": t.parameters})
        return sorted(out, key=lambda x: (x["toolset"], x["name"]))

    def call(self, ent: dict, name: str, args: dict) -> ToolResult:
        if name in BLOCKED:
            return ToolResult.err(f"« {name} » ne peut pas être appelé depuis un script.")
        self.calls += 1
        try:
            return self.zeus.agent.call_tool(self._session(ent), name, args, run=ent.get("run"), origin="script")
        except Exception as e:  # noqa: BLE001
            log.exception("pont d'outils")
            return ToolResult.err(f"{type(e).__name__} : {e}")

    def status(self) -> dict:
        with self._lock:
            return {"active": self._server is not None, "port": self.port, "scripts": len(self._tokens),
                    "calls": self.calls}
