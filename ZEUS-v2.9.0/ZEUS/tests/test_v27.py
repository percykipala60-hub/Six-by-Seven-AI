"""Tests de la version 2.7 : l'interface spatiale du mode Jarvis et les relevés de la machine."""

from __future__ import annotations

import re
import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from test_zeus import Base  # noqa: E402
from test_v23 import WebMixin  # noqa: E402

UI = ROOT / "zeuscore" / "ui"


class TestSysInfo(unittest.TestCase):
    def test_snapshot_has_real_values_or_nothing(self):
        from zeuscore.sysinfo import SysStats
        s = SysStats(ROOT)
        sum(i * i for i in range(200000))  # un peu de calcul entre deux relevés
        snap = s.snapshot()
        self.assertIn("cpu", snap)
        if snap["cpu"] is not None:
            self.assertGreaterEqual(snap["cpu"], 0)
            self.assertLessEqual(snap["cpu"], 100)
        if snap["memory"] is not None:
            self.assertGreater(snap["memory"]["total_gb"], 0)
            self.assertTrue(0 <= snap["memory"]["percent"] <= 100)
        self.assertGreater(snap["disk"]["total_gb"], 0)
        self.assertGreaterEqual(snap["cores"] or 1, 1)

    def test_unknown_values_stay_empty(self):
        from zeuscore import sysinfo
        old = sysinfo._cpu_times
        sysinfo._cpu_times = lambda: None
        try:
            self.assertIsNone(sysinfo.SysStats(ROOT).cpu())
        finally:
            sysinfo._cpu_times = old
        self.assertIsNone(sysinfo.disk(ROOT / "dossier-qui-n-existe-pas"))

    def test_cpu_is_measured_between_two_readings(self):
        from zeuscore import sysinfo
        seq = iter([(100, 1000), (150, 1100), (150, 1100)])
        old = sysinfo._cpu_times
        sysinfo._cpu_times = lambda: next(seq)
        try:
            s = sysinfo.SysStats(ROOT)
            self.assertEqual(s.cpu(), 50.0)      # 50 occupés sur 100
            self.assertEqual(s.cpu(), 50.0)      # relevé trop rapproché : dernière valeur
        finally:
            sysinfo._cpu_times = old


class TestSystemApi(WebMixin, Base):
    def setUp(self):
        super().setUp()
        self.start_web()

    def tearDown(self):
        self.web.stop()
        super().tearDown()

    def test_route(self):
        code, r = self.call("/api/system")
        self.assertEqual(code, 200)
        for k in ("cpu", "cores", "memory", "disk", "ts"):
            self.assertIn(k, r)
        self.assertLess(abs(r["ts"] - time.time()), 30)
        code, st = self.call("/api/status")
        self.assertIn("mini_ready", st["models"][0])


class TestSpatialInterface(unittest.TestCase):
    def test_markup(self):
        html = (UI / "index.html").read_text(encoding="utf-8")
        for needle in ('id="jv-feed"', 'id="jv-readouts"', 'id="jv-stats"', 'id="jv-spark"', 'id="jv-type"',
                       "Interface spatiale", 'id="jv-user"', 'id="jv-reply"', 'id="jv-tool"'):
            self.assertIn(needle, html)

    def test_no_external_library_and_no_invented_figures(self):
        js = (UI / "app.js").read_text(encoding="utf-8")
        html = (UI / "index.html").read_text(encoding="utf-8")
        # aucune ressource chargée depuis internet : l'interface marche hors ligne
        self.assertFalse(re.search(r"""<(script|link)[^>]+(src|href)=["']https?://""", html))
        self.assertNotIn("THREE.", js)
        self.assertIn('api("/api/system")', js)
        for fake in ("Latence : 12ms", "4.2 GB", "Tension réacteur", "Core Quantique"):
            self.assertNotIn(fake, js + html)

    def test_modules_match_real_tools(self):
        from zeuscore.tools import TOOLSETS  # noqa: F401 — charge le registre
        js = (UI / "app.js").read_text(encoding="utf-8")
        self.assertIn('spatial: true', js)
        for name in ("COMMUNICATIONS", "SÉCURITÉ", "ANALYSE", "AGENDA", "MÉMOIRE", "TÉLÉPHONE"):
            self.assertIn(f'"{name}"', js)


if __name__ == "__main__":
    unittest.main()


