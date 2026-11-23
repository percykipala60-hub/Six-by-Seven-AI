"""Fiabilité des cerveaux en ligne : bascule, délais, réseau coupé, bouton Stop.

Un faux serveur « capricieux » imite les pannes réelles : serveur qui ne répond jamais, limite de requêtes (429),
connexion coupée au milieu d'une réponse.

    python -m unittest tests.test_fiabilite -v
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from zeuscore.llm import LLMError, LLMRouter, ModelHandle, ScriptedProvider  # noqa: E402

STOP = threading.Event()


def _sse_answer(text: str) -> bytes:
    chunks = [{"choices": [{"delta": {"content": text}}]},
              {"choices": [{"delta": {}, "finish_reason": "stop"}]}]
    return b"".join(b"data: " + json.dumps(c).encode() + b"\n\n" for c in chunks) + b"data: [DONE]\n\n"


class Capricieux(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"  # fin de réponse = fermeture de la connexion, comme un réseau qui coupe

    def log_message(self, *a) -> None:  # silence
        pass

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(n)
        mode = self.path.strip("/").split("/")[0]
        hits = self.server.hits  # type: ignore[attr-defined]
        hits[mode] = hits.get(mode, 0) + 1
        if mode == "hang":  # accepte la connexion mais ne répond jamais (réseau très lent ou coupé)
            STOP.wait(40)
            return
        if mode == "r429":
            body = b'{"error": {"message": "Rate limit reached"}}'
            self.send_response(429)
            self.send_header("Retry-After", "30")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if mode in ("r429court", "r429long") and (mode == "r429long" or hits[mode] % 2 == 1):
            # Groq gratuit : « réessaie dans 6,5 s » (limite de jetons par minute), puis ça repasse
            wait = "600" if mode == "r429long" else "7"
            body = (b'{"error": {"message": "Rate limit reached for model on tokens per minute (TPM): Limit 8000, '
                    b'Used 4363, Requested 5436. Please try again in 6.5s.", "type": "tokens"}}')
            self.send_response(429)
            self.send_header("Retry-After", wait)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if mode == "drop":  # commence à répondre puis la connexion tombe
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(b'data: {"choices": [{"delta": {"content": "Le d\xc3\xa9but de la r"}}]}\n\n')
            self.wfile.flush()
            return
        if mode == "dropempty":  # en-têtes reçus, puis plus rien : la connexion tombe avant le premier mot
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            return
        if mode == "toolslow":  # long appel d'outil : des morceaux arrivent, mais aucun texte visible
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            first = {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "c1", "function": {
                "name": "write_file", "arguments": ""}}]}}]}
            self.wfile.write(b"data: " + json.dumps(first).encode() + b"\n\n")
            for part in ['{"path": "a.txt", ', '"content": "', "x" * 50, '"}']:
                time.sleep(0.35)
                d = {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": part}}]}}]}
                self.wfile.write(b"data: " + json.dumps(d).encode() + b"\n\n")
                self.wfile.flush()
            self.wfile.write(b'data: {"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}\n\ndata: [DONE]\n\n')
            return
        if mode == "dropanthropic":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(b'event: message_start\ndata: {"type": "message_start", "message": {"usage": {}}}\n\n'
                             b'event: content_block_start\ndata: {"type": "content_block_start", "index": 0, '
                             b'"content_block": {"type": "text", "text": ""}}\n\n'
                             b'event: content_block_delta\ndata: {"type": "content_block_delta", "index": 0, '
                             b'"delta": {"type": "text_delta", "text": "Une moiti"}}\n\n')
            return
        body = _sse_answer("Réponse de secours.")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        self.wfile.write(body)


class Serveur:
    def __init__(self) -> None:
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Capricieux)
        self.httpd.daemon_threads = True
        self.httpd.hits = {}  # type: ignore[attr-defined]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    @property
    def hits(self) -> dict:
        return self.httpd.hits  # type: ignore[attr-defined]

    def url(self, mode: str) -> str:
        return f"http://127.0.0.1:{self.httpd.server_address[1]}/{mode}/v1"


SRV = Serveur()


def cloud(mid: str, mode: str, **extra) -> ModelHandle:
    """Un modèle « en ligne » (local=False) servi par le faux serveur."""
    return ModelHandle({"id": mid, "provider": "openai", "base_url": SRV.url(mode), "model": mid, "api_key": "k",
                        "local": False, **extra})


MSG = [{"role": "system", "content": "s"}, {"role": "user", "content": "Bonjour"}]


class TestBascule(unittest.TestCase):
    def setUp(self) -> None:
        SRV.hits.clear()

    def test_serveur_muet_bascule_vite_sans_second_essai(self):
        """Groq ne répond plus : on passe à Claude après UN délai, sans relancer Groq une 2e fois."""
        notes: list[str] = []
        r = LLMRouter(handles=[cloud("groq", "hang", timeout=1.5), cloud("claude", "ok")])
        t0 = time.time()
        resp = r.chat(MSG, notice_cb=notes.append)
        self.assertEqual(resp.model, "claude")
        self.assertEqual(SRV.hits.get("hang"), 1)
        self.assertLess(time.time() - t0, 4)
        self.assertTrue(any("groq" in n and "claude" in n for n in notes), notes)

    def test_limite_de_requetes_longue_bascule_sans_attendre(self):
        """429 avec « réessaie dans 30 s » : on n'attend pas 2 × 20 s, on prend le modèle suivant."""
        notes: list[str] = []
        r = LLMRouter(handles=[cloud("groq", "r429"), cloud("claude", "ok")])
        t0 = time.time()
        resp = r.chat(MSG, notice_cb=notes.append)
        self.assertEqual(resp.model, "claude")
        self.assertLess(time.time() - t0, 3)
        self.assertTrue(any("limite" in n for n in notes), notes)
        self.assertGreater(r.get("groq").cooldown_until, time.time() + 20)  # Groq laissé en paix ~30 s

    def test_limite_de_requetes_dernier_modele_attend(self):
        """Seul modèle disponible : on respecte quand même l'attente (bornée) plutôt que d'échouer."""
        r = LLMRouter(handles=[cloud("groq", "r429")])
        import zeuscore.llm as llm
        slept: list[float] = []
        old = llm.time.sleep
        llm.time.sleep = lambda s: slept.append(s)
        try:
            with self.assertRaises(LLMError):
                r.chat(MSG)
        finally:
            llm.time.sleep = old
        self.assertEqual(SRV.hits.get("r429"), 3)
        self.assertTrue(slept and max(slept) <= 20)

    def test_connexion_coupee_en_pleine_reponse(self):
        """Réponse tronquée par une coupure : ce n'est pas une réponse, on bascule (OpenAI/Groq)."""
        r = LLMRouter(handles=[cloud("groq", "drop"), cloud("claude", "ok")])
        resp = r.chat(MSG)
        self.assertEqual(resp.model, "claude")
        self.assertIn("connection", r.get("groq").last_error)

    def test_connexion_coupee_en_pleine_reponse_claude(self):
        h = ModelHandle({"id": "claude", "provider": "anthropic", "base_url": SRV.url("dropanthropic")[:-3],
                         "model": "claude-opus-5-5", "api_key": "k", "local": False})
        with self.assertRaises(LLMError) as cm:
            LLMRouter(handles=[h]).chat(MSG)
        self.assertIn("connection", str(cm.exception))

    def test_connexion_coupee_avant_le_premier_mot(self):
        r = LLMRouter(handles=[cloud("groq", "dropempty"), cloud("claude", "ok")])
        self.assertEqual(r.chat(MSG).model, "claude")

    def test_annonce_modele_lent_sans_fausse_alerte(self):
        import zeuscore.llm as llm
        old = llm.SLOW_NOTICE
        llm.SLOW_NOTICE = 0.6
        try:
            notes: list[str] = []
            r = LLMRouter(handles=[cloud("groq", "toolslow")])
            resp = r.chat(MSG, [{"name": "write_file", "description": "d", "parameters": {"type": "object"}}],
                          notice_cb=notes.append)
            self.assertEqual(resp.tool_calls[0].name, "write_file")
            self.assertEqual(notes, [])  # il travaillait : aucune alerte
            r = LLMRouter(handles=[cloud("groq", "hang", timeout=1.5), cloud("claude", "ok")])
            r.chat(MSG, notice_cb=notes.append)
            self.assertTrue(any("tarde" in n for n in notes), notes)
        finally:
            llm.SLOW_NOTICE = old

    def test_retour_d_internet_sans_passer_par_le_local(self):
        """Micro-coupure : Groq et Claude en pause « injoignable ». Internet revenu → Groq, pas le local (8 min)."""
        groq, claude = cloud("groq", "ok"), cloud("claude", "ok")
        lent = ModelHandle({"id": "local", "provider": "ollama", "model": "mistral:7b"},
                           provider=ScriptedProvider({}, ["local"]))
        for h in (groq, claude):
            h.cooldown_until, h.last_kind = time.time() + 45, "connection"
        r = LLMRouter(handles=[groq, claude, lent])
        self.assertEqual(r.chat(MSG).model, "groq")
        # tombé pour délai dépassé (échec lent) : on ne le réessaie pas pendant sa pause
        groq.cooldown_until, groq.last_kind = time.time() + 45, "timeout"
        claude.cooldown_until, claude.last_kind = time.time() + 45, "timeout"
        self.assertEqual(r.chat(MSG).model, "local")

    def test_bouton_stop_pendant_une_attente(self):
        """Stop pendant qu'un modèle lent réfléchit : ZEUS s'arrête tout de suite, pas après le délai."""
        cancel = threading.Event()
        r = LLMRouter(handles=[cloud("local-lent", "hang", timeout=30)])
        threading.Timer(0.5, cancel.set).start()
        t0 = time.time()
        with self.assertRaises(LLMError) as cm:
            r.chat(MSG, cancel=cancel)
        self.assertEqual(cm.exception.kind, "cancelled")
        self.assertLess(time.time() - t0, 3)

    def test_internet_coupe_message_clair(self):
        """Tous les modèles en ligne injoignables : le message parle d'internet, pas d'Ollama."""
        from zeuscore.agent import Agent
        dead = "http://127.0.0.1:9/v1"  # port fermé : connexion refusée immédiatement
        r = LLMRouter(handles=[ModelHandle({"id": "groq", "provider": "openai", "base_url": dead, "model": "m",
                                            "local": False}),
                               ModelHandle({"id": "claude", "provider": "anthropic", "base_url": dead[:-3],
                                            "model": "m", "local": False})])
        with self.assertRaises(LLMError) as cm:
            r.chat(MSG)
        self.assertEqual(cm.exception.kinds, ["connection", "connection"])
        txt = Agent._llm_failure_text(cm.exception)
        self.assertIn("internet", txt.lower())
        self.assertNotIn("Ollama est lancé", txt)


