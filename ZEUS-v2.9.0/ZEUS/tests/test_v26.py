"""Tests de la version 2.6 : mini-cerveau local, préchauffage, arrêt immédiat, réflexes sans IA, 2e cerveau gratuit."""

from __future__ import annotations

import json
import select
import socket
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from test_zeus import LLM, Base  # noqa: E402
from test_phase1 import MODELS, make_router  # noqa: E402
import zeuscore.llm as L  # noqa: E402

OFFLINE = {"id": "groq", "provider": "openai", "base_url": "http://127.0.0.1:9/v1", "model": "llama-3.3-70b",
           "api_key": "k", "local": False}


def local_model(mid="local"):
    return {"id": mid, "provider": "ollama", "base_url": f"http://127.0.0.1:{LLM.port}", "model": "faux"}


def chat_requests(since=0, warm=False):
    return [r for r in LLM.requests[since:] if r["path"].endswith("/api/chat")
            and ((r["body"].get("stream") is False) == warm)]


# =========================================================================== requête du mini-cerveau
class TestMiniBrainRequest(Base):
    def session(self, mode=None):
        sid = self.z.db.create_session("web", "owner", "owner", meta={"mode": mode} if mode else None)
        self.z.db.add_message(sid, {"role": "user", "content": "Yesterday I have went to the cinema"})
        self.z.db.add_message(sid, {"role": "assistant", "content": "Nice! What did you watch?\n\n✏️ Corrections\n"
                                                                    "- « have went » → « went » : prétérit"})
        self.z.db.add_message(sid, {"role": "user", "content": "[Rappel automatique]", "meta": {"auto": True}})
        self.z.db.add_message(sid, {"role": "user", "content": "We watch a movie about a dog"})
        return sid

    def test_two_messages_short_history_no_tools(self):
        from zeuscore import minibrain
        sid = self.session()
        msgs, tools = minibrain.build(self.z, sid)
        self.assertIsNone(tools)
        self.assertEqual([m["role"] for m in msgs], ["system", "user"])
        self.assertIn("MODE SECOURS", msgs[0]["content"])
        self.assertIn("Daniella", msgs[0]["content"])
        body = msgs[1]["content"]
        self.assertIn("Yesterday I have went", body)          # échange précédent, pour le contexte
        self.assertIn("What did you watch?", body)
        self.assertNotIn("Corrections", body)                  # section de corrections retirée
        self.assertNotIn("Rappel automatique", body)
        self.assertTrue(body.rstrip().endswith("We watch a movie about a dog"))
        self.assertLess(minibrain.size(self.z, sid), 700)

    def test_system_is_stable_from_one_message_to_the_next(self):
        from zeuscore import minibrain
        sid = self.session({"id": "prof_langue", "lang": "en", "level": "B1"})
        first = minibrain.build(self.z, sid)[0][0]["content"]
        self.z.db.add_message(sid, {"role": "assistant", "content": "Which dog?"})
        self.z.db.add_message(sid, {"role": "user", "content": "A big dog who save his family"})
        msgs, _ = minibrain.build(self.z, sid)
        self.assertEqual(msgs[0]["content"], first)
        self.assertIn("professeur d'anglais", first)
        self.assertIn("✏️ Corrections", first)
        self.assertIn("prétérit obligatoire", first)          # notes de langue gardées
        self.assertLess(minibrain.size(self.z, sid), 1200)    # au lieu de 4 000 à 6 000

    def test_roles_and_tool_results(self):
        from zeuscore import minibrain
        sid = self.z.db.create_session("web", "owner", "owner", meta={"mode": {"id": "interprete", "lang": "fr",
                                                                                "lang2": "en"}})
        self.z.db.add_message(sid, {"role": "user", "content": "Bonjour"})
        self.assertIn("interprète entre français et anglais", minibrain.build(self.z, sid)[0][0]["content"])
        sid = self.z.db.create_session("web", "owner", "owner")
        self.z.db.add_message(sid, {"role": "user", "content": "Quel temps fait-il à Kinshasa ?"})
        self.z.db.add_message(sid, {"role": "assistant", "content": "", "tool_calls": [
            {"id": "t1", "name": "web_search", "arguments": {"query": "météo Kinshasa"}}]})
        self.z.db.add_message(sid, {"role": "tool", "tool_call_id": "t1", "name": "web_search",
                                    "content": "Kinshasa : 31 °C, orages en soirée"})
        body = minibrain.build(self.z, sid)[0][1]["content"]
        self.assertIn("31 °C", body)
        self.assertIn("Résultats déjà obtenus", body)


