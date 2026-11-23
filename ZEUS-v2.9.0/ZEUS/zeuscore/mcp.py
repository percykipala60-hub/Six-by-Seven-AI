"""Client MCP (Model Context Protocol) : branche ZEUS sur n'importe quel serveur MCP
(stdio ou HTTP « streamable ») — Google Drive, GitHub, bases de données, navigateur…"""

from __future__ import annotations

import base64
import itertools
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, Any

from . import __version__
from .tools import Tool, ToolContext, ToolResult
from .util import IS_WINDOWS, log, truncate, wrap_untrusted

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

PROTOCOL = "2025-06-18"


class MCPError(Exception):
    pass


class MCPClient:
    def __init__(self, name: str, cfg: dict):
        self.name = name
        self.cfg = cfg
        self.proc: subprocess.Popen | None = None
        self._ids = itertools.count(1)
        self._pending: dict[int, queue.Queue] = {}
        self._lock = threading.Lock()
        self.session_id = ""
        self.server_info: dict = {}
        self.stderr_tail: list[str] = []
        self.http = bool(cfg.get("url"))

    # ------------------------------------------------------------------ transport stdio
    def start(self) -> None:
        if self.http:
            self.initialize()
            return
        cmd = self.cfg.get("command")
        if not cmd:
            raise MCPError("« command » manquant")
        exe = shutil.which(cmd) or cmd
        args = [exe] + [os.path.expanduser(str(a)) for a in self.cfg.get("args") or []]
        env = {**os.environ, **{k: str(v) for k, v in (self.cfg.get("env") or {}).items()}}
        kw: dict[str, Any] = {"creationflags": 0x08000000} if IS_WINDOWS else {"start_new_session": True}
        self.proc = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     env=env, cwd=self.cfg.get("cwd") or None, **kw)
        threading.Thread(target=self._reader, daemon=True, name=f"mcp-{self.name}").start()
        threading.Thread(target=self._err_reader, daemon=True, name=f"mcp-{self.name}-err").start()
        self.initialize()

    def _reader(self) -> None:
        assert self.proc and self.proc.stdout
        for raw in self.proc.stdout:
            line = raw.decode("utf-8", "replace").strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except Exception:
                continue
            self._dispatch(msg)
        with self._lock:
            for q in self._pending.values():
                q.put({"error": {"message": "le serveur MCP s'est arrêté"}})

    def _err_reader(self) -> None:
        assert self.proc and self.proc.stderr
        for raw in self.proc.stderr:
            self.stderr_tail.append(raw.decode("utf-8", "replace").rstrip())
            self.stderr_tail = self.stderr_tail[-20:]

    def _dispatch(self, msg: dict) -> None:
        if "id" in msg and ("result" in msg or "error" in msg) and "method" not in msg:
            with self._lock:
                q = self._pending.pop(msg["id"], None)
            if q:
                q.put(msg)
            return
        if "method" in msg and "id" in msg:  # requête du serveur
            method = msg["method"]
            if method == "ping":
                self._send({"jsonrpc": "2.0", "id": msg["id"], "result": {}})
            elif method == "roots/list":
                self._send({"jsonrpc": "2.0", "id": msg["id"], "result": {"roots": []}})
            else:
                self._send({"jsonrpc": "2.0", "id": msg["id"],
                            "error": {"code": -32601, "message": f"non pris en charge : {method}"}})

    def _send(self, obj: dict) -> None:
        if not self.proc or not self.proc.stdin:
            raise MCPError("serveur non démarré")
        data = (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")
        with self._lock:
            self.proc.stdin.write(data)
            self.proc.stdin.flush()

    # ------------------------------------------------------------------ transport HTTP
    def _http(self, obj: dict, timeout: float) -> dict | None:
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
                   "MCP-Protocol-Version": PROTOCOL, **(self.cfg.get("headers") or {})}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        from .config import Config
        for k, v in list(headers.items()):
            headers[k] = Config.secret(v)
        req = urllib.request.Request(self.cfg["url"], data=json.dumps(obj).encode(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                sid = r.headers.get("Mcp-Session-Id")
                if sid:
                    self.session_id = sid
                ctype = (r.headers.get("Content-Type") or "").lower()
                if "id" not in obj:
                    return None
                if "text/event-stream" in ctype:
                    for raw in r:
                        line = raw.decode("utf-8", "replace").strip()
                        if line.startswith("data:"):
                            try:
                                msg = json.loads(line[5:].strip())
                            except Exception:
                                continue
                            if msg.get("id") == obj["id"]:
                                return msg
                    raise MCPError("flux terminé sans réponse")
                body = r.read().decode("utf-8", "replace")
                return json.loads(body) if body.strip() else None
        except urllib.error.HTTPError as e:
            raise MCPError(f"HTTP {e.code} : {e.read()[:300].decode('utf-8', 'replace')}") from None
        except urllib.error.URLError as e:
            raise MCPError(f"injoignable : {e.reason}") from None

    # ------------------------------------------------------------------ JSON-RPC
    def request(self, method: str, params: dict | None = None, timeout: float = 60) -> Any:
        mid = next(self._ids)
        obj = {"jsonrpc": "2.0", "id": mid, "method": method, "params": params or {}}
        if self.http:
            msg = self._http(obj, timeout) or {}
        else:
            q: queue.Queue = queue.Queue()
            with self._lock:
                self._pending[mid] = q
            self._send(obj)
            try:
                msg = q.get(timeout=timeout)
            except queue.Empty:
                with self._lock:
                    self._pending.pop(mid, None)
                raise MCPError(f"{method} : délai dépassé") from None
        if msg.get("error"):
            raise MCPError(str(msg["error"].get("message") or msg["error"]))
        return msg.get("result")

    def notify(self, method: str, params: dict | None = None) -> None:
        obj = {"jsonrpc": "2.0", "method": method, "params": params or {}}
        if self.http:
            try:
                self._http(obj, 15)
            except MCPError:
                pass
        else:
            self._send(obj)

    def initialize(self) -> None:
        res = self.request("initialize", {"protocolVersion": PROTOCOL, "capabilities": {"roots": {"listChanged": False}},
                                          "clientInfo": {"name": "zeus", "version": __version__}}, timeout=60)
        self.server_info = (res or {}).get("serverInfo") or {}
        self.notify("notifications/initialized")

    def list_tools(self) -> list[dict]:
        tools, cursor = [], None
        for _ in range(20):
            res = self.request("tools/list", {"cursor": cursor} if cursor else {}) or {}
            tools += res.get("tools") or []
            cursor = res.get("nextCursor")
            if not cursor:
                break
        return tools

    def call_tool(self, name: str, args: dict, timeout: float = 180) -> dict:
        return self.request("tools/call", {"name": name, "arguments": args}, timeout=timeout) or {}

    def alive(self) -> bool:
        return self.http or (self.proc is not None and self.proc.poll() is None)

    def close(self) -> None:
        if not self.proc:
            return
        if self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=3)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
        for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
            try:
                if stream:
                    stream.close()
            except Exception:
                pass


def _tool_name(server: str, tool: str) -> str:
    n = re.sub(r"[^a-zA-Z0-9_]", "_", f"mcp_{server}_{tool}")
    return n[:64]


class MCPManager:
    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self.clients: dict[str, MCPClient] = {}
        self.errors: dict[str, str] = {}
        self.tool_counts: dict[str, int] = {}
        self._lock = threading.Lock()

    def start(self) -> None:
        for name, cfg in (self.zeus.config.get("mcp_servers") or {}).items():
            if cfg.get("enabled") is False:
                continue
            self.connect(name, cfg)

    def connect(self, name: str, cfg: dict) -> bool:
        self.disconnect(name)
        c = MCPClient(name, cfg)
        try:
            c.start()
            tools = c.list_tools()
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if c.stderr_tail:
                msg += " — " + " | ".join(c.stderr_tail[-3:])
            self.errors[name] = msg
            log.warning("MCP %s : %s", name, msg)
            c.close()
            return False
        with self._lock:
            self.clients[name] = c
            self.errors.pop(name, None)
        risk = cfg.get("trust") or cfg.get("risk") or "external"
        risk = {"read": "read", "lecture": "read", "write": "write"}.get(risk, risk)
        for t in tools:
            self._register(name, c, t, risk)
        self.tool_counts[name] = len(tools)
        self.zeus.bus.publish("mcp_connected", server=name, tools=len(tools))
        return True

    def _register(self, server: str, client: MCPClient, t: dict, risk: str) -> None:
        schema = t.get("inputSchema") or {"type": "object", "properties": {}}
        if schema.get("type") != "object":
            schema = {"type": "object", "properties": {"value": schema}}
        schema.setdefault("properties", {})
        original = t["name"]

        def run(ctx: ToolContext, **kwargs: Any) -> ToolResult:
            if not client.alive():
                return ToolResult.err(f"serveur MCP « {server} » arrêté")
            try:
                res = client.call_tool(original, kwargs)
            except MCPError as e:
                return ToolResult.err(str(e))
            texts, images = [], []
            for part in res.get("content") or []:
                typ = part.get("type")
                if typ == "text":
                    texts.append(part.get("text", ""))
                elif typ == "image" and part.get("data"):
                    d = ctx.cfg.dir("mcp")
                    ext = (part.get("mimeType") or "image/png").split("/")[-1]
                    f = d / f"{server}_{int(time.time() * 1000)}.{ext}"
                    f.write_bytes(base64.b64decode(part["data"]))
                    images.append(str(f))
                    texts.append(f"[image : {f}]")
                elif typ == "resource":
                    r = part.get("resource") or {}
                    texts.append(r.get("text") or json.dumps(r, ensure_ascii=False)[:4000])
                else:
                    texts.append(json.dumps(part, ensure_ascii=False)[:2000])
            if res.get("structuredContent") and not texts:
                texts.append(json.dumps(res["structuredContent"], ensure_ascii=False, indent=1))
            text = "\n".join(texts) or "(vide)"
            return ToolResult(text=wrap_untrusted(f"mcp:{server}", text), images=images, error=bool(res.get("isError")))

        tool = Tool(name=_tool_name(server, original), description=truncate(f"[{server}] " + (t.get("description") or original), 500),
                    parameters=schema, func=run, risk=risk, toolset=f"mcp:{server}")
        self.zeus.registry.register(tool)

    def disconnect(self, name: str) -> None:
        with self._lock:
            c = self.clients.pop(name, None)
        if c:
            c.close()
        self.zeus.registry.unregister_prefix(_tool_name(name, ""))
        self.tool_counts.pop(name, None)

    def stop(self) -> None:
        for name in list(self.clients):
            self.disconnect(name)

    def reload(self) -> None:
        self.stop()
        threading.Thread(target=self.start, daemon=True).start()

    def status(self) -> dict:
        out = {}
        for name, cfg in (self.zeus.config.get("mcp_servers") or {}).items():
            c = self.clients.get(name)
            out[name] = {"connected": bool(c and c.alive()), "tools": self.tool_counts.get(name, 0),
                         "error": self.errors.get(name, ""), "server": (c.server_info if c else {}),
                         "enabled": cfg.get("enabled", True)}
        return out


__all__ = ["MCPManager", "MCPClient", "MCPError"]