class TestOrdre(unittest.TestCase):
    class Cfg:
        def __init__(self, routing):
            self.routing = routing

        def get(self, k, d=None):
            return self.routing if k == "routing" else d

    def _router(self, routing, *specs):
        hs = [ModelHandle(s, provider=ScriptedProvider(s)) for s in specs]
        return LLMRouter(self.Cfg(routing), handles=hs)

    def test_local_toujours_en_dernier_secours(self):
        """Claude principal, preset Claude appliqué après Groq : Groq doit passer AVANT le modèle local."""
        r = self._router({"default": "claude", "fast": "claude-rapide", "fallback": ["claude-rapide", "local"]},
                         {"id": "groq", "provider": "groq", "model": "g"},
                         {"id": "local", "provider": "ollama", "model": "mistral:7b"},
                         {"id": "claude", "provider": "anthropic", "model": "claude-opus-5-5"},
                         {"id": "claude-rapide", "provider": "anthropic", "model": "claude-haiku-5-5"})
        self.assertEqual([h.id for h in r.order()], ["claude", "claude-rapide", "groq", "local"])

    def test_chaine_groq_claude_ollama(self):
        r = self._router({"default": "groq", "fallback": ["local", "claude"]},
                         {"id": "local", "provider": "ollama", "model": "mistral:7b"},
                         {"id": "claude", "provider": "anthropic", "model": "claude-opus-5-5"},
                         {"id": "groq", "provider": "groq", "model": "g"})
        self.assertEqual([h.id for h in r.order()], ["groq", "claude", "local"])

    def test_local_choisi_expres_reste_premier(self):
        r = self._router({"default": "local", "fallback": ["groq"]},
                         {"id": "groq", "provider": "groq", "model": "g"},
                         {"id": "local", "provider": "ollama", "model": "mistral:7b"})
        self.assertEqual([h.id for h in r.order()], ["local", "groq"])

    def test_delais_par_defaut(self):
        """En ligne : ~1 min sans nouvelles = panne. Local sans carte graphique : 4 à 8 min pour la 1re réponse."""
        groq = ModelHandle({"id": "g", "provider": "groq", "model": "m"})
        claude = ModelHandle({"id": "c", "provider": "anthropic", "model": "m"})
        local = ModelHandle({"id": "l", "provider": "ollama", "model": "m"})
        self.assertLessEqual(groq.provider.timeout, 90)
        self.assertLessEqual(claude.provider.timeout, 90)
        self.assertGreaterEqual(local.provider.timeout, 600)
        self.assertEqual(ModelHandle({"id": "x", "provider": "ollama", "model": "m", "timeout": 42}).provider.timeout, 42)
        self.assertTrue(local.is_local and not groq.is_local and not claude.is_local)

    def test_limite_courte_attend_plutot_que_le_local(self):
        """Groq gratuit (8 000 jetons/min) : « réessaie dans 7 s » et il ne reste que le modèle local (plusieurs minutes)
        → on attend ces quelques secondes et on réessaie Groq, au lieu de partir 5 minutes sur le local."""
        notes: list[str] = []
        used: list[str] = []
        local = ModelHandle({"id": "local", "provider": "ollama", "model": "mistral:7b"},
                            provider=ScriptedProvider({}, ["Réponse lente du local."]))
        orig = local.provider.chat
        local.provider.chat = lambda *a, **k: (used.append("local"), orig(*a, **k))[1]
        r = LLMRouter(handles=[cloud("groq", "r429court"), local])
        import zeuscore.llm as llm
        slept: list[float] = []
        old = llm.time.sleep
        llm.time.sleep = lambda s: slept.append(s)
        try:
            resp = r.chat(MSG, notice_cb=notes.append)
        finally:
            llm.time.sleep = old
        self.assertEqual(resp.model, "groq")
        self.assertEqual(used, [])
        self.assertTrue(slept and 6 <= max(slept) <= 60, slept)
        self.assertTrue(any("réessaie" in n for n in notes), notes)

    def test_limite_trop_longue_passe_au_local(self):
        """Limite qui dure (par exemple le quota du jour) : on n'attend pas des minutes, le local prend le relais."""
        r = LLMRouter(handles=[cloud("groq", "r429long"),
                               ModelHandle({"id": "local", "provider": "ollama", "model": "mistral:7b"},
                                           provider=ScriptedProvider({}, ["Bonjour depuis le local."]))])
        t0 = time.time()
        self.assertEqual(r.chat(MSG).model, "local")
        self.assertLess(time.time() - t0, 3)

    def test_delai_lu_dans_le_message_de_groq(self):
        """Sans en-tête Retry-After, le délai écrit par Groq (« try again in 1m2.5s ») est quand même compris."""
        from zeuscore.llm import _http_error
        body = '{"error": {"message": "Rate limit reached ... Please try again in 13.4925s. Need more tokens?"}}'
        self.assertAlmostEqual(_http_error(429, body, {}).retry_after, 13.4925)
        self.assertAlmostEqual(_http_error(429, body.replace("13.4925s", "1m2.5s"), {}).retry_after, 62.5)
        self.assertAlmostEqual(_http_error(429, body.replace("13.4925s", "750ms"), {}).retry_after, 0.75)
        self.assertEqual(_http_error(429, body, {"retry-after": "9"}).retry_after, 9.0)

    def test_annonce_du_modele_local(self):
        """Bascule sur le modèle local : ZEUS prévient que ce sera long."""
        notes: list[str] = []
        r = LLMRouter(handles=[cloud("groq", "r429long"),
                               ModelHandle({"id": "local", "provider": "ollama", "model": "mistral:7b"},
                                           provider=ScriptedProvider({}, ["Bonjour depuis le local."]))])
        resp = r.chat(MSG, notice_cb=notes.append)
        self.assertEqual(resp.model, "local")
        self.assertTrue(any("minutes" in n for n in notes), notes)


