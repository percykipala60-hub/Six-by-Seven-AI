"""Banc d'essai du professeur de langue (python zeus.py pedagogie) : jeu de phrases, comparaison, isolement."""

from __future__ import annotations

import argparse
import contextlib
import io
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from test_zeus import make_zeus  # noqa: E402
from zeuscore import modes  # noqa: E402
from zeuscore.pedagogie import CASES, E, matches, parse_kept, run_eval, score_case  # noqa: E402


class TestJeuDePhrases(unittest.TestCase):
    def test_cases_coherent(self):
        ids = [c["id"] for c in CASES]
        self.assertEqual(len(ids), len(set(ids)), "identifiants en double")
        for c in CASES:
            self.assertIn(c["lang"], modes.LANGS, c["id"])
            self.assertIn(c.get("level"), modes.LEVELS, c["id"])
            for e in c["errors"]:
                hay, needle = (c["text"], e["wrong"]) if e["case"] else (c["text"].lower(), e["wrong"].lower())
                self.assertIn(needle, hay, f"{c['id']} : « {e['wrong']} » absent de la phrase")
                self.assertTrue(e["right"] and e["cat"], c["id"])
                # la phrase de l'élève ne doit pas déjà contenir la correction attendue (sinon le test ne prouve rien)
                self.assertFalse(matches(e, {"error": c["text"], "correction": c["text"]}), c["id"])
        for lang in ("en", "es", "de", "fr"):
            mine = [c for c in CASES if c["lang"] == lang]
            self.assertTrue(any(c["errors"] for c in mine), lang)
            self.assertTrue(any(not c["errors"] and not c.get("native_msg") for c in mine), f"{lang} : pas de piège")
            self.assertTrue(any(c.get("native_msg") for c in mine), f"{lang} : pas de message en langue maternelle")

    def test_matches(self):
        e = E("play", "plays")
        self.assertTrue(matches(e, {"error": "she play basketball", "correction": "she plays basketball"}))
        self.assertFalse(matches(e, {"error": "she play basketball", "correction": "she is playing basketball"}))
        self.assertFalse(matches(e, {"error": "she plays", "correction": "she played"}), "mot entier seulement")
        agree = E("I'm agree", "I agree")
        self.assertTrue(matches(agree, {"error": "I’m agree with you", "correction": "I agree with you"}))
        cap = E("kaffee", "Kaffee", case=True)
        self.assertTrue(matches(cap, {"error": "gern kaffee", "correction": "gern Kaffee"}))
        self.assertFalse(matches(cap, {"error": "gern kaffee", "correction": "gern kaffee."}), "la majuscule compte")
        allee = E("allé", "allée")
        self.assertTrue(matches(allee, {"error": "est allé", "correction": "est allée"}))
        self.assertFalse(matches(allee, {"error": "est allée", "correction": "est allée"}))

    def test_score_case(self):
        case = next(c for c in CASES if c["id"] == "en-3e-personne")
        s = score_case(case, [{"error": "She don't like", "correction": "She doesn't like"},
                              {"error": "football", "correction": "soccer"}])
        self.assertEqual((s["expected"], s["found"]), (2, ["don't"]))
        self.assertEqual([c["error"] for c in s["false"]], ["football"])

    def test_parse_kept(self):
        txt = ("Corrections vérifiées par le correcteur. Recopie-les à la fin de ta réponse, sous « ✏️ Corrections » :\n"
               "- « She don't like » → « She doesn't like » : 3e personne (erreur déjà faite 2 fois)\n"
               "- « play » → « plays »")
        self.assertEqual(parse_kept(txt), [{"error": "She don't like", "correction": "She doesn't like"},
                                           {"error": "play", "correction": "plays"}])
        self.assertEqual(parse_kept("Aucune erreur à enregistrer : n'ajoute pas de section ✏️ Corrections."), [])


class TestBancEssai(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="zeus_pedago_"))
        self.z = make_zeus(self.tmp, phone=False)

    def tearDown(self) -> None:
        self.z.stop()
        self.z.db.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_run_eval_with_fake_teacher(self):
        cases = [c for c in CASES if c["id"] in ("en-3e-personne", "en-piege-phrasal")]
        lines: list[str] = []
        rep = run_eval(self.z, cases, say=lines.append)
        r0, r1 = rep["results"]
        self.assertTrue(r0["tool_called"])
        self.assertEqual(sorted(r0["found"]), ["don't", "play"])
        self.assertEqual([c["error"] for c in r0["false_corrections"]], ["football"])
        self.assertFalse(r1["tool_called"])
        self.assertEqual(r1["false_corrections"], [])
        s = rep["summary"]
        self.assertEqual((s["errors_expected"], s["errors_found"], s["false_corrections"]), (2, 2, 1))
        self.assertEqual((s["traps"], s["traps_clean"]), (1, 1))
        out = "\n".join(lines)
        self.assertIn("fausse(s) correction(s) : « football » → « soccer »", out)
        self.assertIn("erreurs trouvées et bien corrigées : 2/2 (100 %)", out)
        self.assertFalse([s for s in self.z.db.list_sessions(100) if str(s.get("peer", "")).startswith("pedagogie-")],
                         "les conversations d'essai doivent être supprimées")

    def test_command_leaves_real_data_untouched(self):
        import zeus as cli
        home = self.tmp / "data"
        before = self.z.db.q("SELECT COUNT(*) AS n FROM flashcards")[0]["n"]
        # un ancien essai interrompu a pu laisser son dossier : on ne juge que celui de cet essai
        old_tmp = set(Path(tempfile.gettempdir()).glob("zeus-pedagogie-*"))
        args = argparse.Namespace(home=str(home), verbose=False, langue=["en"], oui=True)
        with contextlib.redirect_stdout(io.StringIO()):  # le bilan du faux modèle ne doit pas s'afficher pendant les tests
            cli.cmd_pedagogie(args)
        reports = list((home / "logs").glob("pedagogie-*.json"))
        self.assertEqual(len(reports), 1)
        self.assertIn('"errors_found": 2', reports[0].read_text(encoding="utf-8"))
        self.assertEqual(self.z.db.q("SELECT COUNT(*) AS n FROM flashcards")[0]["n"], before,
                         "le banc d'essai ne doit pas écrire de cartes dans les vraies données")
        self.assertEqual(self.z.db.q("SELECT COUNT(*) AS n FROM lang_errors")[0]["n"], 0)
        self.assertFalse(set(Path(tempfile.gettempdir()).glob("zeus-pedagogie-*")) - old_tmp, "dossier temporaire non effacé")


if __name__ == "__main__":
    unittest.main()