# =========================================================================== Groq gratuit : 8 000 jetons par requête
class TestGroqFreeRequestSize(Base):
    GROQ = {"id": "groq", "provider": "openai", "base_url": "https://api.groq.com/openai/v1", "model": "openai/gpt-oss-120b",
            "api_key": "k", "context": 32000}

    def test_413_is_treated_as_too_long(self):
        import json as _j
        import zeuscore.llm as L
        body = _j.dumps({"error": {"message": "Request too large for model `openai/gpt-oss-120b` in organization `org_x` "
                                              "service tier `on_demand` on tokens per minute (TPM): Limit 8000, "
                                              "Requested 8013, please reduce your message size and try again."}})
        self.assertEqual(L._http_error(413, body, {}).kind, "context_length")
        self.assertEqual(L._http_error(413, '{"error": {"message": "payload too big"}}', {}).kind, "bad_request")

    def test_budget_and_price(self):
        import zeuscore.llm as L
        from zeuscore.costs import model_prices
        self.assertEqual(L.request_limit(self.GROQ), 8000)
        self.assertIsNone(L.request_limit({**self.GROQ, "tier": "paid"}))
        self.assertEqual(L.request_limit({**self.GROQ, "max_request_tokens": 12000}), 12000)
        self.assertEqual(model_prices(self.GROQ), (0.0, 0.0, 0.0))
        self.assertIsNone(model_prices({**self.GROQ, "tier": "paid"}))
        self.z.config.set("models", [self.GROQ])
        self.z.config.set("routing", {"default": "groq"})
        self.z.router.reload()
        from zeuscore.agent import DIET_MARGIN
        self.assertLessEqual(self.z.agent._budget(), 8000 - DIET_MARGIN)
        self.assertNotIn("groq", self.z.costs.status()["unknown_prices"])

    def test_long_conversation_stays_under_the_limit(self):
        from zeuscore.agent import Run
        from zeuscore.util import estimate_tokens
        import json as _j
        self.z.config.set("models", [self.GROQ])
        self.z.config.set("routing", {"default": "groq"})
        self.z.router.reload()
        sid = self.z.owner_session()
        for i in range(40):
            self.z.db.add_message(sid, {"role": "user", "content": f"Question {i} : " + "explique-moi la photosynthèse " * 12})
            self.z.db.add_message(sid, {"role": "assistant", "content": f"Réponse {i} : " + "la lumière devient sucre " * 15})
        run = Run(sid, "owner", query="dernière question")
        run.toolsets = self.z.agent._initial_toolsets("owner", self.z.db.get_session(sid), "dernière question", None)
        tools = self.z.registry.schemas(self.z.agent._tool_names(run, "owner", "owner"))
        msgs = self.z.agent._context(sid, "owner", run, tools, "", "")
        total = estimate_tokens(_j.dumps(msgs, ensure_ascii=False) + _j.dumps(tools, ensure_ascii=False))
        self.assertLess(total, 7500, total)