# =========================================================================== routeur
class TestRouterStandIn(unittest.TestCase):
    LEAN = ([{"role": "system", "content": "consignes courtes"}, {"role": "user", "content": "bonjour"}], None)

    def run_router(self, models, cfg=None, fail=("groq", "groq-rapide")):
        r = make_router(models)
        for k, v in (cfg or {}).items():
            r.config.set(k, v, save=False)
        calls, notices = [], []

        def fake(h, msgs, tools, *a, **k):
            calls.append({"id": h.id, "msgs": msgs, "tools": tools, "lean": k.get("lean", False),
                          "max": a[3] if len(a) > 3 else None})
            if h.id in fail:
                raise L.LLMError("rate_limit", "limite du jour", retry_after=3600)
            return L.LLMResponse(text=f"réponse de {h.id}")
        r._call = fake
        full = [{"role": "system", "content": "consignes complètes " * 50}, {"role": "user", "content": "bonjour"}]
        resp = r.chat(full, [{"name": "remember", "description": "", "parameters": {}}], notice_cb=notices.append,
                      lean=lambda: self.LEAN)
        return resp, calls, notices

    def test_local_stand_in_gets_the_light_request(self):
        resp, calls, notices = self.run_router(MODELS)
        last = calls[-1]
        self.assertEqual(last["id"], "local")
        self.assertTrue(last["lean"])
        self.assertEqual(last["msgs"], self.LEAN[0])
        self.assertIsNone(last["tools"])
        self.assertLessEqual(last["max"], L.MINI_MAX_TOKENS)
        self.assertFalse(calls[0]["lean"])                    # Groq garde la requête complète
        self.assertTrue(any("Mini-cerveau local" in n for n in notices), notices)
        self.assertFalse(any("plusieurs minutes" in n for n in notices), notices)

    def test_local_brain_chosen_by_the_owner_keeps_the_full_request(self):
        models = [MODELS[2], MODELS[0]]                       # le local est le cerveau principal
        resp, calls, _ = self.run_router(models, fail=())
        self.assertEqual(calls[0]["id"], "local")
        self.assertFalse(calls[0]["lean"])
        self.assertIsNotNone(calls[0]["tools"])

    def test_only_local_models_keep_the_full_request(self):
        resp, calls, _ = self.run_router([MODELS[2]], fail=())
        self.assertFalse(calls[0]["lean"])

    def test_can_be_switched_off(self):
        resp, calls, notices = self.run_router(MODELS, cfg={"local.mini": False})
        self.assertFalse(calls[-1]["lean"])
        self.assertTrue(any("plusieurs minutes" in n for n in notices))

    def test_prewarms_while_waiting_for_internet(self):
        r = make_router(MODELS)
        warmed = []
        local = r.get("local")
        local.warm = lambda system: warmed.append(system) or True

        def fake(h, *a, **k):
            if not h.is_local:
                raise L.LLMError("connection", "getaddrinfo failed")
            return L.LLMResponse(text="ok")
        r._call = fake
        old = L.INTERNET_WAIT_BEFORE_LOCAL
        L.INTERNET_WAIT_BEFORE_LOCAL = 0
        try:
            r.chat([{"role": "user", "content": "bonjour"}], lean=lambda: self.LEAN)
        finally:
            L.INTERNET_WAIT_BEFORE_LOCAL = old
        end = time.time() + 2
        while not warmed and time.time() < end:
            time.sleep(0.05)
        self.assertEqual(warmed, ["consignes courtes"])

    def test_context_too_long_on_a_backup_moves_on(self):
        models = [MODELS[0], {"id": "cerebras", "provider": "openai", "base_url": "https://api.cerebras.ai/v1",
                              "model": "gpt-oss-120b", "api_key": "k"}, MODELS[2]]
        r = make_router(models)
        seen = []

        def fake(h, *a, **k):
            seen.append(h.id)
            if h.id == "groq":
                raise L.LLMError("rate_limit", "limite du jour", retry_after=3600)
            if h.id == "cerebras":
                raise L.LLMError("context_length", "context length exceeded")
            return L.LLMResponse(text="ok")
        r._call = fake
        self.assertEqual(r.chat([{"role": "user", "content": "x"}]).text, "ok")
        self.assertEqual(seen, ["groq", "cerebras", "local"])
        # sur le cerveau principal, l'erreur remonte : l'agent résume la conversation puis recommence
        r2 = make_router(models)
        r2._call = lambda h, *a, **k: (_ for _ in ()).throw(L.LLMError("context_length", "trop long"))
        with self.assertRaises(L.LLMError) as cm:
            r2.chat([{"role": "user", "content": "x"}])
        self.assertEqual(cm.exception.kind, "context_length")


