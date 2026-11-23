"""Tests de la version 2.5 : la fiche « ZEUS sur lui-même » et le bouton « ZEUS s'est trompé »."""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from test_zeus import Base  # noqa: E402
from test_v23 import WebMixin  # noqa: E402

GROQ_KEY = "gsk_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4"


def conversation(z, channel="web", peer="owner", mode=None):
    """Une conversation : question, appel d'outil, résultat, réponse fautive de ZEUS."""
    sid = z.db.create_session(channel, peer, "owner", meta={"mode": mode} if mode else None)
    z.db.add_message(sid, {"role": "user", "content": "Quelle est la capitale de l'Australie ?"})
    z.db.add_message(sid, {"role": "assistant", "content": "",
                           "tool_calls": [{"id": "t1", "name": "web_search",
                                           "arguments": {"query": "capitale Australie", "cle": GROQ_KEY}}]})
    z.db.add_message(sid, {"role": "tool", "tool_call_id": "t1", "name": "web_search", "content": "Canberra…"})
    mid = z.db.add_message(sid, {"role": "assistant", "content": "La capitale de l'Australie est Sydney.",
                                 "meta": {"model": "groq (llama-3.3-70b-versatile)"}})
    return sid, mid


# =========================================================================== fiche « ZEUS sur lui-même »
class TestSelfQuestions(unittest.TestCase):
    def test_detects_questions_about_zeus(self):
        from zeuscore.selfcard import about_self
        for q in ("Qu'est-ce que tu voudrais améliorer chez toi ?", "Quelles sont tes limites ?",
                  "Que sais-tu faire ?", "Tu peux faire quoi exactement ?", "Quel modèle utilises-tu ?",
                  "ZEUS, quels sont tes scores ?", "Qui es-tu ?", "What can you do?"):
            self.assertTrue(about_self(q), q)

    def test_ignores_ordinary_requests(self):
        from zeuscore.selfcard import about_self
        for q in ("Corrige ma phrase : I goed to school", "Quelle est la météo à Kinshasa ?",
                  "Rappelle-moi d'appeler maman", "Améliore mon CV", "Quelle version de Python installer ?", ""):
            self.assertFalse(about_self(q), q)


class TestSelfCard(Base):
    def test_card_reflects_the_real_state(self):
        from zeuscore import __version__, selfcard
        c = selfcard.card(self.z)
        self.assertIn(__version__, c)
        self.assertIn("test (faux", c)                       # le vrai modèle branché
        self.assertIn("images : non", c)
        self.assertIn("n'invente ni capacité", c)
        self.assertIn("pas encore mesuré", c)                # aucun banc d'essai
        self.assertIn("Professeur de langue", c)             # les rôles
        self.assertIn("pas encore traitées : 0", c)
        self.assertNotIn("cle-secrete", c)
        self.assertLess(len(c), 4000)                        # reste léger pour Groq gratuit

    def test_card_reads_the_latest_bench_and_open_cases(self):
        from zeuscore import feedback, selfcard
        logs = self.z.config.dir("logs")
        old = {"date": "2026-11-09", "summary": {"errors_found": 13, "errors_expected": 20}}
        new = {"date": "2026-11-10", "summary": {"errors_found": 15, "errors_expected": 20, "traps_clean": 13,
                                                 "traps": 13, "false_corrections": 0, "failed_runs": 5}}
        (logs / "pedagogie-20261109-0900.json").write_text(json.dumps(old), encoding="utf-8")
        (logs / "pedagogie-20261110-0900.json").write_text(json.dumps(new), encoding="utf-8")
        sid, mid = conversation(self.z)
        feedback.record(self.z, sid, mid, "faux")
        c = selfcard.card(self.z)
        self.assertIn("2026-11-10", c)
        self.assertIn("15/20 fautes trouvées", c)
        self.assertIn("13/13", c)
        self.assertNotIn("13/20", c)
        self.assertIn("pas encore traitées : 1", c)

    def test_groq_limits_only_when_groq_is_used(self):
        from zeuscore import selfcard
        self.assertNotIn("Groq gratuit", selfcard.card(self.z))
        self.z.router.handles[0].cfg["base_url"] = "https://api.groq.com/openai/v1"
        self.assertIn("Groq gratuit", selfcard.card(self.z))

    def test_volatile_note_adds_the_card_only_for_self_questions(self):
        from zeuscore.prompts import volatile_note
        self.assertIn("SUR LUI-MÊME", volatile_note(self.z, "Qu'est-ce que tu veux améliorer chez toi ?"))
        self.assertNotIn("SUR LUI-MÊME", volatile_note(self.z, "Corrige : she don't like apples"))
        self.assertNotIn("SUR LUI-MÊME", volatile_note(self.z, ""))