class TestDietUnderGroqFree(Base):
    GROQ = TestGroqFreeRequestSize.GROQ

    def setUp(self):
        super().setUp()
        self.z.config.set("models", [self.GROQ])
        self.z.config.set("routing", {"default": "groq"})
        self.z.router.reload()

    def request(self, mode, text, history=30, enabled=()):
        import json as _j
        from zeuscore import modes
        from zeuscore.agent import Run
        from zeuscore.util import estimate_tokens
        a = self.z.agent
        sid = self.z.db.create_session("web", "owner", "owner", meta={"mode": modes.normalize(mode)})
        for i in range(history):
            self.z.db.add_message(sid, {"role": "user", "content": f"Question {i} : " + "explique-moi la photosynthèse " * 12})
            self.z.db.add_message(sid, {"role": "assistant", "content": f"Réponse {i} : " + "la lumière devient sucre " * 15})
        self.z.db.add_message(sid, {"role": "user", "content": text})
        run = Run(sid, "owner", query=text)
        run.toolsets = a._initial_toolsets("owner", self.z.db.get_session(sid), text, None)
        run.initial_toolsets = set(run.toolsets)
        for ts in enabled:
            run.toolsets.add(ts)
            run.enabled_order.append(ts)
        names, limit = a._tool_names(run, "owner", "owner"), a._request_limit()
        if limit:
            names = a._diet(run, "owner", "owner", self.z.db.get_session(sid), names, limit)
        tools = self.z.registry.schemas(names, compact=bool(limit))
        msgs = a._context(sid, "owner", run, tools, "", "")
        return run, names, estimate_tokens(_j.dumps(msgs, ensure_ascii=False) + _j.dumps(tools, ensure_ascii=False))

    def test_every_role_fits(self):
        from zeuscore import modes
        for mid in modes.MODES:
            for text in ("Bonjour", "Ajoute réunion budget demain à 10h et préviens Paul par WhatsApp"):
                run, names, total = self.request(mid, text)
                self.assertLess(total, 6800, f"{mid} / {text} : {total} jetons estimés")

    def test_keeps_what_matters(self):
        run, names, _ = self.request("secretaire", "Ajoute réunion budget demain à 10h et préviens Paul par WhatsApp")
        self.assertIn("secretariat", run.toolsets)              # la boîte du rôle
        self.assertIn("agenda_add", names)
        self.assertIn("enable_tools", names)                    # pour recharger le reste
        run, names, _ = self.request("assistant", "Envoie un WhatsApp à Paul", enabled=("phone",))
        self.assertIn("phone", run.toolsets)                    # chargée par le modèle : prioritaire
        self.assertIn("phone_send_whatsapp", names)

    def test_paid_or_local_models_keep_everything(self):
        self.z.config.set("models", [{**self.GROQ, "tier": "paid"}])
        self.z.router.reload()
        run, names, _ = self.request("secretaire", "Bonjour", history=0)
        self.assertFalse(run.lean_core)
        self.assertIn("comms", run.toolsets)

    def test_compact_schemas(self):
        reg = self.z.registry
        full, small = reg.schemas(["enable_tools", "agenda_add"]), reg.schemas(["enable_tools", "agenda_add"], compact=True)
        self.assertEqual([s["name"] for s in full], [s["name"] for s in small])
        self.assertEqual(full[1]["parameters"]["required"], small[1]["parameters"]["required"])
        self.assertLess(len(str(small)), len(str(full)))
        self.assertLessEqual(len(small[0]["description"]), 160)


# =========================================================================== apprendre de chaque conversation
class TestLessons(Base):
    def test_recap_every_three_questions(self):
        from zeuscore import lessons
        self.z.config.set("agent.auto_learn", True)  # coupé par défaut dans les tests
        sid = self.z.owner_session()
        for t in ("Je suis étudiant en B1 à l'Icam de Kinshasa", "Mon cours préféré est la mécanique des fluides"):
            self.z.db.add_message(sid, {"role": "user", "content": t})
            self.z.db.add_message(sid, {"role": "assistant", "content": "D'accord."})
        self.assertFalse(lessons.maybe_recap(self.z, sid))       # 2 questions : pas encore
        self.z.db.add_message(sid, {"role": "user", "content": "Je préfère les réponses courtes"})
        self.assertTrue(lessons.maybe_recap(self.z, sid, wait=True))
        self.assertFalse(lessons.maybe_recap(self.z, sid))       # déjà relu
        mems = [m["content"] for m in self.z.db.q("SELECT content FROM memories WHERE source='bilan'")]
        self.assertTrue(mems)                                     # le faux modèle renvoie un souvenir
        self.z.config.set("agent.auto_learn", False)
        for i in range(3):
            self.z.db.add_message(sid, {"role": "user", "content": f"question {i}"})
        self.assertFalse(lessons.maybe_recap(self.z, sid))

    def test_feedback_becomes_a_lesson(self):
        from zeuscore import feedback, lessons
        from zeuscore.prompts import volatile_note
        sid = self.z.owner_session()
        self.z.db.add_message(sid, {"role": "user", "content": "Quelle est la capitale de l'Australie ?"})
        mid = self.z.db.add_message(sid, {"role": "assistant", "content": "Sydney."})
        feedback.record(self.z, sid, mid, "faux", "", "Canberra, pas Sydney")
        note = volatile_note(self.z, "C'est quoi la capitale de l'Australie déjà ?")
        self.assertIn("Leçons de tes erreurs passées", note)
        self.assertIn("Canberra", note)
        self.assertNotIn("Leçons", volatile_note(self.z, "Raconte-moi une blague"))
        self.assertEqual(lessons.relevant(self.z, "bonjour"), [])
        feedback.record(self.z, sid, mid, "long")
        self.assertTrue(self.z.db.q("SELECT id FROM memories WHERE content LIKE '%réponses plus courtes%'"))