# =========================================================================== préchauffage et appel léger (Ollama)
class TestWarmAndLeanCall(unittest.TestCase):
    def test_warm_then_light_call(self):
        h = L.ModelHandle(local_model())
        n = len(LLM.requests)
        system = "Tu es ZEUS en mode secours. " * 5
        self.assertTrue(h.warm(system))
        req = chat_requests(n, warm=True)[-1]["body"]
        self.assertEqual(req["options"], {"num_ctx": L.MINI_CONTEXT, "num_predict": 1})
        self.assertEqual(req["keep_alive"], L.MINI_KEEP_ALIVE)
        self.assertEqual(req["messages"][0], {"role": "system", "content": system})
        self.assertTrue(h.is_warm(system))
        self.assertFalse(h.warm(system))                       # déjà en mémoire : pas de 2e requête
        self.assertEqual(len(chat_requests(n, warm=True)), 1)
        self.assertFalse(h.is_warm(system + " autre"))
        # l'appel léger garde la même fenêtre de contexte (sinon Ollama recharge le modèle) et n'envoie aucun outil
        msgs = [{"role": "system", "content": system + "B"}, {"role": "user", "content": "Bonjour"}]
        resp = h.call(msgs, [{"name": "remember", "description": "", "parameters": {}}], None, None, 0.3, 200, lean=True)
        self.assertTrue(resp.lean)
        body = chat_requests(n)[-1]["body"]
        self.assertEqual(body["options"]["num_ctx"], L.MINI_CONTEXT)
        self.assertNotIn("tools", body)
        self.assertTrue(h.is_warm(system + "B"))

    def test_warm_is_ollama_only_and_fails_softly(self):
        self.assertFalse(L.ModelHandle({"id": "g", "provider": "openai", "base_url": "https://x/v1", "model": "m"})
                         .warm("x"))
        dead = L.ModelHandle({"id": "l", "provider": "ollama", "base_url": "http://127.0.0.1:9", "model": "m"})
        self.assertFalse(dead.warm("consignes"))
        self.assertFalse(dead.warming)


class _SlowOllama(BaseHTTPRequestHandler):
    """Un « modèle local » qui lit ses consignes pendant 10 s sans rien envoyer ; note quand ZEUS raccroche."""
    hung_up: list[float] = []

    def log_message(self, *a):
        pass

    def do_POST(self):  # noqa: N802
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        end = time.time() + 10
        while time.time() < end:
            r, _, _ = select.select([self.connection], [], [], 0.05)
            if r:
                try:
                    if self.connection.recv(1, socket.MSG_PEEK) == b"":
                        _SlowOllama.hung_up.append(time.time())
                        return
                except OSError:
                    _SlowOllama.hung_up.append(time.time())
                    return


class _QuietServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass


class TestStopCutsTheLocalModel(unittest.TestCase):
    def test_stop_during_the_silent_reading_phase(self):
        srv = _QuietServer(("127.0.0.1", 0), _SlowOllama)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            prov = L.OllamaProvider({"provider": "ollama", "base_url": f"http://127.0.0.1:{srv.server_address[1]}",
                                     "model": "lent"})
            cancel = threading.Event()
            box = {}

            def run():
                try:
                    prov.chat([{"role": "user", "content": "bonjour"}], None, None, cancel, 0.3, 50)
                except L.LLMError as e:
                    box["kind"] = e.kind
                box["t"] = time.time()
            t = threading.Thread(target=run)
            t.start()
            time.sleep(0.5)
            t0 = time.time()
            cancel.set()
            t.join(5)
            self.assertEqual(box.get("kind"), "cancelled")
            self.assertLess(box["t"] - t0, 2)
            end = time.time() + 3
            while not _SlowOllama.hung_up and time.time() < end:
                time.sleep(0.05)
            self.assertTrue(_SlowOllama.hung_up, "le serveur local n'a pas vu la déconnexion")
            self.assertLess(_SlowOllama.hung_up[-1] - t0, 2)
        finally:
            srv.shutdown()

    def test_already_cancelled(self):
        prov = L.OllamaProvider(local_model())
        ev = threading.Event()
        ev.set()
        with self.assertRaises(L.LLMError) as cm:
            prov.chat([{"role": "user", "content": "x"}], None, None, ev, 0.3, 10)
        self.assertEqual(cm.exception.kind, "cancelled")


