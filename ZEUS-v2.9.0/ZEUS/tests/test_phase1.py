"""Phase 1 (fiabilité) : limite de débit de Groq gratuit → attendre plutôt que basculer sur le modèle local."""

from __future__ import annotations

import json
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import zeuscore.llm as L  # noqa: E402
from zeuscore.config import Config  # noqa: E402


def make_router(models):
    home = Path(tempfile.mkdtemp())
    (home / "zeus.json").write_text(json.dumps({"models": models, "routing": {
        "default": models[0]["id"], "fallback": [m["id"] for m in models[1:]]}}), encoding="utf-8")
    return L.LLMRouter(Config(home))


GROQ = {"provider": "openai", "base_url": "https://api.groq.com/openai/v1", "api_key": "x"}
MODELS = [{"id": "groq", "model": "openai/gpt-oss-120b", **GROQ},
          {"id": "groq-rapide", "model": "openai/gpt-oss-20b", **GROQ},
          {"id": "local", "provider": "ollama", "base_url": "http://localhost:11434", "model": "llama3.2:3b"}]


def rate_limited(seconds):
    return L._http_error(429, json.dumps({"error": {"message": f"Rate limit reached on tokens per minute (TPM): "
                                                                f"Limit 8000. Please try again in {seconds}s."}}), {})


class TestRateLimitWait(unittest.TestCase):
    def run_router(self, script, wait_limit=None):
        r = make_router(MODELS)
        calls, notices = [], []
        t0 = time.time()

        def fake(h, *a, **k):
            calls.append(h.id)
            plan = script.get(h.id) or []
            step = plan.pop(0) if plan else "ok"
            if step == "ok":
                return L.LLMResponse(text=f"réponse de {h.id}")
            raise rate_limited(step)
        r._call = fake
        old = L.RATE_WAIT_BEFORE_LOCAL
        if wait_limit is not None:
            L.RATE_WAIT_BEFORE_LOCAL = wait_limit
        try:
            resp = r.chat([{"role": "user", "content": "bonjour"}], notice_cb=notices.append)
        finally:
            L.RATE_WAIT_BEFORE_LOCAL = old
        return resp, calls, notices, time.time() - t0

    def test_waits_for_groq_instead_of_local(self):
        # les deux modèles Groq sont à leur limite (comme dans le banc d'essai du 9 novembre)
        resp, calls, notices, took = self.run_router(
            {"groq": [6.5, "ok"], "groq-rapide": [1.0, 1.0, 1.0, "ok"]}, wait_limit=60)
        self.assertNotIn("local", calls)
        self.assertTrue(resp.text.startswith("réponse de groq"))
        self.assertTrue(any("je reprends dans" in n or "je réessaie" in n for n in notices), notices)
        self.assertLess(took, 15)

    def test_long_limit_still_uses_local(self):
        # limite de plusieurs minutes : attendre ne sert à rien, le modèle local prend le relais
        resp, calls, notices, _ = self.run_router(
            {"groq": [600], "groq-rapide": [600]}, wait_limit=60)
        self.assertEqual(resp.text, "réponse de local")
        self.assertTrue(any("modèle local" in n for n in notices))

    def test_cancel_during_wait(self):
        import threading
        r = make_router(MODELS)
        r._call = lambda h, *a, **k: (_ for _ in ()).throw(rate_limited(30)) if h.id != "local" else L.LLMResponse(text="x")
        cancel = threading.Event()
        threading.Timer(0.5, cancel.set).start()
        t0 = time.time()
        with self.assertRaises(L.LLMError) as cm:
            r.chat([{"role": "user", "content": "x"}], cancel=cancel)
        self.assertEqual(cm.exception.kind, "cancelled")
        self.assertLess(time.time() - t0, 5)


if __name__ == "__main__":
    unittest.main()


