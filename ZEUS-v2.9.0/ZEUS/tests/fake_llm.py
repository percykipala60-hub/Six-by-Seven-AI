"""Faux serveur de modèles pour les tests : imite les API OpenAI (/v1/chat/completions),
Ollama (/api/chat) et Anthropic (/v1/messages), en streaming, avec appels d'outils.

    python tests/fake_llm.py --port 9999     # pour essayer l'interface sans vrai modèle
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        out = []
        for p in content:
            if isinstance(p, dict):
                if p.get("type") == "text":
                    out.append(p.get("text", ""))
                elif p.get("type") == "tool_result":
                    out.append(_text(p.get("content")))
        return "\n".join(out)
    return str(content or "")


def brain(messages: list[dict], tools: list[str]) -> dict:
    """Décide d'une réponse : {"text": …} ou {"tool_calls": [{"name", "arguments"}]}."""
    # les rappels automatiques de ZEUS (plan en cours) ne sont pas des demandes de l'utilisateur
    messages = [m for m in messages if not (m.get("role") == "user" and
                                            _text(m.get("content")).lstrip().startswith("[Rappel automatique"))]
    last = messages[-1] if messages else {}
    role = last.get("role")
    users = [m for m in messages if m.get("role") == "user" and not str(_text(m.get("content"))).startswith("<tool_result")
             and not (isinstance(m.get("content"), list) and any(isinstance(p, dict) and p.get("type") == "tool_result" for p in m["content"]))]
    ask = _text(users[-1].get("content")) if users else ""
    low = ask.lower()
    tool_turn = role == "tool" or (role == "user" and ("<tool_result" in _text(last.get("content")) or (
        isinstance(last.get("content"), list) and any(isinstance(p, dict) and p.get("type") == "tool_result" for p in last["content"]))))
    if role == "user" and "[image(s) renvoyée(s)" in _text(last.get("content")).lower():
        tool_turn = True
    sys0 = _text(messages[0].get("content")) if messages else ""
    if "correcteur expert" in sys0:  # seconde lecture des corrections du professeur de langue
        return {"text": '{"verdicts": [{"index": 0, "statut": "confirmee"}, {"index": 1, "statut": "reformulee", '
                        '"correction": "went to the", "regle": "prétérit"}, {"index": 2, "statut": "retiree"}]}'}
    if "OK" in ask and "Réponds seulement" in ask:
        return {"text": "OK"}
    if "JSON" in (messages[0].get("content") if messages and isinstance(messages[0].get("content"), str) else ""):
        sysmsg = _text(messages[0].get("content"))
        if "uniquement en JSON" in sysmsg:
            if "Classe ce document" in ask:
                return {"text": '{"type": "acte_naissance", "confiance": 0.8, "raison": "test"}'}
            return {"text": '{"memories": [{"content": "Aime les réponses courtes", "kind": "preference", "importance": 3}], '
                            '"skill": {"name": "test_auto", "description": "test", "steps": "1. a\\n2. b"}}'}
    if "résume" in low and "conversation" in low:
        return {"text": "Résumé : l'utilisateur teste ZEUS."}
    done_tools = []
    for m in messages:
        for tc in m.get("tool_calls") or []:
            done_tools.append((tc.get("function") or tc).get("name"))
        if isinstance(m.get("content"), list):
            for p in m["content"]:
                if isinstance(p, dict) and p.get("type") == "tool_use":
                    done_tools.append(p.get("name"))
        if isinstance(m.get("content"), str) and "<tool_call>" in m["content"]:
            done_tools += re.findall(r'"name":\s*"(\w+)"', m["content"])
    if tool_turn:
        results = _text(last.get("content"))
        if "phone_screen" in tools and "whatsapp" in low and "phone_send_whatsapp" not in done_tools:
            return {"tool_calls": [{"name": "phone_send_whatsapp", "arguments": {"to": "Maman", "message": "J'arrive dans 30 minutes"}}]}
        if "write_file" in done_tools and "read_file" not in done_tools and "read_file" in tools:
            return {"tool_calls": [{"name": "read_file", "arguments": {"path": "zeus_test.txt"}}]}
        return {"text": "Voici le résultat : " + results[:160].replace("\n", " ") + " — c'est fait."}
    if "Rôle actif : professeur" in sys0 and "corrections_log" in tools and "don't like" in low:
        # professeur de langue : 2 vraies erreurs et 1 fausse correction (pour le banc d'essai pédagogique)
        return {"tool_calls": [{"name": "corrections_log", "arguments": {"corrections": [
            {"error": "She don't like", "correction": "She doesn't like", "rule": "3e personne : does"},
            {"error": "she play basketball", "correction": "she plays basketball", "rule": "-s à la 3e personne"},
            {"error": "football", "correction": "soccer", "rule": "américain"}]}}]}
    if ("écran" in low or "ecran" in low) and "phone_screen" in tools:
        return {"tool_calls": [{"name": "phone_screen", "arguments": {"mode": "ui"}}]}
    if "whatsapp" in low and "phone_screen" in tools:
        return {"tool_calls": [{"name": "update_plan", "arguments": {"steps": [{"step": "Vérifier le téléphone", "status": "en_cours"},
                                                                                 {"step": "Envoyer le message", "status": "a_faire"}]}},
                               {"name": "phone_status", "arguments": {}}]}
    if "supprime" in low and "delete_path" in tools:
        return {"tool_calls": [{"name": "delete_path", "arguments": {"path": "zeus_test.txt"}}]}
    if "fichier" in low and "write_file" in tools:
        return {"tool_calls": [{"name": "update_plan", "arguments": {"steps": ["Écrire le fichier", "Le relire"]}},
                               {"name": "write_file", "arguments": {"path": "zeus_test.txt", "content": "Bonjour depuis ZEUS ⚡"}}]}
    if "prof d" in low and "set_mode" in tools:
        lang = next((l for l in ("anglais", "espagnol", "allemand", "français") if l in low), "anglais")
        return {"tool_calls": [{"name": "set_mode", "arguments": {"mode": "prof_langue", "language": lang}}]}
    if "rappelle" in low and "schedule_task" in tools:
        return {"tool_calls": [{"name": "schedule_task", "arguments": {"when": "dans 20 min", "prompt": "Boire de l'eau", "kind": "rappel"}}]}
    if "question" in low and "ask_human" in tools:
        return {"tool_calls": [{"name": "ask_human", "arguments": {"question": "Quelle couleur préfères-tu ?", "options": ["Bleu", "Or"]}}]}
    if "dossier" in low and "guichet_open" in tools:
        return {"tool_calls": [{"name": "guichet_open", "arguments": {"procedure": "acte_naissance", "nom": "Jean Kabila"}}]}
    if "shell" in low and "run_shell" in tools:
        return {"tool_calls": [{"name": "run_shell", "arguments": {"command": "echo zeus"}}]}
    return {"text": "Bonjour ! Je suis le modèle de test. Tu as dit : « " + ask[:120] + " »."}