# =========================================================================== de bout en bout dans ZEUS
class TestMiniBrainEndToEnd(Base):
    def setUp(self):
        super().setUp()
        self.z.config.set("models", [OFFLINE, local_model()])
        self.z.config.set("routing", {"default": "groq", "fallback": ["local"]})
        self.z.router.reload()
        self.old = L.INTERNET_WAIT_BEFORE_LOCAL
        L.INTERNET_WAIT_BEFORE_LOCAL = 0

    def tearDown(self):
        L.INTERNET_WAIT_BEFORE_LOCAL = self.old
        time.sleep(0.3)  # laisse finir le préchauffage lancé en arrière-plan
        super().tearDown()

    def test_internet_cut_light_local_answer(self):
        sid = self.z.owner_session()
        n = len(LLM.requests)
        res = self.z.chat(sid, "Raconte-moi une histoire courte")
        self.assertTrue(res.ok, res.text)
        body = chat_requests(n)[-1]["body"]
        self.assertEqual(len(body["messages"]), 2)
        self.assertIn("MODE SECOURS", body["messages"][0]["content"])
        self.assertNotIn("tools", body)
        self.assertEqual(body["options"]["num_ctx"], L.MINI_CONTEXT)
        last = [m for m in self.z.db.get_messages(sid) if m["role"] == "assistant"][-1]
        self.assertTrue(last["meta"].get("mini"))
        from zeuscore.channels.web import WebServer
        self.assertTrue(WebServer.ui_message(None, last)["mini"])

    def test_core_helpers(self):
        h = self.z.mini_brain_handle()
        self.assertEqual(h.id, "local")
        n = len(LLM.requests)
        self.assertTrue(self.z.prewarm_local())
        self.assertIn("MODE SECOURS", chat_requests(n, warm=True)[-1]["body"]["messages"][0]["content"])
        self.z.config.set("routing", {"default": "local", "fallback": ["groq"]})
        self.assertIsNone(self.z.mini_brain_handle())          # le local est le cerveau choisi : pas de secours

    def test_benchmark(self):
        from zeuscore.bench import run_minibrain_benchmark
        out = []
        rep = run_minibrain_benchmark(self.z, say=out.append)
        runs = rep["models"]["local"]["runs"]
        self.assertEqual(len(runs), 3)
        self.assertTrue(all(r["ok"] for r in runs), runs)
        self.assertIsNotNone(rep["models"]["local"]["warm"])
        self.assertTrue(any("objectif atteint" in line for line in out), out)
        self.assertFalse(self.z.db.find_session("web", "mesure-mini"))


