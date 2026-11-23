"""Serveur web de ZEUS : interface (PC et téléphone), API JSON, flux temps réel (SSE),
miroir du téléphone, webhook WhatsApp. Protégé par jeton."""

from __future__ import annotations

import hmac
import json
import mimetypes
import queue
import re
import socket
import ssl
import threading
import time
import urllib.parse
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from .. import modes
from ..dossiers import DOC_TYPES, STATUS_LABELS
from ..security import AUTONOMY_LABELS
from ..qr import qr_svg
from ..util import SECRET_KEYS, human_size, is_image, jload, log, redact, truncate

if TYPE_CHECKING:  # pragma: no cover
    from ..core import Zeus

UI_DIR = Path(__file__).resolve().parent.parent / "ui"
MAX_UPLOAD = 60 * 1024 * 1024


def lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


class Route:
    def __init__(self, method: str, pattern: str, fn: Callable, auth: bool = True):
        self.method = method
        self.re = re.compile("^" + pattern + "$")
        self.fn = fn
        self.auth = auth


class WebServer:
    def __init__(self, zeus: "Zeus", host: str | None = None, port: int | None = None):
        self.zeus = zeus
        self.host = host or zeus.config.get("web.host") or "127.0.0.1"
        self.port = int(port or zeus.config.get("web.port") or 7777)
        self.httpd: ThreadingHTTPServer | None = None
        self.thread: threading.Thread | None = None
        self.scheme = "http"
        self._login_attempts: dict[str, list[float]] = {}
        self._shot_lock = threading.Lock()
        self._last_shot = 0.0
        self.routes = self._routes()

    # ------------------------------------------------------------------ cycle
    def start(self) -> None:
        server = self

        class Handler(ZeusHandler):
            web = server

        self.httpd = ThreadingHTTPServer((self.host, self.port), Handler)
        self.httpd.daemon_threads = True
        cfg = self.zeus.config
        if cfg.get("web.https"):
            cert, key = cfg.get("web.ssl_cert"), cfg.get("web.ssl_key")
            if not (cert and key and Path(cert).exists() and Path(key).exists()):
                # Pas de certificat fourni : ZEUS crée le sien (autosigné), pour que le micro du téléphone marche sur
                # le Wi-Fi. Il est refait si l'adresse du PC change.
                from ..tlscert import ensure_cert
                try:
                    cert, key = ensure_cert(cfg.dir("tls"), ["localhost", socket.gethostname()],
                                            ["127.0.0.1", lan_ip()])
                except Exception as e:  # noqa: BLE001
                    log.warning("certificat HTTPS impossible : %s", e)
                    cert = key = None
            if cert and key:
                ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                ctx.load_cert_chain(str(cert), str(key))
                self.httpd.socket = ctx.wrap_socket(self.httpd.socket, server_side=True)
                self.scheme = "https"
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True, name="web")
        self.thread.start()

    def stop(self) -> None:
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()

    def url(self, lan: bool = False, with_token: bool = True) -> str:
        host = lan_ip() if lan else ("127.0.0.1" if self.host in ("0.0.0.0", "", "::") else self.host)
        tok = f"/?token={self.zeus.config.get('web.token')}" if with_token else "/"
        return f"{self.scheme}://{host}:{self.port}{tok}"

    # ------------------------------------------------------------------ routes
    def _routes(self) -> list[Route]:
        R = Route
        return [
            R("GET", r"/api/ping", self.api_ping, auth=False),
            R("POST", r"/api/login", self.api_login, auth=False),
            R("POST", r"/api/logout", self.api_logout, auth=False),
            R("GET", r"/webhook/whatsapp", self.wa_verify, auth=False),
            R("POST", r"/webhook/whatsapp", self.wa_post, auth=False),
            R("GET", r"/api/status", self.api_status),
            R("GET", r"/api/events", self.api_events),
            R("GET", r"/api/sessions", self.api_sessions),
            R("POST", r"/api/sessions", self.api_session_new),
            R("GET", r"/api/sessions/([\w-]+)", self.api_session_get),
            R("PATCH", r"/api/sessions/([\w-]+)", self.api_session_patch),
            R("DELETE", r"/api/sessions/([\w-]+)", self.api_session_delete),
            R("POST", r"/api/sessions/([\w-]+)/stop", self.api_session_stop),
            R("POST", r"/api/sessions/([\w-]+)/reply", self.api_session_reply),
            R("GET", r"/api/access", self.api_access),
            R("POST", r"/api/chat", self.api_chat),
            R("POST", r"/api/upload", self.api_upload),
            R("GET", r"/api/file", self.api_file),
            R("GET", r"/api/approvals", self.api_approvals),
            R("POST", r"/api/approvals/(\d+)", self.api_approval_decide),
            R("GET", r"/api/dossiers", self.api_dossiers),
            R("POST", r"/api/dossiers", self.api_dossier_new),
            R("GET", r"/api/dossiers/([\w-]+)", self.api_dossier_get),
            R("POST", r"/api/dossiers/([\w-]+)", self.api_dossier_update),
            R("POST", r"/api/dossiers/([\w-]+)/relance", self.api_dossier_relance),
            R("POST", r"/api/dossiers/([\w-]+)/attach", self.api_dossier_attach),
            R("GET", r"/api/dossiers/([\w-]+)/export", self.api_dossier_export),
            R("POST", r"/api/documents/(\d+)", self.api_document_update),
            R("GET", r"/api/procedures", self.api_procedures),
            R("POST", r"/api/procedures", self.api_procedure_save),
            R("DELETE", r"/api/procedures/([\w-]+)", self.api_procedure_delete),
            R("GET", r"/api/memories", self.api_memories),
            R("POST", r"/api/memories", self.api_memory_add),
            R("PUT", r"/api/memories/(\d+)", self.api_memory_update),
            R("DELETE", r"/api/memories/(\d+)", self.api_memory_delete),
            R("GET", r"/api/skills", self.api_skills),
            R("POST", r"/api/skills", self.api_skill_save),
            R("DELETE", r"/api/skills/([\w-]+)", self.api_skill_delete),
            R("POST", r"/api/skills/install", self.api_skill_install),
            R("GET", r"/api/triggers", self.api_triggers),
            R("POST", r"/api/triggers", self.api_trigger_add),
            R("POST", r"/api/triggers/(\d+)", self.api_trigger_update),
            R("POST", r"/api/triggers/(\d+)/test", self.api_trigger_test),
            R("DELETE", r"/api/triggers/(\d+)", self.api_trigger_delete),
            R("GET", r"/api/brief", self.api_brief),
            R("POST", r"/api/brief", self.api_brief_action),
            R("GET", r"/api/mcp_server", self.api_mcp_server),
            R("GET", r"/api/tasks", self.api_tasks),
            R("POST", r"/api/tasks", self.api_task_add),
            R("POST", r"/api/tasks/(\d+)", self.api_task_update),
            R("POST", r"/api/tasks/(\d+)/run", self.api_task_run),
            R("DELETE", r"/api/tasks/(\d+)", self.api_task_delete),
            R("GET", r"/api/audit", self.api_audit),
            R("GET", r"/api/config", self.api_config),
            R("POST", r"/api/config", self.api_config_save),
            R("POST", r"/api/models/test", self.api_model_test),
            R("GET", r"/api/models/discover", self.api_models_discover),
            R("POST", r"/api/models/preset", self.api_models_preset),
            R("POST", r"/api/models/groq", self.api_models_groq),
            R("POST", r"/api/models/free", self.api_models_free),
            R("GET", r"/api/system", self.api_system),
            R("GET", r"/api/usage", self.api_usage),
            R("GET", r"/api/phone/status", self.api_phone_status),
            R("GET", r"/api/phone/screen\.png", self.api_phone_screen),
            R("GET", r"/api/phone/elements", self.api_phone_elements),
            R("POST", r"/api/phone/action", self.api_phone_action),
            R("GET", r"/api/phone/settings", self.api_phone_settings),
            R("POST", r"/api/phone/settings", self.api_phone_setting_set),
            R("POST", r"/api/phone/alarm", self.api_phone_alarm),
            R("POST", r"/api/voice/transcribe", self.api_transcribe),
            R("GET", r"/api/tools", self.api_tools),
            R("GET", r"/api/learn", self.api_learn),
            R("POST", r"/api/learn/cards", self.api_learn_card_add),
            R("POST", r"/api/learn/grade", self.api_learn_grade),
            R("DELETE", r"/api/learn/cards/(\d+)", self.api_learn_card_delete),
            R("GET", r"/api/learn/practice", self.api_learn_practice),
            R("GET", r"/api/learn/export", self.api_learn_export),
            R("POST", r"/api/open", self.api_open),
            R("POST", r"/api/learn/speech", self.api_learn_speech),
            R("DELETE", r"/api/learn/errors/(\d+)", self.api_learn_error_delete),
            R("GET", r"/api/office", self.api_office),
            R("POST", r"/api/office/todos", self.api_todo_add),
            R("POST", r"/api/office/todos/(\d+)", self.api_todo_update),
            R("DELETE", r"/api/office/todos/(\d+)", self.api_todo_delete),
            R("DELETE", r"/api/office/events/(\d+)", self.api_event_delete),
            R("DELETE", r"/api/office/contacts/(\d+)", self.api_contact_delete),
            # bibliothèque de documents
            R("GET", r"/api/kb", self.api_kb),
            R("GET", r"/api/kb/search", self.api_kb_search),
            R("GET", r"/api/kb/docs/(\d+)", self.api_kb_doc),
            R("POST", r"/api/kb/folders", self.api_kb_folder_add),
            R("POST", r"/api/kb/folders/remove", self.api_kb_folder_remove),
            R("POST", r"/api/kb/reindex", self.api_kb_reindex),
            R("POST", r"/api/kb/upload", self.api_kb_upload),
            # agendas Google / Outlook
            R("GET", r"/api/calendar", self.api_calendar),
            R("POST", r"/api/calendar/feeds", self.api_calendar_add),
            R("DELETE", r"/api/calendar/feeds/([\w-]+)", self.api_calendar_remove),
            R("POST", r"/api/calendar/sync", self.api_calendar_sync),
            R("GET", r"/api/calendar/zeus-([\w-]+)\.ics", self.api_calendar_ics, auth=False),
            # « ZEUS s'est trompé »
            R("POST", r"/api/feedback", self.api_feedback_add),
            R("GET", r"/api/feedback", self.api_feedback_list),
            R("PATCH", r"/api/feedback/(\d+)", self.api_feedback_status),
            # test de niveau adaptatif
            R("POST", r"/api/learn/placement", self.api_placement_start),
            R("POST", r"/api/learn/placement/([\w-]+)", self.api_placement_answer),
            R("GET", r"/api/learn/placement", self.api_placement_history),
        ]

    # ------------------------------------------------------------------ outils internes
    def file_url(self, path: str) -> str:
        return "/api/file?path=" + urllib.parse.quote(str(path))

    def ui_message(self, m: dict) -> dict:
        c = m.get("content")
        images, text = [], ""
        if isinstance(c, list):
            for part in c:
                if part.get("type") == "text":
                    text += part.get("text", "")
                elif part.get("type") == "image":
                    images.append(self.file_url(part.get("path", "")))
        else:
            text = c or ""
        out: dict[str, Any] = {"id": m["id"], "role": m["role"], "text": text, "images": images,
                               "created": m.get("created"), "auto": bool((m.get("meta") or {}).get("auto")),
                               "error": bool((m.get("meta") or {}).get("error")), "model": (m.get("meta") or {}).get("model"),
                               "cost": (m.get("meta") or {}).get("cost"), "mini": bool((m.get("meta") or {}).get("mini")),
                               "reflex": bool((m.get("meta") or {}).get("reflex"))}
        if m.get("tool_calls"):
            out["tool_calls"] = [{"id": tc["id"], "name": tc["name"], "args": tc.get("arguments")} for tc in m["tool_calls"]]
        if m["role"] == "tool":
            out["tool_call_id"] = m.get("tool_call_id")
            out["name"] = m.get("name")
            out["text"] = truncate(text, 4000)
        files = (m.get("meta") or {}).get("files") or []
        if files:
            out["files"] = [{"name": Path(f).name, "url": self.file_url(f)} for f in files if f]
        if (m.get("meta") or {}).get("manual"):
            out["manual"] = True
        if m.get("attachments"):
            out["attachments"] = [{"name": Path(a).name, "url": self.file_url(a), "image": is_image(a)}
                                  for a in m["attachments"] if a]
        return out

    # ------------------------------------------------------------------ API : base
    def api_ping(self, h: "ZeusHandler") -> Any:
        return {"ok": True, "name": self.zeus.config.assistant_name, "version": self.zeus.version,
                "auth": h.authed()}

    def api_login(self, h: "ZeusHandler") -> Any:
        ip = h.client_address[0]
        tries = [t for t in self._login_attempts.get(ip, []) if time.time() - t < 60]
        if len(tries) >= 10:
            return h.json({"error": "trop de tentatives, attends une minute"}, 429)
        body = h.body_json()
        tok = str(body.get("token") or "").strip()
        if not hmac.compare_digest(tok, str(self.zeus.config.get("web.token"))):
            self._login_attempts[ip] = tries + [time.time()]
            return h.json({"error": "jeton incorrect"}, 401)
        h.set_cookie = f"zeus_session={tok}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict"
        return {"ok": True}

    def api_logout(self, h: "ZeusHandler") -> Any:
        h.set_cookie = "zeus_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"
        return {"ok": True}

    def api_status(self, h: "ZeusHandler") -> Any:
        st = self.zeus.status()
        from ..voice import stt_available
        st.update({
            "pairing_code": self.zeus.config.get("telegram.pairing_code"),
            "web": {"host": self.host, "port": self.port, "scheme": self.scheme, "lan": lan_ip(),
                    "lan_url": f"{self.scheme}://{lan_ip()}:{self.port}/", "public": self.host == "0.0.0.0"},
            "autonomy_labels": AUTONOMY_LABELS, "status_labels": STATUS_LABELS,
            "doc_types": {k: v["label"] for k, v in DOC_TYPES.items()},
            "stt": stt_available(self.zeus.config), "workspace": str(self.zeus.config.workspace),
            "wake_word": self.zeus.config.get("voice.wake_word") or "zeus",
            "voice_language": self.zeus.config.get("voice.language") or "",
            "modes": {k: {"label": v["label"], "icon": v["icon"]} for k, v in modes.MODES.items()},
            "langs": {k: {"name": v["name"], "native": v["native"], "bcp47": v["bcp47"]} for k, v in modes.LANGS.items()},
            "home": str(self.zeus.config.home),
        })
        return st

    def api_events(self, h: "ZeusHandler") -> Any:
        h.send_response(200)
        h.send_header("Content-Type", "text/event-stream; charset=utf-8")
        h.send_header("Cache-Control", "no-cache")
        h.send_header("X-Accel-Buffering", "no")
        h.end_headers()
        q = self.zeus.bus.subscribe()
        try:
            h.wfile.write(b"retry: 3000\n\n")
            h.wfile.flush()
            while True:
                try:
                    ev = q.get(timeout=15)
                except queue.Empty:
                    h.wfile.write(b": ping\n\n")
                    h.wfile.flush()
                    continue
                for key in ("image",):
                    if ev.get(key):
                        ev = {**ev, key + "_url": self.file_url(ev[key])}
                if ev.get("images"):
                    ev = {**ev, "image_urls": [self.file_url(x) for x in ev["images"]]}
                if ev.get("files"):
                    ev = {**ev, "file_links": [{"name": Path(f).name, "url": self.file_url(f)} for f in ev["files"]]}
                h.wfile.write(f"data: {json.dumps(ev, ensure_ascii=False, default=str)}\n\n".encode("utf-8"))
                h.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            self.zeus.bus.unsubscribe(q)
        return None

    # ------------------------------------------------------------------ conversations
    def api_sessions(self, h: "ZeusHandler") -> Any:
        rows = self.zeus.db.list_sessions(int(h.query.get("limit", 80)))
        rows = [r for r in rows if r["channel"] != "agent"]
        running = {r["session_id"] for r in self.zeus.runs()}
        return [{"id": r["id"], "title": r["title"], "channel": r["channel"], "trust": r["trust"],
                 "peer": r["peer_name"] or r["peer"], "updated": r["updated"], "running": r["id"] in running}
                for r in rows]

    def api_session_new(self, h: "ZeusHandler") -> Any:
        # Une conversation encore vide (aucun message, aucun rôle choisi) est réutilisée : cliquer plusieurs fois sur
        # « Nouvelle conversation » ne remplit plus la liste de conversations vides.
        db = self.zeus.db
        for s in db.q("SELECT id, meta FROM sessions WHERE channel='web' AND peer='owner' AND "
                      "title='Nouvelle conversation' AND NOT EXISTS (SELECT 1 FROM messages m WHERE "
                      "m.session_id=sessions.id) ORDER BY updated DESC LIMIT 5"):
            if not jload(s.get("meta"), {}) and not self.zeus.running(s["id"]):
                db.update_session(s["id"], title="Nouvelle conversation")  # la remonte en tête de liste
                return {"id": s["id"]}
        return {"id": db.create_session("web", "owner", "owner")}

    def api_session_get(self, h: "ZeusHandler", sid: str) -> Any:
        s = self.zeus.db.get_session(sid)
        if not s:
            return h.json({"error": "conversation introuvable"}, 404)
        msgs = [self.ui_message(m) for m in self.zeus.db.get_messages(sid, include_archived=True)]
        run = self.zeus.running(sid)
        return {"session": s, "messages": msgs, "running": run.info() if run else None}

    def api_session_patch(self, h: "ZeusHandler", sid: str) -> Any:
        b = h.body_json()
        s = self.zeus.db.get_session(sid)
        if not s:
            return h.json({"error": "introuvable"}, 404)
        if "title" in b:
            self.zeus.db.update_session(sid, title=str(b["title"])[:120])
        if "autonomy" in b:
            meta = s.get("meta") or {}
            meta["autonomy"] = b["autonomy"] if b["autonomy"] in AUTONOMY_LABELS else None
            self.zeus.db.update_session(sid, meta=meta)
        if "brain" in b:
            s = self.zeus.db.get_session(sid) or s
            meta = s.get("meta") or {}
            meta["brain"] = b["brain"] if b["brain"] in ("max", "fast") else None
            self.zeus.db.update_session(sid, meta=meta)
        if "mode" in b and s.get("trust") != "external":
            self._set_mode(sid, b["mode"])
        return {"ok": True, "session": self.zeus.db.get_session(sid)}

    def _set_mode(self, sid: str, mode: Any) -> dict:
        s = self.zeus.db.get_session(sid) or {}
        meta = s.get("meta") or {}
        m = modes.normalize(mode)
        meta["mode"] = m
        extra = [t for t in modes.toolsets(m) if t in self.zeus.registry.toolsets()]
        meta["toolsets"] = sorted(set(meta.get("toolsets") or []) | set(extra))
        self.zeus.db.update_session(sid, meta=meta)
        return m

    # ------------------------------------------------------------------ API : apprentissage
    def api_learn(self, h: "ZeusHandler") -> Any:
        from ..tools.learning import learn_summary
        deck = h.query.get("deck", "")
        db = self.zeus.db
        goals = self.zeus.config.get("learning.goals") or {}
        return {"decks": db.flashcard_decks(), "due": db.due_flashcards(deck, 100),
                "cards": db.list_flashcards(deck, 500) if deck else [], "progress": db.list_progress("", 40),
                "stats": learn_summary(db, goals), "errors": db.frequent_errors("", 40),
                "categories": db.error_categories(""), "levels": self._levels(),
                "scenarios": [{"title": t, "detail": d} for t, d in modes.SCENARIOS]}

    # ------------------------------------------------------------------ API : « ZEUS s'est trompé »
    def api_feedback_add(self, h: "ZeusHandler") -> Any:
        from .. import feedback
        b = h.body_json()
        sid = str(b.get("session_id") or "")
        if not self.zeus.db.get_session(sid):
            return h.json({"error": "conversation introuvable"}, 404)
        try:
            case = feedback.record(self.zeus, sid, b.get("message_id"), str(b.get("kind") or "autre"),
                                   str(b.get("comment") or ""), str(b.get("expected") or ""))
        except KeyError as e:
            return h.json({"error": str(e.args[0])}, 404)
        return {"id": case["id"], "path": case["path"]}

    def api_feedback_list(self, h: "ZeusHandler") -> Any:
        from .. import feedback
        return {"cases": feedback.list_cases(self.zeus, h.query.get("status", ""), 200), "kinds": feedback.KINDS}

    def api_feedback_status(self, h: "ZeusHandler", fid: str) -> Any:
        from .. import feedback
        try:
            ok = feedback.set_status(self.zeus, int(fid), str(h.body_json().get("status") or ""))
        except ValueError as e:
            return h.json({"error": str(e)}, 400)
        return {"ok": ok} if ok else h.json({"error": "cas introuvable"}, 404)

    def _levels(self) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for r in self.zeus.db.placement_history("", 50):
            out.setdefault(r["lang"], {"level": r["level"], "ts": r["finished"]})
        return out

    # ------------------------------------------------------------------ test de niveau adaptatif
    def api_placement_start(self, h: "ZeusHandler") -> Any:
        from ..placement import Placement
        lang = modes.parse_lang(str(h.body_json().get("lang") or ""), "")
        try:
            return Placement(self.zeus.db).start(lang)
        except ValueError as e:
            return h.json({"error": str(e)}, 400)

    def api_placement_answer(self, h: "ZeusHandler", pid: str) -> Any:
        from ..placement import Placement
        b = h.body_json()
        try:
            v = Placement(self.zeus.db).answer(pid, int(b.get("choice")))
        except KeyError as e:
            return h.json({"error": str(e.args[0])}, 404)
        except (ValueError, TypeError):
            return h.json({"error": "réponse invalide"}, 400)
        r = v.get("result")
        if r and not r.get("saved"):
            from ..tools.learning import bump_stats
            name = modes.lang_name(v["lang"])
            self.zeus.db.add_progress(name, "test de niveau", float(r["score"]),
                                      f"Niveau {r['level']} ({r['position']}) — {r['correct']}/{r['total']} bonnes réponses")
            bump_stats(self.zeus.db, ex=1)
            row = self.zeus.db.placement_get(pid)
            if row:
                row["state"]["result"]["saved"] = True
                self.zeus.db.placement_save(pid, row["lang"], row["state"], finished=True, level=r["level"])
            self.zeus.bus.publish("progress_changed")
        return v

    def api_placement_history(self, h: "ZeusHandler") -> Any:
        return {"history": self.zeus.db.placement_history(modes.parse_lang(h.query.get("lang", ""), ""), 30),
                "levels": self._levels()}

    def api_open(self, h: "ZeusHandler") -> Any:
        """Commande vocale « ouvre YouTube » : ouvre le site sur l'ordinateur où tourne ZEUS."""
        url = str(h.body_json().get("url") or "").strip()
        if not re.match(r"^https?://[^\s]+$", url, re.I):
            return h.json({"error": "adresse invalide"}, 400)
        import webbrowser
        threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
        return {"ok": True}

    def api_learn_export(self, h: "ZeusHandler") -> Any:
        from ..tools.learning import anki_export
        deck = h.query.get("deck", "")
        data = anki_export(self.zeus.db, deck).encode("utf-8")
        name = re.sub(r"[^\w-]+", "-", deck).strip("-") or "toutes"
        h._send(200, data, "text/plain; charset=utf-8",
                {"Content-Disposition": f"attachment; filename=\"zeus-cartes-{name}.txt\"", "Cache-Control": "no-store"})
        return None

    def api_learn_practice(self, h: "ZeusHandler") -> Any:
        from ..tools.learning import practice_sentences
        lang = modes.parse_lang(h.query.get("lang", ""), "en")
        return {"lang": lang, "sentences": practice_sentences(self.zeus.db, lang)}

    def api_learn_speech(self, h: "ZeusHandler") -> Any:
        """Résultat d'un exercice de prononciation ou de dictée : minutes de parole, score, progression."""
        from ..tools.learning import bump_stats
        b = h.body_json()
        lang = modes.parse_lang(str(b.get("lang") or ""), "en")
        try:
            seconds = max(0.0, min(120.0, float(b.get("seconds") or 0)))
        except (TypeError, ValueError):
            return h.json({"error": "durée invalide"}, 400)
        kind = "dictée" if b.get("kind") == "dictee" else "prononciation"
        score = b.get("score") if isinstance(b.get("score"), (int, float)) and not isinstance(b.get("score"), bool) else None
        bump_stats(self.zeus.db, speak=seconds if kind == "prononciation" else 0, ex=1)
        if isinstance(score, (int, float)):
            self.zeus.db.add_progress(modes.lang_name(lang), kind, max(0.0, min(100.0, float(score))),
                                      truncate(str(b.get("text") or ""), 160))
        return {"ok": True}

    def api_learn_error_delete(self, h: "ZeusHandler", eid: str) -> Any:
        return {"ok": self.zeus.db.delete_lang_error(int(eid))}

    def api_learn_card_add(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        front, back = str(b.get("front") or "").strip(), str(b.get("back") or "").strip()
        if not front or not back:
            return h.json({"error": "recto et verso obligatoires"}, 400)
        cid, _ = self.zeus.db.add_flashcard(str(b.get("deck") or "général").strip()[:80], front[:300], back[:500],
                                            str(b.get("example") or "")[:500], modes.parse_lang(str(b.get("lang") or ""), ""))
        return {"id": cid}

    def api_learn_grade(self, h: "ZeusHandler") -> Any:
        from ..tools.learning import GRADES, schedule_card
        b = h.body_json()
        c = self.zeus.db.get_flashcard(int(b.get("id") or 0))
        if not c:
            return h.json({"error": "carte introuvable"}, 404)
        grade = b.get("grade") if b.get("grade") in GRADES else "bien"
        upd = schedule_card(c, grade)
        self.zeus.db.update_flashcard(c["id"], **upd)
        from ..tools.learning import bump_stats
        bump_stats(self.zeus.db, cards=1)
        return {"ok": True, "due": upd["due"], "interval": upd["interval"]}

    def api_learn_card_delete(self, h: "ZeusHandler", cid: str) -> Any:
        return {"ok": self.zeus.db.delete_flashcard(int(cid))}

    # ------------------------------------------------------------------ API : secrétariat
    def api_office(self, h: "ZeusHandler") -> Any:
        import datetime as _dt
        from ..calendar_sync import google_link, outlook_link
        db = self.zeus.db
        t0 = time.mktime(_dt.date.today().timetuple())
        names = {f"feed:{f['id']}": f.get("name") or f.get("provider") for f in self.zeus.calendars.feeds()}
        events = db.list_events(t0, t0 + 31 * 86400)
        for e in events:
            e["source_name"] = names.get(e.get("source") or "", "agenda externe" if e.get("source") else "")
            if not e.get("source"):
                e["google"], e["outlook"] = google_link(e), outlook_link(e)
        return {"events": events, "todos": db.list_todos("open", "", 200),
                "done": db.list_todos("done", "", 20), "contacts": db.find_contacts("", 300),
                "feeds": len(self.zeus.calendars.feeds())}

    def api_todo_add(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        text = str(b.get("text") or "").strip()
        if not text:
            return h.json({"error": "tâche vide"}, 400)
        due = None
        if b.get("due"):
            from ..tools.secretary import _when
            try:
                due = _when(str(b["due"]))
            except ValueError as e:
                return h.json({"error": f"échéance : {e}"}, 400)
        tid = self.zeus.db.add_todo(text[:500], str(b.get("project") or "")[:80],
                                    max(1, min(3, int(b.get("priority") or 2))), due)
        return {"id": tid}

    def api_todo_update(self, h: "ZeusHandler", tid: str) -> Any:
        b = h.body_json()
        return {"ok": self.zeus.db.set_todo_done(int(tid), bool(b.get("done", True)))}

    def api_todo_delete(self, h: "ZeusHandler", tid: str) -> Any:
        return {"ok": self.zeus.db.delete_todo(int(tid))}

    def api_event_delete(self, h: "ZeusHandler", eid: str) -> Any:
        e = self.zeus.db.get_event(int(eid))
        if e and (e.get("source") or "").startswith("feed:"):
            return h.json({"error": "ce rendez-vous vient de Google ou d'Outlook : supprime-le là-bas"}, 409)
        if e and e.get("reminder_id"):
            self.zeus.db.delete_schedule(int(e["reminder_id"]))
        return {"ok": self.zeus.db.delete_event(int(eid))}

    # ------------------------------------------------------------------ API : bibliothèque de documents
    def api_kb(self, h: "ZeusHandler") -> Any:
        lib = self.zeus.library
        docs = self.zeus.db.kb_list_docs(h.query.get("q", ""), 2000)
        for d in docs:
            d["url"] = self.file_url(d["path"])
        return {**lib.summary(), "list": docs}

    def api_kb_search(self, h: "ZeusHandler") -> Any:
        q = (h.query.get("q") or "").strip()
        if not q:
            return {"hits": []}
        try:
            limit = max(1, min(50, int(h.query.get("limit") or 15)))
        except ValueError:
            limit = 15
        hits = self.zeus.library.search(q, limit, folder=h.query.get("folder", ""))
        for x in hits:
            x["url"] = self.file_url(x["path"]) + (f"#page={x['page']}" if x.get("page") else "")
        return {"hits": hits}

    def api_kb_doc(self, h: "ZeusHandler", did: str) -> Any:
        try:
            r = self.zeus.library.read(int(did), page=int(h.query.get("page") or 0), chunk=int(h.query.get("chunk") or 0),
                                       around=1)
        except ValueError as e:
            return h.json({"error": str(e)}, 404)
        return {"doc": {**r["doc"], "url": self.file_url(r["doc"]["path"])}, "text": r["text"]}

    def api_kb_folder_add(self, h: "ZeusHandler") -> Any:
        path = str(h.body_json().get("path") or "").strip()
        if not path:
            return h.json({"error": "indique le chemin d'un dossier"}, 400)
        try:
            where, new = self.zeus.library.add_folder(path)
        except ValueError as e:
            return h.json({"error": str(e)}, 400)
        self.zeus.library.index_async()
        return {"path": where, "new": new}

    def api_kb_folder_remove(self, h: "ZeusHandler") -> Any:
        return {"removed": self.zeus.library.remove_folder(str(h.body_json().get("path") or ""))}

    def api_kb_reindex(self, h: "ZeusHandler") -> Any:
        if h.body_json().get("force"):
            self.zeus.db.x("UPDATE kb_docs SET mtime=0")
        if self.zeus.library.state.get("running"):
            return {"started": False, "state": self.zeus.library.state}
        self.zeus.library.index_async()
        return {"started": True}

    def api_kb_upload(self, h: "ZeusHandler") -> Any:
        from ..kb import DOC_EXT
        name = urllib.parse.unquote(h.headers.get("X-Filename") or "document")
        name = re.sub(r"[^\w.\- ()]+", "_", Path(name).name)[:120] or "document"
        if Path(name).suffix.lower() not in DOC_EXT:
            return h.json({"error": f"format non pris en charge : {Path(name).suffix or '?'} (PDF, Word, PowerPoint, "
                                    f"Excel, texte…)"}, 415)
        n = int(h.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_UPLOAD:
            return h.json({"error": f"taille invalide (max {human_size(MAX_UPLOAD)})"}, 413)
        data = h.rfile.read(n)
        dest = self.zeus.library.inbox() / name
        i = 2
        while dest.exists():
            dest = dest.with_name(f"{Path(name).stem} ({i}){Path(name).suffix}")
            i += 1
        dest.write_bytes(data)
        res = self.zeus.library.index_file(dest)
        doc = self.zeus.db.one("SELECT * FROM kb_docs WHERE path=?", (str(dest),)) or {}
        self.zeus.bus.publish("kb_changed")
        return {"result": res, "doc": doc}

    # ------------------------------------------------------------------ API : agendas externes
    def _feed_url(self, h: "ZeusHandler") -> str:
        host = h.headers.get("Host") or f"127.0.0.1:{self.port}"
        scheme = "https" if self.zeus.config.get("web.https") else "http"
        return f"{scheme}://{host}/api/calendar/zeus-{self.zeus.calendars.feed_token()}.ics"

    def api_calendar(self, h: "ZeusHandler") -> Any:
        cs = self.zeus.calendars
        st = cs.status()
        return {"feeds": [{**f, "url": f["url"][:40] + "…", "status": st.get(f["id"])}
                          for f in cs.feeds()], "feed_url": self._feed_url(h),
                "sync_minutes": self.zeus.config.get("calendar.sync_minutes") or 15}

    def api_calendar_add(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        cs = self.zeus.calendars
        try:
            feed = cs.add_feed(str(b.get("url") or ""), str(b.get("name") or ""), int(b.get("remind") or 0))
        except (ValueError, TypeError) as e:
            return h.json({"error": str(e)}, 400)
        st = cs.sync(feed)
        if not st.get("ok"):
            cs.remove_feed(feed["id"])
            return h.json({"error": f"impossible de lire ce calendrier : {st.get('error')}"}, 400)
        return {"feed": {**feed, "url": feed["url"][:40] + "…"}, "status": st}

    def api_calendar_remove(self, h: "ZeusHandler", fid: str) -> Any:
        return {"ok": self.zeus.calendars.remove_feed(fid)}

    def api_calendar_sync(self, h: "ZeusHandler") -> Any:
        return {"results": self.zeus.calendars.sync_all()}

    def api_calendar_ics(self, h: "ZeusHandler", token: str) -> Any:
        """Flux .ics privé de l'agenda de ZEUS (lien secret) pour un téléphone, Thunderbird ou Outlook."""
        import datetime as _dt
        from ..tools.secretary import ics_text
        if not hmac.compare_digest(token, self.zeus.calendars.feed_token()):
            return h.json({"error": "lien invalide"}, 404)
        t0 = time.mktime(_dt.date.today().timetuple()) - 30 * 86400
        rows = [e for e in self.zeus.db.list_events(t0, t0 + 430 * 86400) if not e.get("source")]
        h._send(200, ics_text(rows, self.zeus.config.assistant_name).encode("utf-8"), "text/calendar; charset=utf-8",
                {"Cache-Control": "no-store"})
        return None

    def api_contact_delete(self, h: "ZeusHandler", cid: str) -> Any:
        return {"ok": self.zeus.db.delete_contact(int(cid))}

    def api_session_delete(self, h: "ZeusHandler", sid: str) -> Any:
        self.zeus.stop_run(sid)
        self.zeus.db.delete_session(sid)
        return {"ok": True}

    def api_session_stop(self, h: "ZeusHandler", sid: str) -> Any:
        return {"stopped": self.zeus.stop_run(sid)}

    def api_session_reply(self, h: "ZeusHandler", sid: str) -> Any:
        """Réponse manuelle d'un agent humain à un usager (prise de relais)."""
        s = self.zeus.db.get_session(sid)
        text = str(h.body_json().get("text") or "").strip()
        if not s or not text:
            return h.json({"error": "conversation ou message manquant"}, 400)
        ch = self.zeus.channels.get(s["channel"])
        if not ch:
            return h.json({"error": f"canal {s['channel']} non connecté"}, 400)
        ch.send(s["peer"], text, [])
        self.zeus.db.add_message(sid, {"role": "assistant", "content": text, "meta": {"manual": True}})
        self.zeus.db.audit("owner (web)", "réponse manuelle", {"session": sid, "text": truncate(text, 300)})
        return {"ok": True}

    def api_access(self, h: "ZeusHandler") -> Any:
        tok = self.zeus.config.get("web.token")
        lan = f"{self.scheme}://{lan_ip()}:{self.port}/?token={tok}"
        return {"token": tok, "local": f"{self.scheme}://127.0.0.1:{self.port}/?token={tok}",
                "lan": lan if self.host == "0.0.0.0" else "", "qr": qr_svg(lan) if self.host == "0.0.0.0" else ""}

    def api_chat(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        text = str(b.get("text") or "").strip()
        atts = [a for a in (b.get("attachments") or []) if Path(a).exists()]
        if not text and not atts:
            return h.json({"error": "message vide"}, 400)
        sid = b.get("session_id") or self.zeus.db.create_session("web", "owner", "owner")
        s = self.zeus.db.get_session(sid)
        if not s:
            sid = self.zeus.db.create_session("web", "owner", "owner")
        s = self.zeus.db.get_session(sid) or {}
        meta = s.get("meta") or {}
        if bool(meta.get("voice")) != bool(b.get("voice")) or b.get("brain") in ("max", "fast"):
            meta["voice"] = bool(b.get("voice"))  # réponse adaptée à l'oral seulement pour un message dicté
            if b.get("brain") in ("max", "fast"):
                meta["brain"] = b["brain"]
            self.zeus.db.update_session(sid, meta=meta)
        if b.get("mode") and not (meta.get("mode")):
            self._set_mode(sid, b["mode"])
        if text and not atts and self.zeus._answer_pending(sid, text):
            return {"session_id": sid, "status": "answered"}
        status = self.zeus.submit(sid, text, atts)
        return {"session_id": sid, "status": status}

    def api_upload(self, h: "ZeusHandler") -> Any:
        name = urllib.parse.unquote(h.headers.get("X-Filename") or "fichier")
        name = re.sub(r"[^\w.\- ()]+", "_", Path(name).name)[:120] or "fichier"
        n = int(h.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_UPLOAD:
            return h.json({"error": f"taille invalide (max {human_size(MAX_UPLOAD)})"}, 413)
        data = h.rfile.read(n)
        d = self.zeus.config.dir("uploads/web")
        dest = d / f"{int(time.time() * 1000)}_{name}"
        dest.write_bytes(data)
        return {"path": str(dest), "name": name, "size": human_size(n), "url": self.file_url(str(dest)),
                "image": is_image(name)}

    def api_file(self, h: "ZeusHandler") -> Any:
        p = Path(h.query.get("path", ""))
        if not p.is_file():
            return h.json({"error": "fichier introuvable"}, 404)
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        data = p.read_bytes()
        h.send_response(200)
        h.send_header("Content-Type", ctype)
        h.send_header("Content-Length", str(len(data)))
        disp = "inline" if ctype.startswith(("image/", "text/", "audio/", "video/")) or ctype == "application/pdf" else "attachment"
        if h.query.get("download"):
            disp = "attachment"
        h.send_header("Content-Disposition", f"{disp}; filename*=UTF-8''{urllib.parse.quote(p.name)}")
        h.send_header("Cache-Control", "private, max-age=60")
        h.end_headers()
        h.wfile.write(data)
        return None

    # ------------------------------------------------------------------ validations
    def api_approvals(self, h: "ZeusHandler") -> Any:
        st = h.query.get("status", "pending")
        return self.zeus.db.list_approvals("" if st == "all" else st, 200)

    def api_approval_decide(self, h: "ZeusHandler", aid: str) -> Any:
        b = h.body_json()
        ok = self.zeus.approvals.decide(int(aid), b.get("decision", "deny"), "web", str(b.get("answer") or ""))
        return {"ok": ok}

    # ------------------------------------------------------------------ dossiers
    def api_dossiers(self, h: "ZeusHandler") -> Any:
        rows = self.zeus.db.list_dossiers(status=h.query.get("status", ""), query=h.query.get("q", ""), limit=300)
        out = []
        for d in rows:
            try:
                c = self.zeus.dossiers.check(d["id"])
                d["missing"] = len(c["missing"])
                d["problems"] = len(c["problems"])
                d["received"] = len(c["received"])
                d["required"] = len(c["received"]) + len(c["missing"])
            except Exception:
                pass
            d["status_label"] = STATUS_LABELS.get(d["status"], d["status"])
            out.append(d)
        return {"dossiers": out, "counts": self.zeus.db.dossier_counts()}

    def api_dossier_new(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        d = self.zeus.dossiers.create(b.get("procedure") or "generique", b.get("applicant_name", ""),
                                      b.get("channel") or "manuel", b.get("contact", ""), actor="agent",
                                      notes=b.get("notes", ""))
        return d

    def api_dossier_get(self, h: "ZeusHandler", did: str) -> Any:
        d = self.zeus.db.get_dossier(did)
        if not d:
            return h.json({"error": "dossier introuvable"}, 404)
        docs = self.zeus.db.list_documents(did)
        for x in docs:
            x["url"] = self.file_url(x["path"])
            x["image"] = is_image(x["path"])
            x["type_label"] = DOC_TYPES.get(x["doc_type"], {}).get("label", x["doc_type"])
            x["text"] = truncate(x.get("text") or "", 1500)
        events = self.zeus.db.list_dossier_events(did)
        drafts = [e for e in events if e["kind"] == "relance_brouillon"]
        return {"dossier": d, "documents": docs, "events": events, "check": self.zeus.dossiers.check(did),
                "procedure": self.zeus.dossiers.get_procedure(d["procedure"]),
                "draft": json.loads(drafts[-1]["detail"]).get("texte") if drafts else "",
                "status_label": STATUS_LABELS.get(d["status"], d["status"]),
                "can_message": d.get("channel") in self.zeus.channels}

    def api_dossier_update(self, h: "ZeusHandler", did: str) -> Any:
        b = h.body_json()
        eng = self.zeus.dossiers
        if b.get("status"):
            eng.set_status(did, b["status"], b.get("note", ""), actor="agent (web)", notify=bool(b.get("notify")))
        elif b.get("note"):
            d = self.zeus.db.get_dossier(did) or {}
            self.zeus.db.update_dossier(did, notes=(d.get("notes") or "") + "\n" + b["note"])
            self.zeus.db.add_dossier_event(did, "note", "agent (web)", {"note": b["note"]})
        for k in ("applicant_name", "contact", "procedure", "channel"):
            if k in b:
                self.zeus.db.update_dossier(did, **{k: b[k]})
        if "procedure" in b:
            pr = eng.get_procedure(b["procedure"])
            if pr:
                self.zeus.db.update_dossier(did, title=pr["name"])
            eng.refresh_status(did, "agent (web)")
        self.zeus.bus.publish("dossier_update", id=did)
        return self.api_dossier_get(h, did)

    def api_dossier_relance(self, h: "ZeusHandler", did: str) -> Any:
        b = h.body_json()
        ok, text = self.zeus.dossiers.relance(did, send=bool(b.get("send")), custom=b.get("message", ""),
                                              actor="agent (web)")
        return {"sent": ok, "text": text}

    def api_dossier_attach(self, h: "ZeusHandler", did: str) -> Any:
        b = h.body_json()
        doc = self.zeus.dossiers.attach(did, b["path"], b.get("name", ""), actor="agent (web)")
        return doc

    def api_dossier_export(self, h: "ZeusHandler", did: str) -> Any:
        f = self.zeus.dossiers.export(did)
        h.query["path"] = str(f)
        h.query["download"] = "1"
        return self.api_file(h)

    def api_document_update(self, h: "ZeusHandler", doc_id: str) -> Any:
        b = h.body_json()
        doc = self.zeus.db.get_document(int(doc_id))
        if not doc:
            return h.json({"error": "pièce introuvable"}, 404)
        if b.get("doc_type") in DOC_TYPES:
            self.zeus.db.update_document(int(doc_id), doc_type=b["doc_type"], confidence=1.0, status="ok")
            self.zeus.db.add_dossier_event(doc["dossier_id"], "reclassement", "agent (web)",
                                           {"doc": int(doc_id), "type": b["doc_type"]})
        if "problem" in b:
            self.zeus.db.update_document(int(doc_id), problem=str(b["problem"]), status="a_verifier" if b["problem"] else "ok")
        self.zeus.dossiers.refresh_status(doc["dossier_id"], "agent (web)")
        self.zeus.bus.publish("dossier_update", id=doc["dossier_id"])
        return {"ok": True}

    def api_procedures(self, h: "ZeusHandler") -> Any:
        return {"procedures": list(self.zeus.dossiers.procedures().values()),
                "doc_types": {k: v["label"] for k, v in DOC_TYPES.items()}}

    def api_procedure_save(self, h: "ZeusHandler") -> Any:
        return self.zeus.dossiers.save_procedure(h.body_json())

    def api_procedure_delete(self, h: "ZeusHandler", pid: str) -> Any:
        f = self.zeus.dossiers.custom_dir / f"{pid}.json"
        if f.exists():
            f.unlink()
            self.zeus.dossiers.load_procedures()
            return {"ok": True}
        return h.json({"error": "seules les démarches personnalisées peuvent être supprimées"}, 400)

    # ------------------------------------------------------------------ mémoire & compétences
    def api_memories(self, h: "ZeusHandler") -> Any:
        return self.zeus.db.list_memories(300, h.query.get("q", ""))

    def api_memory_add(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        mid, created = self.zeus.db.add_memory(str(b.get("content", "")), b.get("kind") or "fait", "",
                                               int(b.get("importance") or 3), source="web")
        return {"id": mid, "created": created}

    def api_memory_update(self, h: "ZeusHandler", mid: str) -> Any:
        b = h.body_json()
        self.zeus.db.update_memory(int(mid), str(b.get("content", "")), b.get("kind"),
                                   int(b["importance"]) if b.get("importance") else None)
        return {"ok": True}

    def api_memory_delete(self, h: "ZeusHandler", mid: str) -> Any:
        return {"ok": self.zeus.db.delete_memory(int(mid))}

    def api_skills(self, h: "ZeusHandler") -> Any:
        return self.zeus.db.list_skills()

    def api_skill_save(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        from ..tools.brain import write_skill_file
        name = re.sub(r"[^a-z0-9_]+", "_", str(b.get("name", "")).lower()).strip("_") or "competence"
        self.zeus.db.upsert_skill(name, str(b.get("description", "")), str(b.get("content", "")), source="web")
        write_skill_file(self.zeus, name, str(b.get("description", "")), str(b.get("content", "")))
        return {"ok": True, "name": name}

    def api_skill_delete(self, h: "ZeusHandler", name: str) -> Any:
        import shutil
        from ..util import slugify
        d = self.zeus.config.dir("skills") / slugify(name)
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
        return {"ok": self.zeus.db.delete_skill(name)}

    def api_skill_install(self, h: "ZeusHandler") -> Any:
        from ..tools.brain import install_skill_from_url
        b = h.body_json()
        url = str(b.get("url") or "").strip()
        if not url:
            return h.json({"error": "lien manquant"}, 400)
        r = install_skill_from_url(self.zeus, url, bool(b.get("force")))
        return r if r.get("ok") or r.get("blocked") else h.json(r, 400)

    # ------------------------------------------------------------------ déclencheurs (surveillance du téléphone)
    def api_triggers(self, h: "ZeusHandler") -> Any:
        return {"triggers": self.zeus.db.list_triggers(), "watcher": self.zeus.watcher.status()}

    def _trigger_fields(self, b: dict) -> dict:
        f: dict[str, Any] = {}
        for k in ("name", "app", "sender", "contains", "prompt"):
            if k in b:
                f[k] = str(b.get(k) or "").strip()[:500]
        if "action" in b:
            f["action"] = "agent" if b.get("action") == "agent" else "notify"
        if "cooldown" in b:
            try:
                f["cooldown"] = max(0, int(b.get("cooldown") or 0))
            except (TypeError, ValueError):
                f["cooldown"] = 60
        if "enabled" in b:
            f["enabled"] = 1 if b.get("enabled") else 0
        return f

    def api_trigger_add(self, h: "ZeusHandler") -> Any:
        f = self._trigger_fields(h.body_json())
        if not (f.get("app") or f.get("sender") or f.get("contains")):
            return h.json({"error": "indique au moins une condition (appli, expéditeur ou mots)"}, 400)
        if f.get("action") == "agent" and not f.get("prompt"):
            return h.json({"error": "pour « ZEUS agit », écris ce qu'il doit faire"}, 400)
        tid = self.zeus.db.add_trigger(f.get("name") or "Déclencheur", f.get("app", ""), f.get("sender", ""),
                                       f.get("contains", ""), f.get("action", "notify"), f.get("prompt", ""), "owner",
                                       int(f.get("cooldown", 60)))
        self.zeus.watcher.start()
        self.zeus.bus.publish("trigger_changed", id=tid)
        return {"ok": True, "id": tid}

    def api_trigger_update(self, h: "ZeusHandler", tid: str) -> Any:
        if not self.zeus.db.get_trigger(int(tid)):
            return h.json({"error": "introuvable"}, 404)
        f = self._trigger_fields(h.body_json())
        if f:
            self.zeus.db.update_trigger(int(tid), **f)
        self.zeus.bus.publish("trigger_changed", id=int(tid))
        return {"ok": True}

    def api_trigger_test(self, h: "ZeusHandler", tid: str) -> Any:
        t = self.zeus.db.get_trigger(int(tid))
        if not t:
            return h.json({"error": "introuvable"}, 404)
        from ..watcher import APP_ALIASES
        app = (t.get("app") or "").split("|")[0].strip()
        pkg = (APP_ALIASES.get(app.lower()) or (app or "com.exemple",))[0]
        sample = {"app": pkg, "title": (t.get("sender") or "Test").split("|")[0].strip(),
                  "text": "[test] " + ((t.get("contains") or "").split("|")[0].strip() or "notification d'essai")}
        self.zeus.watcher.fire(t, sample)
        return {"ok": True, "event": sample}

    def api_trigger_delete(self, h: "ZeusHandler", tid: str) -> Any:
        ok = self.zeus.db.delete_trigger(int(tid))
        self.zeus.bus.publish("trigger_changed", id=int(tid))
        return {"ok": ok}

    # ------------------------------------------------------------------ brief du matin
    def api_brief(self, h: "ZeusHandler") -> Any:
        from .. import brief
        return brief.status(self.zeus)

    def api_brief_action(self, h: "ZeusHandler") -> Any:
        from .. import brief
        b = h.body_json()
        act = b.get("action") or "run"
        if b.get("city") is not None:
            self.zeus.config.set("owner.city", str(b.get("city") or "").strip()[:80])
        if act == "run":
            sid = self.zeus.db.create_session("web", "owner", "owner", title="☀️ Brief du matin")
            self.zeus.submit(sid, brief.prompt(self.zeus))
            return {"ok": True, "session_id": sid}
        if act == "schedule":
            try:
                return brief.schedule(self.zeus, str(b.get("time") or "07:00"), bool(b.get("enabled", True)))
            except ValueError as e:
                return h.json({"error": str(e)}, 400)
        if act == "unschedule":
            brief.unschedule(self.zeus)
            return brief.status(self.zeus)
        return h.json({"error": "action inconnue"}, 400)

    # ------------------------------------------------------------------ ZEUS serveur MCP
    def api_mcp_server(self, h: "ZeusHandler") -> Any:
        import sys
        from ..mcp_server import MCPServer, client_config
        root = Path(__file__).resolve().parent.parent.parent
        conf = client_config(sys.executable, str(root / "zeus.py"))
        default_home = (root / "data").resolve()
        if self.zeus.home != default_home:
            conf["mcpServers"]["zeus"]["args"] += ["--home", str(self.zeus.home)]
        srv = MCPServer(self.zeus)
        return {"config": conf, "tools": [t["name"] for t in srv.tool_list()],
                "toolsets": self.zeus.config.get("mcp_server.toolsets") or [],
                "approval": self.zeus.config.get("mcp_server.approval") or "host"}

    # ------------------------------------------------------------------ tâches
    def api_tasks(self, h: "ZeusHandler") -> Any:
        from ..scheduler import describe_spec
        rows = self.zeus.db.list_schedules()
        for r in rows:
            r["when"] = describe_spec(r["spec"])
        return rows

    def api_task_add(self, h: "ZeusHandler") -> Any:
        from ..scheduler import parse_schedule
        b = h.body_json()
        try:
            spec, nxt = parse_schedule(str(b.get("when", "")))
        except ValueError as e:
            return h.json({"error": str(e)}, 400)
        sid = self.zeus.db.add_schedule(str(b.get("name") or b.get("prompt", ""))[:80], str(b.get("prompt", "")), spec,
                                        nxt, kind="reminder" if b.get("kind") == "rappel" else "agent")
        return {"id": sid, "spec": spec, "next_run": nxt}

    def api_task_update(self, h: "ZeusHandler", tid: str) -> Any:
        b = h.body_json()
        s = self.zeus.db.get_schedule(int(tid))
        if not s:
            return h.json({"error": "introuvable"}, 404)
        if "enabled" in b:
            from ..scheduler import next_run
            en = 1 if b["enabled"] else 0
            nxt = s["next_run"]
            if en and not nxt:
                try:
                    nxt = next_run(s["spec"])
                except ValueError:
                    nxt = None
            self.zeus.db.update_schedule(int(tid), enabled=en, next_run=nxt)
        return {"ok": True}

    def api_task_run(self, h: "ZeusHandler", tid: str) -> Any:
        return {"ok": self.zeus.scheduler.run_now(int(tid))}

    def api_task_delete(self, h: "ZeusHandler", tid: str) -> Any:
        return {"ok": self.zeus.db.delete_schedule(int(tid))}

    def api_audit(self, h: "ZeusHandler") -> Any:
        return self.zeus.db.list_audit(int(h.query.get("limit", 300)), h.query.get("q", ""))

    # ------------------------------------------------------------------ réglages
    def api_config(self, h: "ZeusHandler") -> Any:
        return redact(self.zeus.config.data)

    def api_config_save(self, h: "ZeusHandler") -> Any:
        patch = h.body_json()
        cur = self.zeus.config.data

        def keep_secrets(new: Any, old: Any) -> Any:
            if isinstance(new, dict):
                out = {}
                for k, v in new.items():
                    o = old.get(k) if isinstance(old, dict) else None
                    if isinstance(v, str) and v.startswith("••••") and any(s in k.lower() for s in SECRET_KEYS):
                        out[k] = o
                    else:
                        out[k] = keep_secrets(v, o)
                return out
            if isinstance(new, list) and isinstance(old, list) and all(isinstance(x, dict) for x in new):
                res = []
                for i, item in enumerate(new):
                    match = next((o for o in old if isinstance(o, dict) and o.get("id") == item.get("id")), None)
                    res.append(keep_secrets(item, match or (old[i] if i < len(old) else {})))
                return res
            return new

        patch = keep_secrets(patch, cur)
        if isinstance(patch.get("web"), dict) and not patch["web"].get("token"):
            patch["web"].pop("token", None)
        for k, v in patch.items():
            if isinstance(v, list) or k in ("mcp_servers",):
                self.zeus.config.set(k, v, save=False)
            elif isinstance(v, dict):
                self.zeus.config.update({k: v}, save=False)
            else:
                self.zeus.config.set(k, v, save=False)
        self.zeus.config.save()
        self.zeus.router.reload()
        if any(k in patch for k in ("telegram", "whatsapp", "email", "sms", "owner")):
            threading.Thread(target=self.zeus.start_channels, daemon=True).start()
        if "mcp_servers" in patch:
            self.zeus.mcp.reload()
        self.zeus.phone._status_cache = (0.0, {})
        return {"ok": True, "config": redact(self.zeus.config.data)}

    def api_model_test(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        return self.zeus.router.test(b.get("id", ""))

    def api_models_preset(self, h: "ZeusHandler") -> Any:
        from ..llm import apply_claude_preset
        b = h.body_json()
        key = str(b.get("api_key") or "").strip()
        if not key:
            cur = next((m for m in self.zeus.config.get("models") or [] if m.get("provider") == "anthropic"
                        and m.get("api_key")), None)
            key = cur["api_key"] if cur else ""
        if not key:
            return h.json({"error": "colle ta clé API Claude (elle commence par sk-ant-)"}, 400)
        budget = b.get("budget")
        try:
            budget = float(budget) if budget not in (None, "") else None
        except (TypeError, ValueError):
            return h.json({"error": "plafond invalide"}, 400)
        ids = apply_claude_preset(self.zeus.config, key, str(b.get("workspace_id") or "").strip(), budget)
        self.zeus.router.reload()
        test = self.zeus.router.test("claude") if b.get("test", True) else {}
        self.zeus.db.audit("owner (web)", "préréglage puissance maximale", {"models": ids, "test_ok": test.get("ok")})
        return {"ok": True, "models": ids, "test": test, "config": redact(self.zeus.config.data)}

    def api_models_groq(self, h: "ZeusHandler") -> Any:
        from ..llm import LLMError, apply_groq_preset
        b = h.body_json()
        key = str(b.get("api_key") or "").strip()
        if not key:
            return h.json({"error": "colle ta clé Groq (elle commence par gsk_)"}, 400)
        try:
            res = apply_groq_preset(self.zeus.config, key)
        except LLMError as e:
            return h.json({"error": str(e.args[0])}, 400)
        self.zeus.router.reload()
        test = self.zeus.router.test("groq") if b.get("test", True) else {}
        self.zeus.db.audit("owner (web)", "préréglage Groq", {**res, "test_ok": test.get("ok")})
        return {"ok": True, **res, "test": test, "config": redact(self.zeus.config.data)}

    def api_models_free(self, h: "ZeusHandler") -> Any:
        """2e cerveau en ligne gratuit (Cerebras ou Gemini), après Groq dans l'ordre de secours."""
        from ..llm import FREE_PROVIDERS, LLMError, apply_free_preset
        b = h.body_json()
        provider = str(b.get("provider") or "").strip().lower()
        key = str(b.get("api_key") or "").strip()
        if provider not in FREE_PROVIDERS:
            return h.json({"error": "choisis Cerebras ou Gemini"}, 400)
        if not key:
            return h.json({"error": f"colle ta clé {FREE_PROVIDERS[provider]['label']}"}, 400)
        try:
            res = apply_free_preset(self.zeus.config, provider, key)
        except LLMError as e:
            return h.json({"error": str(e.args[0])}, 400)
        self.zeus.router.reload()
        test = self.zeus.router.test(provider) if b.get("test", True) else {}
        self.zeus.db.audit("owner (web)", "2e cerveau gratuit", {**res, "test_ok": test.get("ok")})
        return {"ok": True, **res, "test": test, "config": redact(self.zeus.config.data)}

    def api_system(self, h: "ZeusHandler") -> Any:
        """Relevés de la machine pour l'interface spatiale : processeur, mémoire, disque (aucune donnée inventée)."""
        return self.zeus.sysstats.snapshot()

    def api_usage(self, h: "ZeusHandler") -> Any:
        return self.zeus.costs.status()

    def api_models_discover(self, h: "ZeusHandler") -> Any:
        from ..llm import PRESETS, list_ollama_models
        return {"ollama": list_ollama_models(), "presets": PRESETS}

    # ------------------------------------------------------------------ téléphone
    def api_phone_status(self, h: "ZeusHandler") -> Any:
        return self.zeus.phone.status()

    def api_phone_screen(self, h: "ZeusHandler") -> Any:
        ph = self.zeus.phone
        latest = self.zeus.config.dir("phone") / "latest.png"
        with self._shot_lock:
            if h.query.get("fresh") and time.time() - self._last_shot > 0.8 and ph.connected():
                try:
                    ph.screenshot()
                    self._last_shot = time.time()
                except Exception as e:  # noqa: BLE001
                    return h.json({"error": str(e)}, 503)
        if not latest.exists():
            return h.json({"error": "aucune capture"}, 404)
        data = latest.read_bytes()
        h.send_response(200)
        h.send_header("Content-Type", "image/png")
        h.send_header("Content-Length", str(len(data)))
        h.send_header("Cache-Control", "no-store")
        h.end_headers()
        h.wfile.write(data)
        return None

    def api_phone_elements(self, h: "ZeusHandler") -> Any:
        ph = self.zeus.phone
        if h.query.get("fresh") and ph.connected():
            try:
                ph.read_screen()
            except Exception as e:  # noqa: BLE001
                return h.json({"error": str(e)}, 503)
        try:
            w, h2 = ph.screen_size() if ph.connected() else (0, 0)
        except Exception:
            w, h2 = 0, 0
        return {"elements": [{k: e[k] for k in ("i", "label", "x", "y", "bounds", "clickable", "editable")}
                             for e in ph.elements], "pkg": ph.last_pkg, "width": w, "height": h2}

    def api_phone_action(self, h: "ZeusHandler") -> Any:
        ph = self.zeus.phone
        b = h.body_json()
        a = b.get("action")
        try:
            if a == "tap":
                ph.tap(int(b["x"]), int(b["y"]))
            elif a == "swipe":
                ph.swipe(int(b["x1"]), int(b["y1"]), int(b["x2"]), int(b["y2"]), int(b.get("ms") or 350))
            elif a == "key":
                ph.key(str(b["key"]))
            elif a == "text":
                ph.type_text(str(b["text"]))
            elif a == "open_app":
                ph.open_app(str(b["name"]))
            elif a == "wake":
                ph.wake()
            else:
                return h.json({"error": "action inconnue"}, 400)
        except Exception as e:  # noqa: BLE001
            return h.json({"error": str(e)}, 400)
        self.zeus.db.audit("owner (web)", f"téléphone {a}", {k: v for k, v in b.items() if k != "text"})
        return {"ok": True}

    def _owner_ctx(self) -> Any:
        from ..tools import ToolContext
        return ToolContext(self.zeus, self.zeus.db.get_session(self.zeus.owner_session()) or {"trust": "owner"})

    def api_phone_settings(self, h: "ZeusHandler") -> Any:
        ph = self.zeus.phone
        if not ph.connected():
            return h.json({"error": "aucun téléphone connecté"}, 503)
        try:
            return {"settings": ph.read_settings()}
        except Exception as e:  # noqa: BLE001
            return h.json({"error": str(e)}, 503)

    def api_phone_setting_set(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        res = self.zeus.registry.execute(self._owner_ctx(), "phone_settings",
                                         {"setting": str(b.get("setting") or ""), "value": str(b.get("value") or "")})
        self.zeus.db.audit("owner (web)", "téléphone : réglage", {"setting": b.get("setting"), "value": b.get("value"),
                                                                 "ok": not res.error})
        return {"ok": not res.error, "text": res.text} if not res.error else h.json({"error": res.text}, 400)

    def api_phone_alarm(self, h: "ZeusHandler") -> Any:
        b = h.body_json()
        args = {k: b[k] for k in ("kind", "time", "days", "seconds", "label") if k in b}
        res = self.zeus.registry.execute(self._owner_ctx(), "phone_alarm", args)
        self.zeus.db.audit("owner (web)", "téléphone : alarme", {**args, "ok": not res.error})
        return {"ok": not res.error, "text": res.text} if not res.error else h.json({"error": res.text}, 400)

    def api_transcribe(self, h: "ZeusHandler") -> Any:
        n = int(h.headers.get("Content-Length") or 0)
        if n <= 0 or n > 25_000_000:
            return h.json({"error": "audio invalide"}, 400)
        name = re.sub(r"[^\w.\-]+", "_", h.headers.get("X-Filename") or "voix.webm")
        d = self.zeus.config.dir("uploads/voice")
        f = d / f"{int(time.time() * 1000)}_{name}"
        f.write_bytes(h.rfile.read(n))
        text = self.zeus.transcribe(str(f))
        if text is None:
            return h.json({"error": "transcription non configurée (Réglages → Voix)"}, 501)
        return {"text": text}

    def api_tools(self, h: "ZeusHandler") -> Any:
        return [{"name": t.name, "description": t.description, "toolset": t.toolset, "risk": t.risk,
                 "trust": list(t.trust)} for t in self.zeus.registry.tools.values()]

    # ------------------------------------------------------------------ WhatsApp
    def wa_verify(self, h: "ZeusHandler") -> Any:
        ch = self.zeus.channels.get("whatsapp")
        res = ch.verify(h.query) if ch else None
        if res is None:
            return h.json({"error": "vérification refusée"}, 403)
        return h.text(res)

    def wa_post(self, h: "ZeusHandler") -> Any:
        ch = self.zeus.channels.get("whatsapp")
        n = int(h.headers.get("Content-Length") or 0)
        raw = h.rfile.read(n) if n else b""
        if not ch:
            return h.json({"error": "WhatsApp désactivé"}, 404)
        if not ch.check_signature(raw, h.headers.get("X-Hub-Signature-256", "")):
            return h.json({"error": "signature invalide"}, 403)
        try:
            ch.handle_webhook(json.loads(raw.decode("utf-8")))
        except Exception as e:  # noqa: BLE001
            log.warning("webhook WhatsApp : %s", e)
        return {"ok": True}


class ZeusHandler(BaseHTTPRequestHandler):
    web: WebServer
    server_version = "ZEUS"
    sys_version = ""

    def log_message(self, fmt: str, *args: Any) -> None:
        log.debug("web %s - %s", self.address_string(), fmt % args)

    # ------------------------------------------------------------------ utilitaires
    def authed(self) -> bool:
        tok = str(self.web.zeus.config.get("web.token") or "")
        if not tok:
            return False
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer ") and hmac.compare_digest(auth[7:].strip(), tok):
            return True
        if hmac.compare_digest(self.headers.get("X-Zeus-Token", ""), tok):
            return True
        c = cookies.SimpleCookie()
        try:
            c.load(self.headers.get("Cookie", ""))
        except cookies.CookieError:
            return False
        v = c.get("zeus_session")
        return bool(v and hmac.compare_digest(v.value, tok))

    def body_json(self) -> dict:
        if hasattr(self, "_body_cache"):
            return self._body_cache
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            self._body_cache = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            self._body_cache = {}
        return self._body_cache

    def _send(self, code: int, data: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        if getattr(self, "set_cookie", None):
            self.send_header("Set-Cookie", self.set_cookie)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def json(self, obj: Any, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8"),
                   "application/json; charset=utf-8", {"Cache-Control": "no-store"})
        return None

    def text(self, s: str, code: int = 200) -> None:
        self._send(code, s.encode("utf-8"), "text/plain; charset=utf-8")

    # ------------------------------------------------------------------ dispatch
    def _dispatch(self, method: str) -> None:
        parsed = urllib.parse.urlparse(self.path)
        self.query = {k: v[-1] for k, v in urllib.parse.parse_qs(parsed.query).items()}
        path = parsed.path
        self.set_cookie = None
        try:
            if path.startswith("/api/") or path.startswith("/webhook/"):
                for r in self.web.routes:
                    if r.method != method:
                        continue
                    m = r.re.match(path)
                    if not m:
                        continue
                    if r.auth and not self.authed():
                        return self.json({"error": "non connecté"}, 401)
                    res = r.fn(self, *m.groups())
                    if res is not None:
                        self.json(res)
                    return
                return self.json({"error": "route inconnue"}, 404)
            if method != "GET":
                return self.json({"error": "méthode non autorisée"}, 405)
            return self._static(path)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as e:  # noqa: BLE001
            log.exception("API %s %s", method, path)
            try:
                self.json({"error": f"{type(e).__name__} : {e}"}, 500)
            except Exception:
                pass

    def _static(self, path: str) -> None:
        if path in ("/", "/index.html"):
            tok = self.query.get("token")
            if tok and hmac.compare_digest(tok, str(self.web.zeus.config.get("web.token"))):
                self.set_cookie = f"zeus_session={tok}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Strict"
                return self._send(302, b"", "text/plain", {"Location": "/"})
            path = "/index.html"
        f = (UI_DIR / path.lstrip("/")).resolve()
        if UI_DIR not in f.parents or not f.is_file():
            f = UI_DIR / "index.html"
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        if f.suffix == ".js":
            ctype = "application/javascript"
        if f.suffix == ".webmanifest":
            ctype = "application/manifest+json"
        data = f.read_bytes()
        self._send(200, data, ctype + ("; charset=utf-8" if ctype.startswith(("text/", "application/javascript")) else ""),
                   {"Cache-Control": "no-cache"})

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch("PUT")

    def do_PATCH(self) -> None:  # noqa: N802
        self._dispatch("PATCH")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch("GET")


__all__ = ["WebServer", "lan_ip"]