class TestLeanTeacher(unittest.TestCase):
    """Pendant un cours de langue, seuls les outils utiles partent avec chaque requête."""

    def setUp(self):
        from zeuscore.core import Zeus
        self.z = Zeus(Path(tempfile.mkdtemp()))

    def tearDown(self):
        self.z.stop()
        self.z.db.close()

    def names(self, sid, extra=()):
        from zeuscore.agent import Run
        session = self.z.db.get_session(sid)
        run = Run(sid, "owner", query="I am living here since 2019.")
        run.toolsets = self.z.agent._initial_toolsets("owner", session, run.query, None) | set(extra)
        return set(self.z.agent._tool_names(run, "owner", "owner")), run

    def test_teacher_gets_lean_core(self):
        from zeuscore.util import estimate_tokens
        sid = self.z.db.create_session("web", "cours", "owner", meta={"mode": {"id": "prof_langue", "lang": "en"}})
        names, _ = self.names(sid)
        self.assertIn("corrections_log", names)
        self.assertIn("remember", names)
        self.assertIn("enable_tools", names)
        for heavy in ("run_shell", "write_file", "list_dir", "delegate", "schedule_task", "update_plan"):
            self.assertNotIn(heavy, names)
        size = estimate_tokens(json.dumps(self.z.registry.schemas(sorted(names)), ensure_ascii=False))
        self.assertLess(size, 3300)
        # le modèle peut toujours tout récupérer
        full, _ = self.names(sid, extra={"core_full"})
        self.assertIn("run_shell", full)

    def test_enable_core_restores_everything(self):
        from zeuscore.tools import ToolContext
        sid = self.z.db.create_session("web", "cours2", "owner", meta={"mode": {"id": "prof_langue", "lang": "es"}})
        _, run = self.names(sid)
        ctx = ToolContext(self.z, self.z.db.get_session(sid), run=run)
        self.z.registry.execute(ctx, "enable_tools", {"toolsets": ["core"]})
        self.assertIn("core_full", run.toolsets)
        names = set(self.z.agent._tool_names(run, "owner", "owner"))
        self.assertIn("write_file", names)

    def test_assistant_keeps_all_core(self):
        sid = self.z.db.create_session("web", "normal", "owner")
        names, _ = self.names(sid)
        self.assertIn("run_shell", names)
        self.assertIn("write_file", names)


class TestBenchStopsOnDailyLimit(unittest.TestCase):
    def test_stops_when_all_online_models_blocked(self):
        from types import SimpleNamespace
        from zeuscore import pedagogie
        h1 = SimpleNamespace(is_local=False, cooldown_until=time.time() + 1500)
        h2 = SimpleNamespace(is_local=False, cooldown_until=time.time() + 600)
        loc = SimpleNamespace(is_local=True, cooldown_until=0)
        z = SimpleNamespace(router=SimpleNamespace(handles=[h1, h2, loc]))
        self.assertAlmostEqual(pedagogie.online_blocked_until(z), h2.cooldown_until, delta=1)
        h2.cooldown_until = time.time() + 20  # une limite à la minute ne bloque pas le banc
        self.assertIsNone(pedagogie.online_blocked_until(z))


class TestInternetCut(unittest.TestCase):
    """Micro-coupure d'internet (fréquente à Kinshasa) : attendre son retour plutôt que le modèle local."""

    def run_cut(self, back_after, budget):
        r = make_router(MODELS)
        calls, notices = [], []
        t0 = time.time()

        def fake(h, *a, **k):
            calls.append(h.id)
            if h.id == "local":
                return L.LLMResponse(text="réponse du local")
            if time.time() - t0 < back_after:
                raise L.LLMError("connection", "getaddrinfo failed")
            return L.LLMResponse(text=f"réponse de {h.id}")
        r._call = fake
        old_wait, old_reach = L.INTERNET_WAIT_BEFORE_LOCAL, L._reachable
        L.INTERNET_WAIT_BEFORE_LOCAL = budget
        L._reachable = lambda url, timeout=3.0: time.time() - t0 >= back_after
        try:
            resp = r.chat([{"role": "user", "content": "bonjour"}], notice_cb=notices.append)
        finally:
            L.INTERNET_WAIT_BEFORE_LOCAL, L._reachable = old_wait, old_reach
        return resp, calls, notices

    def test_short_cut_waits_for_internet(self):
        resp, calls, notices = self.run_cut(back_after=4, budget=20)
        self.assertNotIn("local", calls)
        self.assertTrue(resp.text.startswith("réponse de groq"))
        self.assertTrue(any("internet coupé" in n for n in notices), notices)
        self.assertTrue(any("Connexion revenue" in n for n in notices), notices)

    def test_long_cut_falls_back_to_local(self):
        resp, calls, notices = self.run_cut(back_after=999, budget=1)
        self.assertEqual(resp.text, "réponse du local")

    def test_reachable_handles_bad_urls(self):
        self.assertFalse(L._reachable(""))
        self.assertFalse(L._reachable("http://127.0.0.1:9/v1", timeout=0.5))