# =========================================================================== réflexes sans IA
class TestReflexes(Base):
    def test_patterns(self):
        from zeuscore import reflexes
        s = {}
        a = reflexes.answer
        self.assertRegex(a(self.z, s, "Quelle heure est-il ?"), r"^Il est \d{1,2} h \d\d\.$")
        self.assertRegex(a(self.z, s, "ZEUS, on est quel jour ?"), r"^Nous sommes le \w+ \d{1,2} \w+ \d{4}\.$")
        self.assertEqual(a(self.z, s, "combien font 12 x 7 ?"), "12 x 7 = 84")
        self.assertEqual(a(self.z, s, "Calcule 15 % de 230"), "15 % de 230 = 34,5")
        self.assertEqual(a(self.z, s, "(3+4)*2"), "(3+4)×2 = 14")
        self.assertEqual(a(self.z, s, "7,5 + 2,25"), "7,5 + 2,25 = 9,75")
        self.assertEqual(a(self.z, s, "1/4="), "1/4 = 0,25")
        self.assertIn("zéro", a(self.z, s, "10/0="))
        for q in ("11:30", "3-1", "12/11", "2020", "Quelle heure est-il à Tokyo ?", "combien font les impôts ?",
                  "quelle heure pour le rendez-vous ?", "2**999999=", "Bonjour", "a" * 200):
            self.assertIsNone(a(self.z, s, q), q)

    def test_agenda(self):
        import datetime as dt
        from zeuscore import reflexes
        self.assertEqual(reflexes.answer(self.z, {}, "Qu'est-ce que j'ai demain ?"),
                         "Demain, rien de prévu dans ton agenda.")
        t = time.mktime((dt.date.today() + dt.timedelta(days=1)).timetuple()) + 15 * 3600
        self.z.db.add_event("Réunion budget", t, t + 3600, "Bureau")
        self.z.db.add_event("Le surlendemain", t + 86400, t + 90000)
        out = reflexes.answer(self.z, {}, "mes rendez-vous de demain")
        self.assertIn("15:00 : Réunion budget (Bureau)", out)
        self.assertNotIn("surlendemain", out)

    def test_roles_and_switch(self):
        from zeuscore import reflexes
        prof = {"meta": {"mode": {"id": "prof_langue", "lang": "en"}}}
        self.assertIsNone(reflexes.answer(self.z, prof, "What time is it?"))
        self.assertIsNone(reflexes.answer(self.z, {"meta": {"mode": {"id": "enseignant"}}}, "combien font 7 x 8 ?"))
        self.assertIsNotNone(reflexes.answer(self.z, {"meta": {"mode": {"id": "secretaire"}}}, "quelle heure est-il"))
        self.z.config.set("agent.reflexes", False)
        self.assertIsNone(reflexes.answer(self.z, {}, "quelle heure est-il"))

    def test_agent_answers_without_any_model(self):
        sid = self.z.owner_session()
        n = len(LLM.requests)
        res = self.z.chat(sid, "Combien font 6 x 7 ?")
        self.assertEqual(res.text, "6 x 7 = 42")
        self.assertEqual(len(LLM.requests), n)                # aucun modèle appelé
        last = [m for m in self.z.db.get_messages(sid) if m["role"] == "assistant"][-1]
        self.assertTrue(last["meta"]["reflex"])
        from zeuscore.channels.web import WebServer
        self.assertTrue(WebServer.ui_message(None, last)["reflex"])
        # une vraie question part au modèle
        self.z.chat(sid, "Bonjour ZEUS")
        self.assertGreater(len(LLM.requests), n)