class ZeusTemp(unittest.TestCase):
    """Un ZEUS jetable : Groq (limite de requêtes) puis « claude » (répond)."""

    def setUp(self) -> None:
        import shutil
        from zeuscore.core import Zeus
        self.tmp = Path(tempfile.mkdtemp(prefix="zeus_fiab_"))
        home = self.tmp / "data"
        home.mkdir()
        cfg = {"owner": {"name": "Test"}, "agent": {"auto_learn": False},
               "phone": {"enabled": False, "adb_path": "/nonexistent/adb"},
               "models": [{"id": "groq", "provider": "openai", "base_url": SRV.url("r429"), "model": "g",
                           "local": False},
                          {"id": "claude", "provider": "openai", "base_url": SRV.url("ok"), "model": "c",
                           "local": False}],
               "routing": {"default": "groq", "fallback": ["claude"]}}
        (home / "zeus.json").write_text(json.dumps(cfg), encoding="utf-8")
        self.z = Zeus(home)
        self._rm = lambda: shutil.rmtree(self.tmp, ignore_errors=True)

    def tearDown(self) -> None:
        self.z.stop()
        self.z.db.close()
        self._rm()


class TestAgentBascule(ZeusTemp):
    """De bout en bout dans ZEUS : l'annonce arrive à l'interface, une seule fois ; Stop libère la conversation."""

    def test_annonce_unique_et_reponse(self):
        q = self.z.bus.subscribe()
        res = self.z.chat(self.z.owner_session(), "Bonjour")
        self.assertTrue(res.ok, res.text)
        self.assertIn("Réponse de secours", res.text)
        evs = []
        while not q.empty():
            evs.append(q.get_nowait())
        notes = [e["text"] for e in evs if e["type"] == "model_notice"]
        self.assertEqual(len(notes), 1, notes)
        self.assertIn("groq", notes[0])
        msgs = self.z.db.get_messages(self.z.owner_session())
        self.assertEqual((msgs[-1].get("meta") or {}).get("model"), "claude")

    def test_stop_libere_la_conversation(self):
        self.z.config.set("models", [{"id": "lent", "provider": "openai", "base_url": SRV.url("hang"), "model": "m",
                                      "local": True, "timeout": 30}])
        self.z.config.set("routing", {"default": "lent"})
        self.z.router.reload()
        sid = self.z.owner_session()
        done: dict = {}
        t = threading.Thread(target=lambda: done.update(r=self.z.chat(sid, "Bonjour")), daemon=True)
        t.start()
        time.sleep(0.8)
        t0 = time.time()
        self.assertTrue(self.z.stop_run(sid))
        t.join(5)
        self.assertFalse(t.is_alive(), "la conversation est restée bloquée après Stop")
        self.assertLess(time.time() - t0, 3)
        self.assertIn("arrêtée", done["r"].text)


