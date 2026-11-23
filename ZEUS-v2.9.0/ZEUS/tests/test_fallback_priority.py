"""Tests de simulation : bascule automatique Groq → Claude → Ollama (priorité 1).

🟡 Ces tests valident la logique de routage/fallback en local (faux serveurs).
Ils ne prouvent PAS que les vrais services Groq/Claude/Ollama répondent.
"""

from __future__ import annotations

import json
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from zeuscore.config import Config
from zeuscore.llm import LLMError, LLMRouter, apply_claude_preset, apply_groq_preset


class _FailHandler(BaseHTTPRequestHandler):
    log_message = lambda *a: None  # noqa: E731

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if self.path.startswith("/api/tags"):
            data = json.dumps({"models": [{"name": "local:fake"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        body = self._body()
        self.server.requests.append({"path": self.path, "body": body})  # type: ignore[attr-defined]
        fail = getattr(self.server, "fail_paths", {}).get(self.path)  # type: ignore[attr-defined]
        if fail:
            code, kind = fail
            if self.path.endswith("/v1/messages"):
                msg = json.dumps({"type": "error", "error": {"type": kind, "message": "simulated"}}).encode()
            else:
                msg = json.dumps({"error": {"message": "simulated", "type": kind}}).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        if self.path.endswith("/chat/completions"):
            self._openai()
        elif self.path.endswith("/v1/messages"):
            self._anthropic()
        elif self.path.endswith("/api/chat"):
            self._ollama()
        else:
            self.send_response(404)
            self.end_headers()

    def _openai(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        text = "rep-groq"
        for ch in (text[i:i + 4] for i in range(0, len(text), 4)):
            self.wfile.write(f"data: {json.dumps({'choices':[{'index':0,'delta':{'content':ch}}]})}\n\n".encode())
        self.wfile.write(f"data: {json.dumps({'choices':[{'index':0,'delta':{},'finish_reason':'stop'}],'usage':{'prompt_tokens':5,'completion_tokens':2}})}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def _anthropic(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        text = "rep-claude"
        self.wfile.write(f"event: message_start\ndata: {json.dumps({'type':'message_start','message':{'usage':{'input_tokens':5,'output_tokens':1}}})}\n\n".encode())
        self.wfile.write(f"event: content_block_start\ndata: {json.dumps({'type':'content_block_start','index':0,'content_block':{'type':'text','text':''}})}\n\n".encode())
        self.wfile.write(f"event: content_block_delta\ndata: {json.dumps({'type':'content_block_delta','index':0,'delta':{'type':'text_delta','text':text}})}\n\n".encode())
        self.wfile.write(f"event: content_block_stop\ndata: {json.dumps({'type':'content_block_stop','index':0})}\n\n".encode())
        self.wfile.write(f"event: message_delta\ndata: {json.dumps({'type':'message_delta','delta':{'stop_reason':'end_turn'},'usage':{'output_tokens':3}})}\n\n".encode())
        self.wfile.write(b"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
        self.wfile.flush()

    def _ollama(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.end_headers()
        self.wfile.write((json.dumps({"message": {"role": "assistant", "content": "rep-ollama"}, "done": False}) + "\n").encode())
        self.wfile.write((json.dumps({"message": {"role": "assistant", "content": ""}, "done": True, "prompt_eval_count": 5, "eval_count": 2}) + "\n").encode())
        self.wfile.flush()


class _Server:
    def __init__(self):
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _FailHandler)
        self.httpd.daemon_threads = True
        self.httpd.requests = []  # type: ignore[attr-defined]
        self.httpd.fail_paths = {}  # type: ignore[attr-defined]
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def fail(self, path, code=500, kind="api_error"):
        self.httpd.fail_paths[path] = (code, kind)  # type: ignore[attr-defined]

    def clear(self):
        self.httpd.fail_paths.clear()  # type: ignore[attr-defined]
        self.httpd.requests.clear()  # type: ignore[attr-defined]

    def stop(self):
        self.httpd.shutdown()


def _temp_cfg():
    home = Path(tempfile.mkdtemp(prefix="zeus-fb-"))
    return Config(home)


def _router(models, routing):
    cfg = _temp_cfg()
    cfg.set("models", models, save=False)
    cfg.set("routing", routing, save=False)
    cfg.save()
    return LLMRouter(cfg)


class TestFallbackPriority(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = _Server()
        cls.base = f"http://127.0.0.1:{cls.srv.port}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.stop()

    def setUp(self):
        self.srv.clear()

    def _models(self):
        b = self.base
        return [
            {"id": "groq", "provider": "openai", "base_url": f"{b}/v1", "model": "fake-groq", "api_key": "gsk_test", "context": 32000},
            {"id": "claude", "provider": "anthropic", "base_url": b, "model": "claude-fake", "api_key": "sk-ant-test", "context": 200000},
            {"id": "local", "provider": "ollama", "base_url": b, "model": "local-fake", "context": 8192},
        ]

    def _routing(self):
        return {"default": "groq", "fast": "groq", "fallback": ["claude", "local"]}

    def test_groq_first(self):
        r = _router(self._models(), self._routing())
        res = r.chat([{"role": "user", "content": "ping"}])
        self.assertEqual(res.text, "rep-groq")

    def test_groq_down_falls_to_claude(self):
        self.srv.fail("/v1/chat/completions", 503, "overloaded_error")
        r = _router(self._models(), self._routing())
        res = r.chat([{"role": "user", "content": "ping"}])
        self.assertEqual(res.text, "rep-claude")

    def test_groq_and_claude_down_falls_to_ollama(self):
        self.srv.fail("/v1/chat/completions", 503, "overloaded_error")
        self.srv.fail("/v1/messages", 529, "overloaded_error")
        r = _router(self._models(), self._routing())
        res = r.chat([{"role": "user", "content": "ping"}])
        self.assertEqual(res.text, "rep-ollama")

    def test_invalid_key_reports_clear_error_no_leak(self):
        self.srv.fail("/v1/chat/completions", 401, "invalid_api_key")
        models = [self._models()[0]]
        r = _router(models, {"default": "groq", "fallback": []})
        with self.assertRaises(LLMError) as ctx:
            r.chat([{"role": "user", "content": "ping"}])
        err = ctx.exception
        self.assertIn(err.kind, ("auth", "billing", "all_failed"))
        msg = str(err)
        self.assertNotIn("gsk_test", msg)  # la clé ne fuit jamais dans l'erreur
        self.assertTrue(msg.strip())

    def test_groq_preset_builds_chain_with_claude_present(self):
        cfg = _temp_cfg()
        apply_claude_preset(cfg, "env:ANTHROPIC_API_KEY")
        apply_groq_preset(cfg, "env:GROQ_API_KEY", available=["llama-3.3-70b-versatile", "llama-3.1-8b-instant"])
        routing = cfg.get("routing") or {}
        self.assertEqual(routing.get("default"), "groq")
        fb = routing.get("fallback") or []
        self.assertTrue(any("claude" in x for x in fb), fb)

    def test_claude_preset_keeps_groq_chain(self):
        cfg = _temp_cfg()
        apply_groq_preset(cfg, "env:GROQ_API_KEY", available=["llama-3.3-70b-versatile", "llama-3.1-8b-instant"])
        apply_claude_preset(cfg, "env:ANTHROPIC_API_KEY")
        routing = cfg.get("routing") or {}
        self.assertEqual(routing.get("default"), "groq")
        fb = routing.get("fallback") or []
        self.assertTrue(any("claude" in x for x in fb), fb)

    def test_local_loopback_latency_measurement(self):
        r = _router(self._models(), self._routing())
        t0 = time.perf_counter()
        res = r.chat([{"role": "user", "content": "ping"}])
        dt = time.perf_counter() - t0
        self.assertEqual(res.text, "rep-groq")
        self.assertGreaterEqual(dt, 0.0)
        self.assertLess(dt, 10.0)  # mesure bout en bout (simulation locale)


if __name__ == "__main__":
    unittest.main()