# =========================================================================== « ZEUS s'est trompé »
class TestFeedback(Base):
    def test_scrub_masks_keys(self):
        from zeuscore.feedback import scrub
        out = scrub(f"clé {GROQ_KEY} et sk-ant-api03-abcdefghijklmnopqrstu et 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")
        self.assertNotIn(GROQ_KEY, out)
        self.assertNotIn("abcdefghijklmnop", out)
        self.assertNotIn("AAHdqTcvCH1vGWJx", out)
        self.assertIn("gsk_••••", out)
        self.assertEqual(scrub("Bonjour, rien à masquer."), "Bonjour, rien à masquer.")

    def test_build_case_takes_the_last_answer_with_its_context(self):
        from zeuscore import feedback
        sid, mid = conversation(self.z, mode={"id": "prof_langue", "lang": "en"})
        case = feedback.build_case(self.z, sid)
        self.assertEqual(case["message_id"], mid)
        self.assertIn("capitale de l'Australie", case["question"])
        self.assertIn("Sydney", case["answer"])
        self.assertEqual(case["tools"][0]["name"], "web_search")
        self.assertNotIn(GROQ_KEY, json.dumps(case))
        self.assertEqual(case["model"], "groq (llama-3.3-70b-versatile)")
        self.assertEqual(case["role"], "prof_langue")
        self.assertEqual(case["channel"], "web")
        with self.assertRaises(KeyError):
            feedback.build_case(self.z, sid, 999999)
        empty = self.z.db.create_session("web", "owner", "owner")
        with self.assertRaises(KeyError):
            feedback.build_case(self.z, empty)

    def test_record_writes_the_database_and_a_json_file(self):
        from zeuscore import feedback
        sid, mid = conversation(self.z)
        q = self.z.bus.subscribe()
        case = feedback.record(self.z, sid, mid, "faux", "erreur de géographie", "Canberra")
        self.assertGreater(case["id"], 0)
        p = Path(case["path"])
        self.assertTrue(p.exists())
        self.assertEqual(p.parent, self.z.home / "cas")
        self.assertTrue(p.name.startswith(time.strftime("%Y%m%d")))
        saved = json.loads(p.read_text(encoding="utf-8"))
        self.assertEqual(saved["expected"], "Canberra")
        self.assertEqual(saved["kind_label"], "réponse fausse")
        self.assertNotIn("cle-secrete", p.read_text(encoding="utf-8"))
        rows = feedback.list_cases(self.z)
        self.assertEqual(rows[0]["status"], "nouveau")
        self.assertEqual(rows[0]["case"]["answer"], "La capitale de l'Australie est Sydney.")
        self.assertEqual(rows[0]["path"], str(p))
        ev = []
        end = time.time() + 2
        while time.time() < end and not ev:
            try:
                e = q.get(timeout=0.2)
                if e.get("type") == "feedback_added":
                    ev.append(e)
            except Exception:  # noqa: BLE001
                pass
        self.assertTrue(ev)
        # un type inconnu devient « autre »
        self.assertEqual(feedback.record(self.z, sid, mid, "nimporte")["kind"], "autre")

    def test_status_changes(self):
        from zeuscore import feedback
        sid, mid = conversation(self.z)
        fid = feedback.record(self.z, sid, mid)["id"]
        self.assertTrue(feedback.set_status(self.z, fid, "test"))
        self.assertEqual(feedback.list_cases(self.z, "test")[0]["id"], fid)
        self.assertEqual(feedback.list_cases(self.z, "nouveau"), [])
        self.assertFalse(feedback.set_status(self.z, 4242, "traite"))
        with self.assertRaises(ValueError):
            feedback.set_status(self.z, fid, "supprime")