class TestMesure(ZeusTemp):
    """python zeus.py mesure : tourne sans erreur, ne laisse pas de conversation de test, respecte un refus."""

    def test_mesure_complete(self):
        from zeuscore.bench import run_benchmark
        self.z.config.set("routing", {"default": "claude", "fallback": ["groq"]})
        before = len(self.z.db.list_sessions(500))
        lines: list[str] = []
        rep = run_benchmark(self.z, models=["claude"], reps=2, confirm=lambda q: True, say=lines.append)
        m = rep["models"]["claude"]
        self.assertTrue(all(r["ok"] for r in m["short"] + m["zeus_request"]), m)
        self.assertGreater(rep["context_tokens_estimate"], 500)
        self.assertEqual([r["model"] for r in rep["end_to_end"]], ["claude", "claude"])
        self.assertEqual(len(self.z.db.list_sessions(500)), before)  # sessions de mesure supprimées
        self.assertTrue(any("à chaud" in x for x in lines))

    def test_refus_du_cout(self):
        from zeuscore.bench import run_benchmark
        self.z.config.set("models", [{"id": "claude", "provider": "anthropic", "base_url": "http://127.0.0.1:9",
                                      "model": "claude-opus-5-5", "api_key": "k", "local": False}])
        self.z.router.reload()
        asked: list[str] = []
        rep = run_benchmark(self.z, reps=1, confirm=lambda q: asked.append(q) or False, say=lambda x: None)
        self.assertTrue(rep.get("cancelled"))
        self.assertTrue(asked and "$" in asked[0])
        self.assertEqual(rep["models"], {})


