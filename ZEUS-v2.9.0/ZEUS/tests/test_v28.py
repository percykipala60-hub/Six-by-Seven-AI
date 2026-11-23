"""Tests de la version 2.9 : le banc de tests ZEUS (notation, pannes simulées, rejeu des erreurs signalées)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from test_zeus import LLM, Base  # noqa: E402
from zeuscore import evaluation as ev  # noqa: E402


class TestGrading(unittest.TestCase):
    def test_rules(self):
        t = ev.T("X", "maths", "q", any=["391"], none=["environ"], regex=r"\d+")
        self.assertEqual(ev.grade(t, "17 x 23 = 391", [], 0, []), (True, []))
        ok, why = ev.grade(t, "environ 400", [], 0, [])
        self.assertFalse(ok)
        self.assertEqual(len(why), 2)
        self.assertFalse(ev.grade(ev.T("S", "securite", "q", no_action=True), "fait", [], 0, ["phone_send_sms"])[0])
        self.assertFalse(ev.grade(ev.T("O", "outils", "q", tool="run_python"), "42", ["web_search"], 0, [])[0])
        self.assertFalse(ev.grade(ev.T("K", "consignes", "q", max_words=3), "Le ciel est bleu aujourd'hui", [], 0, [])[0])
        self.assertTrue(ev.grade(ev.T("K", "consignes", "q", max_words=3), "Bleu.", [], 0, [])[0])
        self.assertFalse(ev.grade(ev.T("E", "connaissances", "q"), "", [], 0, [])[0])
        self.assertTrue(ev.grade(ev.T("L", "consignes", "q", lang="en"), "The capital of France is Paris.", [], 0, [])[0])

    def test_catalogue(self):
        ids = [t["id"] for t in ev.TESTS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(ev.TESTS), 25)
        self.assertTrue({t["cat"] for t in ev.TESTS} <= set(ev.CATEGORIES))
        for cat in ("raisonnement", "maths", "securite", "fausse_premisse", "pannes", "documents", "memoire"):
            self.assertTrue(any(t["cat"] == cat for t in ev.TESTS), cat)

    def test_summary_and_comparison(self):
        rs = [{"id": "A", "cat": "maths", "ok": True, "seconds": 2}, {"id": "B", "cat": "maths", "ok": False, "seconds": 3},
              {"id": "C", "cat": "securite", "ok": True, "seconds": 4}]
        s = ev.summarize(rs)
        self.assertEqual((s["ok"], s["total"], s["score"]), (2, 3, 67))
        self.assertEqual(s["by_category"]["maths"], {"ok": 1, "n": 2})
        prev = {"date": "x", "version": "2.8.0", "summary": {"score": 33},
                "results": [{"id": "A", "ok": False}, {"id": "B", "ok": True}, {"id": "C", "ok": True}]}
        c = ev.compare(prev, {"results": rs})
        self.assertEqual(c["regressions"], ["B"])
        self.assertEqual(c["fixed"], ["A"])
        self.assertEqual(ev.compare(None, {"results": rs})["previous"], None)


class TestBenchRun(Base):
    def test_run_mechanics_document_and_memory(self):
        tmp = Path(tempfile.mkdtemp())
        n = len(LLM.requests)
        tests = [t for t in ev.TESTS if t["id"] in ("D01", "ME1", "M01")]
        rep = ev.run(self.z, tmp, tests, say=lambda *_: None)
        self.assertEqual(len(rep["results"]), 3)
        self.assertGreater(len(LLM.requests), n)
        self.assertTrue((tmp / "documents" / "reglement.txt").exists())
        self.assertTrue(self.z.db.q("SELECT id FROM memories WHERE source='banc'"))
        self.assertFalse(self.z.db.find_session("web", "banc"))      # conversations de test effacées
        m01 = next(r for r in rep["results"] if r["id"] == "M01")
        self.assertTrue(m01["ok"])                                   # réflexe sans IA : 17 x 23 = 391

    def test_chaos_restores_configuration(self):
        import zeuscore.llm as L
        before_models, before_routing = list(self.z.config.get("models")), dict(self.z.config.get("routing"))
        old, L.INTERNET_WAIT_BEFORE_LOCAL = L.INTERNET_WAIT_BEFORE_LOCAL, 0
        self.addCleanup(setattr, L, "INTERNET_WAIT_BEFORE_LOCAL", old)
        r = ev.run_test(self.z, ev.T("P", "pannes", "Bonjour", any=["bonjour", "salut", "aide"], chaos="dead_primary"),
                        Path(tempfile.mkdtemp()))
        self.assertTrue(r["reply"])                                  # le modèle de secours a répondu
        self.assertNotEqual(r["model"], "panne")
        self.assertEqual(self.z.config.get("models"), before_models)
        self.assertEqual(self.z.config.get("routing"), before_routing)

    def test_reported_errors_become_tests(self):
        from zeuscore import feedback
        sid = self.z.owner_session()
        self.z.db.add_message(sid, {"role": "user", "content": "Quelle est la capitale de l'Australie ?"})
        mid = self.z.db.add_message(sid, {"role": "assistant", "content": "Sydney."})
        feedback.record(self.z, sid, mid, "faux", "", "Canberra est la capitale")
        feedback.record(self.z, sid, mid, "long")                     # sans réponse attendue : pas de test
        cas = ev.case_tests(self.z.db)
        self.assertEqual(len(cas), 1)
        self.assertEqual(cas[0]["cat"], "cas")
        r = {"reply": "La capitale de l'Australie est Canberra.", "ok": False, "why": []}
        ev._grade_cas(cas[0], r)
        self.assertTrue(r["ok"])
        r = {"reply": "Sydney.", "ok": True, "why": []}
        ev._grade_cas(cas[0], r)
        self.assertFalse(r["ok"])


if __name__ == "__main__":
    unittest.main()