# =========================================================================== 2e cerveau gratuit
class TestFreeSecondBrain(unittest.TestCase):
    def config(self, models, routing):
        from zeuscore.config import Config
        home = Path(tempfile.mkdtemp())
        (home / "zeus.json").write_text(json.dumps({"models": models, "routing": routing}), encoding="utf-8")
        return Config(home)

    def test_model_choice(self):
        P = L.pick_free_model
        self.assertEqual(P("gemini", ["models/gemini-2.5-flash", "models/gemini-2.5-flash-lite", "models/gemma-3-27b-it",
                                      "models/text-embedding-004", "models/gemini-2.5-flash-image"]),
                         "gemini-2.5-flash-lite")
        self.assertEqual(P("gemini", ["models/gemini-3.1-flash", "models/gemini-3.1-pro", "models/gemini-3.1-flash-lite"]),
                         "gemini-3.1-flash-lite")
        self.assertEqual(P("gemini", ["models/gemini-3.5-flash", "models/gemini-3.5-pro"]), "gemini-3.5-flash")
        self.assertEqual(P("cerebras", ["qwen-3.8-27b", "gpt-oss-120b", "llama3.1-8b"]), "gpt-oss-120b")
        self.assertEqual(P("cerebras", ["qwen-3.8-27b", "llama3.1-8b"]), "qwen-3.8-27b")

    def test_goes_right_after_groq_and_before_local(self):
        cfg = self.config(MODELS, {"default": "groq", "fast": "groq-rapide", "fallback": ["groq-rapide", "local"]})
        res = L.apply_free_preset(cfg, "cerebras", "env:CEREBRAS_API_KEY", available=["gpt-oss-120b"])
        self.assertEqual(res["model"], "gpt-oss-120b")
        self.assertEqual(cfg.get("routing.fallback"), ["groq-rapide", "cerebras", "local"])
        self.assertEqual([m["id"] for m in cfg.get("models")], ["groq", "groq-rapide", "cerebras", "local"])
        r = L.LLMRouter(cfg)
        self.assertEqual([h.id for h in r.order()], ["groq", "groq-rapide", "cerebras", "local"])
        self.assertFalse(cfg.get("routing.vision"))
        # Gemini voit les images : il devient le modèle vision s'il n'y en a pas
        L.apply_free_preset(cfg, "gemini", "AIzaTEST", available=["models/gemini-2.5-flash-lite"])
        self.assertEqual(cfg.get("routing.vision"), "gemini")
        r = L.LLMRouter(cfg)
        self.assertTrue(r.get("gemini").vision)
        self.assertEqual(r.order(need_vision=True)[0].id, "gemini")
        # réappliquer ne crée pas de doublon
        L.apply_free_preset(cfg, "cerebras", "k", available=["gpt-oss-120b"])
        self.assertEqual(cfg.get("routing.fallback").count("cerebras"), 1)
        self.assertEqual([m["id"] for m in cfg.get("models")].count("cerebras"), 1)

    def test_errors(self):
        cfg = self.config([], {})
        with self.assertRaises(L.LLMError):
            L.apply_free_preset(cfg, "inconnu", "k", available=["x"])
        with self.assertRaises(L.LLMError) as cm:
            L.apply_free_preset(cfg, "cerebras", "mauvaise", available=[])
        self.assertEqual(cm.exception.kind, "auth")
        with self.assertRaises(L.LLMError):
            L.apply_free_preset(cfg, "gemini", "k", available=["models/text-embedding-004"])
        # seul cerveau en ligne : il devient le principal
        L.apply_free_preset(cfg, "cerebras", "k", available=["gpt-oss-120b"])
        self.assertEqual(cfg.get("routing.default"), "cerebras")


class TestFreeSecondBrainWeb(Base):
    def test_route_validation(self):
        from test_v23 import WebMixin

        class W(WebMixin):
            pass
        w = W()
        w.z = self.z
        w.start_web()
        try:
            code, r = w.call("/api/models/free", {"provider": "autre", "api_key": "k"})
            self.assertEqual(code, 400)
            code, r = w.call("/api/models/free", {"provider": "gemini", "api_key": ""})
            self.assertEqual(code, 400)
            self.assertIn("Gemini", r["error"])
        finally:
            w.web.stop()
        js = (ROOT / "zeuscore" / "ui" / "app.js").read_text(encoding="utf-8")
        self.assertIn('"/api/models/free"', js)
        self.assertIn("réflexe instantané", js)
        self.assertIn("mini-cerveau local", js)


if __name__ == "__main__":
    unittest.main()


# =========================================================================== logo
class TestLogo(unittest.TestCase):
    UI = ROOT / "zeuscore" / "ui"

    def test_assets_are_valid_and_used(self):
        import xml.etree.ElementTree as ET
        for name in ("logo.svg", "icon.svg"):
            root = ET.fromstring((self.UI / name).read_text(encoding="utf-8"))
            self.assertTrue(root.tag.endswith("svg"), name)
            self.assertNotIn("http", (self.UI / name).read_text(encoding="utf-8").replace("http://www.w3.org/2000/svg", ""))
        html = (self.UI / "index.html").read_text(encoding="utf-8")
        for needle in ('src="/logo.svg"', 'src="/icon.svg"', 'href="/icon.svg"', 'href="/icon-192.png"'):
            self.assertIn(needle, html)
        self.assertNotIn("googleapis", html)
        self.assertNotIn("three.min.js", html)                 # aucune bibliothèque chargée depuis internet
        man = json.loads((self.UI / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual({i["src"] for i in man["icons"]}, {"/icon.svg", "/icon-192.png", "/icon-512.png"})
        for size in (192, 256, 512):
            data = (self.UI / f"icon-{size}.png").read_bytes()
            self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(int.from_bytes(data[16:20], "big"), size)

    def test_shortcut_icon_is_the_logo(self):
        import shutil
        import zeus
        tmp = Path(tempfile.mkdtemp())
        try:
            data = zeus.make_icon(tmp / "z.ico").read_bytes()
            self.assertEqual(data[22:], (self.UI / "icon-256.png").read_bytes())
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