class TestDemarrageEnv(unittest.TestCase):
    """Premier démarrage avec .env : Claude ET Groq branchés, Ollama en dernier secours."""

    def test_cles_env_groq_et_claude(self):
        import importlib
        sys.path.insert(0, str(ROOT))
        zeus_main = importlib.import_module("zeus")
        import zeuscore.llm as llm
        from zeuscore.config import Config
        tmp = Path(tempfile.mkdtemp(prefix="zeus_env_"))
        cfg = Config(tmp)
        old_env = {k: os.environ.get(k) for k in ("ANTHROPIC_API_KEY", "GROQ_API_KEY")}
        old_list, old_oll = llm.list_openai_models, llm.list_ollama_models
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-x"
        os.environ["GROQ_API_KEY"] = "gsk_x"
        llm.list_openai_models = lambda *a, **k: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
        llm.list_ollama_models = lambda *a, **k: [{"name": "mistral:7b"}]
        try:
            found = zeus_main.autodetect_models(cfg)
        finally:
            llm.list_openai_models, llm.list_ollama_models = old_list, old_oll
            for k, v in old_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        ids = [m["id"] for m in cfg.get("models")]
        for mid in ("claude", "groq", "local"):
            self.assertIn(mid, ids)
        self.assertTrue(found)
        # les clés restent dans .env : zeus.json ne contient que des renvois
        raw = (tmp / "zeus.json").read_text(encoding="utf-8")
        self.assertNotIn("sk-ant-x", raw)
        self.assertNotIn("gsk_x", raw)
        order = [h.id for h in LLMRouter(cfg).order()]
        self.assertEqual(order[-1], "local")
        self.assertLess(order.index("groq"), order.index("local"))


if __name__ == "__main__":
    unittest.main()