class Handler(BaseHTTPRequestHandler):
    log_message = lambda *a: None  # noqa: E731

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def _start(self, ctype: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/api/tags"):
            data = json.dumps({"models": [{"name": "faux-modele:8b", "size": 1, "details": {"family": "test", "parameter_size": "8B"}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        body = self._body()
        self.server.requests.append({"path": self.path, "body": body,  # type: ignore[attr-defined]
                                     "headers": {k.lower(): v for k, v in self.headers.items()}})
        if self.server.fail_next:  # type: ignore[attr-defined]
            code = self.server.fail_next.pop(0)  # type: ignore[attr-defined]
            msg = json.dumps({"error": {"message": "does not support tools" if code == 400 else "panne simulée"}}).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        if self.path.endswith("/chat/completions"):
            return self.openai(body)
        if self.path.endswith("/api/chat"):
            return self.ollama(body)
        if self.path.endswith("/v1/messages"):
            return self.anthropic(body)
        self.send_response(404)
        self.end_headers()

    def _decide(self, messages: list[dict], tools: list[str]) -> dict:
        return brain(messages, tools)

    def openai(self, body: dict) -> None:
        tools = [t["function"]["name"] for t in body.get("tools") or []]
        r = self._decide(body.get("messages") or [], tools)
        self._start("text/event-stream")
        w = self.wfile

        def send(obj: dict) -> None:
            w.write(f"data: {json.dumps(obj)}\n\n".encode())
            w.flush()
        if r.get("text"):
            t = r["text"]
            for i in range(0, len(t), 7):
                send({"choices": [{"index": 0, "delta": {"content": t[i:i + 7]}}]})
        for idx, tc in enumerate(r.get("tool_calls") or []):
            args = json.dumps(tc["arguments"], ensure_ascii=False)
            send({"choices": [{"index": 0, "delta": {"tool_calls": [{"index": idx, "id": f"call_{uuid.uuid4().hex[:8]}",
                                                                      "type": "function", "function": {"name": tc["name"], "arguments": ""}}]}}]})
            for i in range(0, len(args), 9):
                send({"choices": [{"index": 0, "delta": {"tool_calls": [{"index": idx, "function": {"arguments": args[i:i + 9]}}]}}]})
        send({"choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls" if r.get("tool_calls") else "stop"}],
              "usage": {"prompt_tokens": 100, "completion_tokens": 20}})
        w.write(b"data: [DONE]\n\n")
        w.flush()

    def ollama(self, body: dict) -> None:
        tools = [t["function"]["name"] for t in body.get("tools") or []]
        r = self._decide(body.get("messages") or [], tools)
        if body.get("stream") is False:  # préchauffage du mini-cerveau : une seule réponse JSON
            data = json.dumps({"message": {"role": "assistant", "content": (r.get("text") or "")[:5]}, "done": True,
                               "done_reason": "length", "prompt_eval_count": 90, "eval_count": 1}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._start("application/x-ndjson")
        w = self.wfile
        t = r.get("text") or ""
        for i in range(0, len(t), 7):
            w.write((json.dumps({"message": {"role": "assistant", "content": t[i:i + 7]}, "done": False}) + "\n").encode())
        if r.get("tool_calls"):
            w.write((json.dumps({"message": {"role": "assistant", "content": "", "tool_calls": [
                {"function": {"name": tc["name"], "arguments": tc["arguments"]}} for tc in r["tool_calls"]]}, "done": False}) + "\n").encode())
        w.write((json.dumps({"message": {"role": "assistant", "content": ""}, "done": True, "done_reason": "stop",
                             "prompt_eval_count": 90, "eval_count": 15}) + "\n").encode())
        w.flush()

    def _anthropic_error(self, code: int, kind: str, message: str) -> None:
        data = json.dumps({"type": "error", "error": {"type": kind, "message": message}}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _anthropic_checks(self, body: dict) -> bool:
        """Contrôles de l'API Claude actuelle (documentation d'octobre 2026)."""
        h = {k.lower(): v for k, v in self.headers.items()}
        key = h.get("authorization", "")[7:] if h.get("authorization", "").startswith("Bearer ") else h.get("x-api-key", "")
        if not key:
            self._anthropic_error(401, "authentication_error", "invalid x-api-key")
            return False
        if key.endswith("sans-workspace") and not h.get("anthropic-workspace-id"):
            self._anthropic_error(400, "invalid_request_error", "anthropic-workspace-id header is required when the "
                                                                "API key is not scoped to a workspace")
            return False
        version = h.get("anthropic-version", "")
        if version not in ("2023-06-01", "2026-10-21"):
            self._anthropic_error(400, "invalid_request_error", f"anthropic-version: unsupported API version {version!r}")
            return False
        for p in ("temperature", "top_p", "top_k"):
            if p in body and version == "2026-10-21":
                self._anthropic_error(400, "invalid_request_error", f"{p}: Extra inputs are not permitted")
                return False
        return True

    def _anthropic_cache(self, body: dict) -> dict:
        """Cache de prompt simplifié : préfixes enregistrés aux points cache_control, relus ensuite."""
        blocks: list[str] = []
        marks: list[int] = []

        def add(obj: dict) -> None:
            o = {k: v for k, v in obj.items() if k != "cache_control"}
            blocks.append(json.dumps(o, sort_keys=True, ensure_ascii=False))
            if obj.get("cache_control"):
                marks.append(len(blocks) - 1)
        for t in body.get("tools") or []:
            add(t)
        sys_ = body.get("system")
        for b in (sys_ if isinstance(sys_, list) else ([{"type": "text", "text": sys_}] if sys_ else [])):
            add(b)
        for m in body.get("messages") or []:
            c = m.get("content")
            for b in (c if isinstance(c, list) else [{"type": "text", "text": c}]):
                add({"role": m["role"], **b})
        tok = [max(1, len(b) // 4) for b in blocks]
        cum = [sum(tok[:i + 1]) for i in range(len(tok))]
        hashes = [hashlib.sha1("".join(blocks[:i + 1]).encode()).hexdigest() for i in range(len(blocks))]
        cache: set = self.server.prompt_cache  # type: ignore[attr-defined]
        read_end = -1
        for mk in marks:
            for j in range(mk, max(-1, mk - 20), -1):
                if hashes[j] in cache and j > read_end:
                    read_end = j
                    break
        cache_read = cum[read_end] if read_end >= 0 else 0
        write = 0
        last = read_end
        for mk in marks:
            if mk > last:
                cache.add(hashes[mk])
                write += cum[mk] - (cum[last] if last >= 0 else 0)
                last = mk
        total = cum[-1] if cum else 0
        return {"input_tokens": max(0, total - cache_read - write), "cache_read_input_tokens": cache_read,
                "cache_creation_input_tokens": write}

    def anthropic(self, body: dict) -> None:
        if not self._anthropic_checks(body):
            return
        usage = self._anthropic_cache(body)
        tools = [t["name"] for t in body.get("tools") or []]
        msgs = [{"role": "system", "content": _text(body.get("system"))}] + body.get("messages", [])
        # convertir les blocs Anthropic en messages simples pour le cerveau
        conv = []
        for m in msgs:
            c = m.get("content")
            if isinstance(c, list) and any(b.get("type") == "tool_result" for b in c if isinstance(b, dict)):
                conv.append({"role": "tool", "content": _text(c)})
            elif isinstance(c, list) and any(b.get("type") == "tool_use" for b in c if isinstance(b, dict)):
                conv.append({"role": "assistant", "content": "", "tool_calls": [{"name": b["name"]} for b in c if b.get("type") == "tool_use"]})
            else:
                conv.append({"role": m["role"], "content": _text(c)})
        r = self._decide(conv, tools)
        self._start("text/event-stream")
        w = self.wfile

        def ev(name: str, obj: dict) -> None:
            w.write(f"event: {name}\ndata: {json.dumps(obj)}\n\n".encode())
            w.flush()
        ev("message_start", {"type": "message_start", "message": {"usage": {**usage, "output_tokens": 1}}})
        i = 0
        if r.get("text"):
            ev("content_block_start", {"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}})
            t = r["text"]
            for k in range(0, len(t), 6):
                ev("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": t[k:k + 6]}})
            ev("content_block_stop", {"type": "content_block_stop", "index": i})
            i += 1
        for tc in r.get("tool_calls") or []:
            ev("content_block_start", {"type": "content_block_start", "index": i, "content_block": {
                "type": "tool_use", "id": "toolu_" + uuid.uuid4().hex[:10], "name": tc["name"], "input": {}}})
            args = json.dumps(tc["arguments"])
            for k in range(0, len(args), 8):
                ev("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": args[k:k + 8]}})
            ev("content_block_stop", {"type": "content_block_stop", "index": i})
            i += 1
        ev("message_delta", {"type": "message_delta", "delta": {"stop_reason": "tool_use" if r.get("tool_calls") else "end_turn"},
                             "usage": {"output_tokens": 12}})
        ev("message_stop", {"type": "message_stop"})


class FakeLLMServer:
    def __init__(self, port: int = 0):
        self.httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.httpd.daemon_threads = True
        self.httpd.requests = []  # type: ignore[attr-defined]
        self.httpd.fail_next = []  # type: ignore[attr-defined]
        self.httpd.prompt_cache = set()  # type: ignore[attr-defined]
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    @property
    def requests(self) -> list:
        return self.httpd.requests  # type: ignore[attr-defined]

    def fail(self, *codes: int) -> None:
        self.httpd.fail_next.extend(codes)  # type: ignore[attr-defined]

    def stop(self) -> None:
        self.httpd.shutdown()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9999)
    a = ap.parse_args()
    s = FakeLLMServer(a.port)
    print(f"Faux modèle sur http://127.0.0.1:{s.port} (OpenAI : /v1, Ollama : /, Anthropic : /)")
    while True:
        time.sleep(3600)