class TestFeedbackWeb(WebMixin, Base):
    def setUp(self):
        super().setUp()
        self.start_web()

    def tearDown(self):
        self.web.stop()
        super().tearDown()

    def test_api_round_trip(self):
        sid, mid = conversation(self.z)
        code, r = self.call("/api/feedback", {"session_id": sid, "message_id": mid, "kind": "faux",
                                              "expected": "Canberra", "comment": ""})
        self.assertEqual(code, 200, r)
        fid = r["id"]
        self.assertTrue(Path(r["path"]).exists())
        code, r = self.call("/api/feedback")
        self.assertEqual(code, 200)
        self.assertEqual(r["cases"][0]["id"], fid)
        self.assertIn("faux", r["kinds"])
        code, r = self.call(f"/api/feedback/{fid}", {"status": "traite"}, method="PATCH")
        self.assertEqual((code, r), (200, {"ok": True}))
        code, r = self.call("/api/feedback?status=traite")
        self.assertEqual(len(r["cases"]), 1)
        code, r = self.call(f"/api/feedback/{fid}", {"status": "bof"}, method="PATCH")
        self.assertEqual(code, 400)
        code, r = self.call("/api/feedback/999", {"status": "test"}, method="PATCH")
        self.assertEqual(code, 404)
        code, r = self.call("/api/feedback", {"session_id": "inconnue", "kind": "faux"})
        self.assertEqual(code, 404)
        code, r = self.call("/api/feedback", {"session_id": sid, "message_id": 999999, "kind": "faux"})
        self.assertEqual(code, 404)

    def test_api_requires_login(self):
        import urllib.error
        import urllib.request
        req = urllib.request.Request(self.base + "/api/feedback")
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(req, timeout=10)
        self.assertEqual(cm.exception.code, 401)

    def test_ui_has_the_button(self):
        js = (ROOT / "zeuscore" / "ui" / "app.js").read_text(encoding="utf-8")
        self.assertIn("ZEUS s'est trompé", js)
        self.assertIn('"/api/feedback"', js)
        css = (ROOT / "zeuscore" / "ui" / "app.css").read_text(encoding="utf-8")
        self.assertIn(".wrong-btn", css)


class TestFeedbackTelegram(Base):
    def make_channel(self):
        from zeuscore.channels.telegram import TelegramChannel
        self.z.config.set("telegram.bot_token", "123456789:" + "x" * 35)
        self.z.config.set("owner.telegram_ids", ["555"])
        ch = TelegramChannel(self.z)
        ch.sent = []
        ch.send = lambda peer, text, files=None: ch.sent.append(text)
        return ch

    def update(self, text):
        return {"message": {"chat": {"id": 555, "type": "private"}, "from": {"first_name": "Damien"}, "text": text}}

    def test_erreur_records_the_last_answer(self):
        from zeuscore import feedback
        ch = self.make_channel()
        sid, mid = conversation(self.z, channel="telegram", peer="555")
        ch._handle(self.update("/erreur la capitale est Canberra"))
        self.assertIn("cas n°", ch.sent[-1])
        rows = feedback.list_cases(self.z)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["message_id"], mid)
        self.assertEqual(rows[0]["expected"], "la capitale est Canberra")
        ch._handle(self.update("/faux"))
        self.assertIn("/erreur ta réponse attendue", ch.sent[-1])

    def test_erreur_without_conversation(self):
        ch = self.make_channel()
        ch._handle(self.update("/erreur"))
        self.assertIn("Je ne trouve pas", ch.sent[-1])

    def test_help_mentions_erreur(self):
        ch = self.make_channel()
        ch._handle(self.update("/aide"))
        self.assertIn("/erreur", ch.sent[-1])


class TestCasCommand(Base):
    def run_cas(self, statut=None):
        sys.path.insert(0, str(ROOT))
        import zeus as cli
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            cli.cmd_cas(argparse.Namespace(home=str(self.z.home), statut=statut))
        return out.getvalue()

    def test_lists_and_classifies_cases(self):
        from zeuscore import feedback
        self.assertIn("Aucune erreur signalée", self.run_cas())
        sid, mid = conversation(self.z)
        fid = feedback.record(self.z, sid, mid, "faux", "", "Canberra")["id"]
        out = self.run_cas()
        self.assertIn(f"#{fid} [nouveau]", out)
        self.assertIn("Sydney", out)
        self.assertIn("attendu  : Canberra", out)
        self.assertIn(f"Cas n° {fid} : traite.", self.run_cas([str(fid), "traite"]))
        self.assertIn("introuvable", self.run_cas(["777", "test"]))
        self.assertEqual(feedback.list_cases(self.z, "traite")[0]["id"], fid)


if __name__ == "__main__":
    unittest.main()
