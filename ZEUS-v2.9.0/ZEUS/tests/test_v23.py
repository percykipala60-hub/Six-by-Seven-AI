"""Tests de la version 2.3 : recherche dans mes documents, test de niveau adaptatif, agendas Google / Outlook."""

from __future__ import annotations

import datetime as dt
import http.cookiejar
import http.server
import json
import os
import random
import sqlite3
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
import sys  # noqa: E402

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from test_zeus import Base, ToolsMixin  # noqa: E402


# =========================================================================== serveur de calendrier simulé
class _IcsHandler(http.server.BaseHTTPRequestHandler):
    routes: dict[str, tuple[int, str, str]] = {}

    def do_GET(self):  # noqa: N802
        code, ctype, body = self.routes.get(self.path, (404, "text/plain", "introuvable"))
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


class IcsServer:
    def __init__(self):
        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _IcsHandler)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def url(self, path):
        return f"http://127.0.0.1:{self.port}{path}"

    def set(self, path, body, code=200, ctype="text/calendar"):
        _IcsHandler.routes[path] = (code, ctype, body)


ICS_SRV = IcsServer()


def local(y, m, d, hh=0, mm=0):
    return time.mktime(dt.datetime(y, m, d, hh, mm).timetuple())


def utc_stamp(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def floating(ts):
    return dt.datetime.fromtimestamp(ts).strftime("%Y%m%dT%H%M%S")


# =========================================================================== web
class WebMixin:
    def start_web(self):
        from zeuscore.channels.web import WebServer
        self.web = WebServer(self.z, host="127.0.0.1", port=0)
        self.web.start()
        self.base = f"http://127.0.0.1:{self.web.port}"
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.call("/api/login", {"token": self.z.config.get("web.token")})

    def call(self, path, body=None, method=None, raw=None, headers=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with self.opener.open(req, timeout=30) as r:
                ct = r.headers.get("Content-Type", "")
                b = r.read()
                return r.status, (json.loads(b) if "json" in ct else b)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")


# =========================================================================== bibliothèque
class TestChunking(unittest.TestCase):
    def test_pages_headings_and_overlap(self):
        from zeuscore.kb import chunk_text, snippet
        long_par = " ".join(f"Phrase numéro {i} sur les circuits électriques." for i in range(80))
        text = ("--- page 1 ---\n# Chapitre 1 : Électricité\n\nLa loi d'Ohm relie tension et courant.\n\n"
                f"--- page 2 ---\n{long_par}\n\n--- page 3 ---\nThéorème de Thévenin : tout dipôle linéaire…")
        chunks = chunk_text(text)
        self.assertEqual(chunks[0]["page"], 1)
        self.assertEqual(chunks[0]["heading"], "Chapitre 1 : Électricité")
        self.assertTrue(all(len(c["text"]) <= 1200 for c in chunks))
        self.assertEqual(chunks[-1]["page"], 3)
        self.assertIn("Thévenin", chunks[-1]["text"])
        p2 = [c for c in chunks if c["page"] == 2]
        self.assertGreaterEqual(len(p2), 3)
        # recouvrement : la fin d'un passage se retrouve au début du suivant
        self.assertTrue(any(p2[i]["text"][-60:].split()[-1] in p2[i + 1]["text"][:220] for i in range(len(p2) - 1)))
        # extrait centré sur les mots cherchés
        sn = snippet(long_par + " Le théorème de Norton est le dual.", ["norton"], 200)
        self.assertIn("Norton", sn)
        self.assertTrue(sn.startswith("…"))

    def test_text_without_pages(self):
        from zeuscore.kb import chunk_text
        chunks = chunk_text("Une seule ligne.")
        self.assertEqual(chunks, [{"page": 0, "heading": "", "text": "Une seule ligne."}])
        self.assertEqual(chunk_text(""), [])


class TestLibrary(ToolsMixin, Base):
    def make_docs(self):
        from zeuscore.tools.office import write_docx
        d = self.tmp / "Cours"
        (d / "Physique").mkdir(parents=True)
        (d / ".git").mkdir()
        (d / "node_modules").mkdir()
        (d / "Physique" / "electricite.md").write_text(
            "# Électricité\n\nLe théorème de Thévenin permet de remplacer un réseau linéaire par un générateur "
            "et une résistance.\n\n## Loi d'Ohm\n\nU = R × I : la tension est proportionnelle au courant.",
            encoding="utf-8")
        (d / "histoire.txt").write_text("La révolution française commence en 1789 avec la prise de la Bastille.",
                                        encoding="utf-8")
        write_docx(d / "contrats.docx", "# Droit du travail\nLe préavis de démission est d'un mois pour un employé.\n"
                                        "Les contrats à durée déterminée sont limités.", title="RH")
        (d / ".git" / "secret.txt").write_text("thevenin caché", encoding="utf-8")
        (d / "node_modules" / "x.md").write_text("thevenin module", encoding="utf-8")
        (d / "~$brouillon.docx").write_text("x", encoding="utf-8")
        (d / "photo.png").write_bytes(b"\x89PNG")
        return d

    def test_index_search_update_remove(self):
        lib = self.z.library
        d = self.make_docs()
        where, new = lib.add_folder(str(d))
        self.assertTrue(new)
        self.assertEqual(lib.add_folder(str(d)), (where, False))
        st = lib.index()
        self.assertEqual(st["new"], 3, st)  # .git, node_modules, ~$ et image (sans OCR) ignorés
        # accents ignorés et pluriel → singulier
        hits = lib.search("theoreme de thevenin")
        self.assertEqual(hits[0]["name"], "electricite.md")
        self.assertEqual(hits[0]["heading"], "Électricité")
        self.assertIn("Thévenin", hits[0]["snippet"])
        hits = lib.search("préavis démissions")
        self.assertEqual(hits[0]["name"], "contrats.docx")
        self.assertEqual(lib.search("xylophone quantique"), [])
        self.assertEqual(lib.search("le la de"), [])  # que des mots vides
        # rien ne change → rien n'est relu
        st = lib.index()
        self.assertEqual((st["new"], st["updated"], st["same"]), (0, 0, 3))
        # fichier modifié, ajouté, supprimé
        time.sleep(0.05)
        f = d / "histoire.txt"
        f.write_text("La révolution française commence en 1789. Napoléon devient empereur en 1804.", encoding="utf-8")
        os.utime(f, (time.time() + 5, time.time() + 5))
        (d / "Physique" / "electricite.md").unlink()
        (d / "Physique" / "optique.txt").write_text("La réfraction de la lumière suit la loi de Snell-Descartes.",
                                                    encoding="utf-8")
        st = lib.index()
        self.assertEqual((st["new"], st["updated"], st["removed"]), (1, 1, 1), st)
        self.assertEqual(lib.search("Napoléon empereur")[0]["name"], "histoire.txt")
        self.assertEqual(lib.search("thevenin"), [])
        self.assertEqual(lib.search("refraction lumiere")[0]["name"], "optique.txt")
        # filtre par dossier
        self.assertEqual(lib.search("refraction", folder=str(d / "Physique"))[0]["name"], "optique.txt")
        self.assertEqual(lib.search("napoleon", folder=str(d / "Physique")), [])
        # tâche automatique de réindexation créée une seule fois
        lib.ensure_job()
        self.assertEqual(sum(1 for s in self.z.db.list_schedules() if s["kind"] == "system:kb_index"), 1)
        # retirer le dossier
        self.assertEqual(lib.remove_folder(str(d)), 3)
        self.assertEqual(lib.summary()["docs"], 0)
        self.assertTrue(f.exists())  # les fichiers ne sont pas touchés

    def test_refuse_drive_root_and_missing(self):
        lib = self.z.library
        with self.assertRaises(ValueError):
            lib.add_folder(str(self.tmp / "nexiste-pas"))
        with self.assertRaises(ValueError):
            lib.add_folder(os.path.abspath(os.sep))

    def test_tools(self):
        d = self.make_docs()
        r = self.run_tool("docs_search", query="Thévenin")
        self.assertFalse(r.error)
        self.assertIn("bibliothèque est vide", r.text)
        r = self.run_tool("docs_add_folder", path=str(d))
        self.assertFalse(r.error, r.text)
        self.assertIn("3 document(s)", r.text)
        r = self.run_tool("docs_search", query="théorème Thévenin")
        self.assertIn("[1] electricite.md", r.text)
        self.assertIn("Cite les sources", r.text)
        hit = r.data["hits"][0]
        r = self.run_tool("docs_read", doc_id=hit["doc_id"], chunk=hit["chunk_id"])
        self.assertIn("générateur", r.text)
        self.assertTrue(self.run_tool("docs_read", doc_id=9999).error)
        r = self.run_tool("docs_list", query="contrat")
        self.assertIn("contrats.docx", r.text)
        r = self.run_tool("docs_search", query="volcan")
        self.assertIn("Aucun passage", r.text)
        r = self.run_tool("docs_remove_folder", path=str(d))
        self.assertIn("3 document(s) oublié(s)", r.text)
        self.assertTrue(self.run_tool("docs_add_folder", path=str(self.tmp / "absent")).error)

    def test_pdf_pages_are_cited(self):
        from zeuscore.kb import cite
        d = self.tmp / "pdfs"
        d.mkdir()
        lib = self.z.library
        lib.add_folder(str(d))
        # texte déjà extrait page par page (comme pypdf) : on simule via un .txt au format des marqueurs
        (d / "cours.txt").write_text("--- page 1 ---\nIntroduction.\n--- page 7 ---\nLa photosynthèse produit de "
                                     "l'oxygène.", encoding="utf-8")
        lib.index()
        hit = lib.search("photosynthese")[0]
        self.assertEqual(hit["page"], 7)
        self.assertEqual(cite(hit), "cours.txt, p. 7")
        r = lib.read(hit["doc_id"], page=7)
        self.assertIn("[page 7]", r["text"])

    def test_toolset_hints_and_roles(self):
        from zeuscore import modes
        from zeuscore.agent import detect_toolsets
        av = set(self.z.registry.toolsets())
        self.assertIn("knowledge", av)
        self.assertIn("knowledge", detect_toolsets("Que dit mon cours sur la loi d'Ohm ?", av))
        self.assertIn("knowledge", detect_toolsets("Cherche dans mes documents le contrat de Paul", av))
        self.assertNotIn("knowledge", detect_toolsets("Quelle heure est-il ?", av))
        self.assertIn("knowledge", modes.toolsets({"id": "chercheur"}))
        self.assertIn("knowledge", modes.toolsets({"id": "rh"}))


class TestLibraryWeb(WebMixin, ToolsMixin, Base):
    def setUp(self):
        super().setUp()
        self.start_web()

    def tearDown(self):
        self.web.stop()
        super().tearDown()

    def test_api(self):
        code, r = self.call("/api/kb")
        self.assertEqual(code, 200)
        self.assertEqual(r["docs"], 0)
        self.assertEqual(self.call("/api/kb/folders", {"path": ""})[0], 400)
        self.assertEqual(self.call("/api/kb/folders", {"path": str(self.tmp / "absent")})[0], 400)
        # dépôt d'un fichier
        name = urllib.parse.quote("Fiche révision.md")
        code, r = self.call("/api/kb/upload", raw="# Biologie\n\nLa mitose produit deux cellules filles.".encode(),
                            headers={"X-Filename": name, "Content-Type": "application/octet-stream"})
        self.assertEqual(code, 200, r)
        self.assertEqual(r["doc"]["status"], "ok")
        code, r = self.call("/api/kb/upload", raw=b"MZ", headers={"X-Filename": "virus.exe"})
        self.assertEqual(code, 415)
        code, s = self.call("/api/kb/search?q=" + urllib.parse.quote("mitose"))
        self.assertEqual(s["hits"][0]["name"], "Fiche révision.md")
        self.assertIn("/api/file?path=", s["hits"][0]["url"])
        self.assertEqual(self.call("/api/kb/search?q=")[1], {"hits": []})
        code, t = self.call(f"/api/kb/docs/{s['hits'][0]['doc_id']}?chunk={s['hits'][0]['chunk_id']}")
        self.assertIn("cellules filles", t["text"])
        self.assertEqual(self.call("/api/kb/docs/999")[0], 404)
        # dossier suivi, indexé en arrière-plan
        d = self.tmp / "Notes"
        d.mkdir()
        (d / "a.txt").write_text("Le budget prévisionnel 2027 prévoit trois embauches.", encoding="utf-8")
        code, r = self.call("/api/kb/folders", {"path": str(d)})
        self.assertEqual(code, 200, r)
        end = time.time() + 10
        while time.time() < end and not self.z.library.search("embauches"):
            time.sleep(0.1)
        self.assertEqual(self.z.library.search("embauches")[0]["name"], "a.txt")
        code, r = self.call("/api/kb")
        self.assertEqual(r["docs"], 2)
        self.assertIn(str(d), r["folders"])
        self.assertEqual(self.call("/api/kb/reindex", {})[0], 200)
        time.sleep(0.3)
        code, r = self.call("/api/kb/folders/remove", {"path": str(d)})
        self.assertEqual(r["removed"], 1)
        code, page = self.call("/")
        self.assertIn(b'id="view-documents"', page)


# =========================================================================== test de niveau
class TestPlacement(unittest.TestCase):
    def setUp(self):
        from zeuscore.store import Store
        self.tmp = Path(tempfile.mkdtemp())
        self.db = Store(self.tmp / "t.db")

    def tearDown(self):
        self.db.close()

    def test_bank_is_well_formed(self):
        from zeuscore.placement_bank import BANK
        self.assertEqual(set(BANK), {"en", "es", "de", "fr"})
        for lang, items in BANK.items():
            for lvl in range(1, 7):
                self.assertGreaterEqual(sum(1 for it in items if it[0] == lvl), 5, (lang, lvl))
            for lvl, skill, prompt, opts, expl in items:
                self.assertEqual(len(opts), 4, prompt)
                self.assertEqual(len(set(opts)), 4, prompt)
                self.assertTrue(all(o.strip() for o in opts), prompt)
                self.assertIn(skill, ("grammaire", "vocabulaire"))
                self.assertTrue(expl.strip())
                if "___" not in prompt:
                    self.assertTrue(prompt.endswith(("…", "?")), prompt)

    def _run(self, lang, answer):
        from zeuscore.placement import Placement
        from zeuscore.placement_bank import BANK
        pl = Placement(self.db)
        v = pl.start(lang)
        seen = set()
        while "result" not in v:
            self.assertIn("question", v)
            self.assertNotIn(v["question"]["prompt"], seen)  # jamais deux fois la même question
            seen.add(v["question"]["prompt"])
            st = self.db.placement_get(v["id"])["state"]["current"]
            lvl = BANK[lang][st["idx"]][0]
            good = answer(lvl)
            choice = st["order"].index(0) if good else st["order"].index(1)
            v = pl.answer(v["id"], choice)
            self.assertEqual(v["feedback"]["ok"], good)
        return v

    def test_adapts_to_ideal_learners(self):
        for lang in ("en", "es", "de", "fr"):
            for true in range(1, 7):
                self.db.x("DELETE FROM placement")
                v = self._run(lang, lambda lvl: lvl <= true)
                r = v["result"]
                self.assertEqual(r["level"], "A1 A2 B1 B2 C1 C2".split()[true - 1], (lang, true, r))
                self.assertTrue(10 <= r["total"] <= 16)

    def test_noisy_learner_is_close(self):
        from zeuscore.placement import LEVELS
        rnd = random.Random(7)
        diffs = []
        for _ in range(30):
            self.db.x("DELETE FROM placement")
            v = self._run("en", lambda lvl: rnd.random() < (0.9 if lvl <= 4 else 0.3))
            diffs.append(abs(LEVELS.index(v["result"]["level"]) - 3))
        self.assertGreaterEqual(diffs.count(0), 18)  # B2 trouvé la plupart du temps
        self.assertLessEqual(max(diffs), 1)          # jamais à plus d'un niveau

    def test_prior_from_history_and_errors(self):
        from zeuscore.placement import Placement
        pl = Placement(self.db)
        self._run("es", lambda lvl: lvl <= 5)
        v = pl.start("es")
        self.assertGreater(self.db.placement_get(v["id"])["state"]["prior"], 4.5)  # reprend près de C1
        with self.assertRaises(ValueError):
            pl.answer(v["id"], 7)
        with self.assertRaises(KeyError):
            pl.answer("inconnu", 0)
        with self.assertRaises(ValueError):
            pl.start("it")
        # options mélangées, bonne réponse jamais envoyée au navigateur
        self.assertNotIn("correct", json.dumps(v["question"]))


class TestPlacementWeb(WebMixin, Base):
    def setUp(self):
        super().setUp()
        self.start_web()

    def tearDown(self):
        self.web.stop()
        super().tearDown()

    def test_api_flow(self):
        from zeuscore.placement_bank import BANK
        self.assertEqual(self.call("/api/learn/placement", {"lang": "italien"})[0], 400)
        code, v = self.call("/api/learn/placement", {"lang": "allemand"})
        self.assertEqual(code, 200, v)
        self.assertEqual(v["lang"], "de")
        self.assertEqual(self.call(f"/api/learn/placement/{v['id']}", {"choice": "x"})[0], 400)
        self.assertEqual(self.call("/api/learn/placement/zzz", {"choice": 0})[0], 404)
        while "result" not in v:
            st = self.z.db.placement_get(v["id"])["state"]["current"]
            good = BANK["de"][st["idx"]][0] <= 3
            code, v = self.call(f"/api/learn/placement/{v['id']}", {"choice": st["order"].index(0 if good else 2)})
            self.assertEqual(code, 200, v)
        self.assertEqual(v["result"]["level"], "B1")
        prog = self.z.db.list_progress("allemand")
        self.assertEqual(len(prog), 1)
        self.assertEqual(prog[0]["topic"], "test de niveau")
        self.assertIn("Niveau B1", prog[0]["notes"])
        # un second appel sur un test fini ne réenregistre pas la progression
        self.call(f"/api/learn/placement/{v['id']}", {"choice": 0})
        self.assertEqual(len(self.z.db.list_progress("allemand")), 1)
        code, learn = self.call("/api/learn")
        self.assertEqual(learn["levels"]["de"]["level"], "B1")
        code, hist = self.call("/api/learn/placement?lang=de")
        self.assertEqual(hist["history"][0]["level"], "B1")


# =========================================================================== agendas
def sample_ics(base_day: dt.date) -> str:
    """Calendrier type Google : ponctuel en UTC, récurrent avec fuseau, exception, occurrence déplacée, annulé."""
    y, m, d = base_day.year, base_day.month, base_day.day
    t_single = local(y, m, d, 9, 0) + 2 * 86400
    rec_start = dt.datetime(y, m, d, 10, 0) + dt.timedelta(days=1)
    ex = rec_start + dt.timedelta(weeks=1)
    moved_orig = rec_start + dt.timedelta(weeks=2)
    moved_new = moved_orig + dt.timedelta(hours=4)
    allday = (base_day + dt.timedelta(days=3)).strftime("%Y%m%d")
    allday_end = (base_day + dt.timedelta(days=4)).strftime("%Y%m%d")
    return "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
        "BEGIN:VTIMEZONE", "TZID:Africa/Lagos", "END:VTIMEZONE",
        "BEGIN:VEVENT", "UID:single@google.com", f"DTSTART:{utc_stamp(t_single)}",
        f"DTEND:{utc_stamp(t_single + 5400)}", "SUMMARY:Rendez-vous banque\\, agence centre",
        "LOCATION:Avenue du Commerce", "DESCRIPTION:Apporter les relevés\\net la carte", "ATTENDEE;CN=Paul Mbala:mailto:paul@x.cd",
        "BEGIN:VALARM", "TRIGGER:-PT10M", "SUMMARY:alarme interne", "END:VALARM", "END:VEVENT",
        "BEGIN:VEVENT", "UID:weekly@google.com", f"DTSTART:{rec_start:%Y%m%dT%H%M%S}", "DURATION:PT1H",
        "RRULE:FREQ=WEEKLY;COUNT=5", f"EXDATE:{ex:%Y%m%dT%H%M%S}", "SUMMARY:Cours d'anglais", "END:VEVENT",
        "BEGIN:VEVENT", "UID:weekly@google.com", f"RECURRENCE-ID:{moved_orig:%Y%m%dT%H%M%S}",
        f"DTSTART:{moved_new:%Y%m%dT%H%M%S}", f"DTEND:{moved_new + dt.timedelta(hours=1):%Y%m%dT%H%M%S}",
        "SUMMARY:Cours d'anglais (déplacé)", "END:VEVENT",
        "BEGIN:VEVENT", "UID:allday@google.com", f"DTSTART;VALUE=DATE:{allday}", f"DTEND;VALUE=DATE:{allday_end}",
        "SUMMARY:Anniversaire de Maman", "END:VEVENT",
        "BEGIN:VEVENT", "UID:cancel@google.com", f"DTSTART:{utc_stamp(t_single + 3600)}",
        f"DTEND:{utc_stamp(t_single + 7200)}", "STATUS:CANCELLED", "SUMMARY:Annulé", "END:VEVENT",
        "BEGIN:VEVENT", "UID:broken@google.com", "DTSTART:pas-une-date", "SUMMARY:Cassé", "END:VEVENT",
        "BEGIN:VEVENT", "UID:old@google.com", "DTSTART:20200101T100000Z", "DTEND:20200101T110000Z",
        "SUMMARY:Trop ancien", "END:VEVENT",
        "BEGIN:VEVENT", "UID:folded@google.com", f"DTSTART:{utc_stamp(t_single + 86400)}",
        f"DTEND:{utc_stamp(t_single + 86400 + 1800)}", "SUMMARY:Réunion avec un titre très long qui est replié",
        "  sur deux lignes", "END:VEVENT",
        "END:VCALENDAR", ""])


class TestIcsParsing(unittest.TestCase):
    def test_google_like_calendar(self):
        from zeuscore.calendar_sync import parse_ics
        today = dt.date.today()
        now = time.mktime(today.timetuple())
        evs = parse_ics(sample_ics(today), now - 86400, now + 60 * 86400)
        titles = [e["title"] for e in evs]
        self.assertIn("Rendez-vous banque, agence centre", titles)
        self.assertNotIn("Annulé", titles)
        self.assertNotIn("Trop ancien", titles)
        self.assertNotIn("Cassé", titles)  # un événement illisible n'empêche pas de lire les autres
        self.assertNotIn("alarme interne", titles)
        self.assertIn("Réunion avec un titre très long qui est replié sur deux lignes", titles)
        bank = next(e for e in evs if e["title"].startswith("Rendez-vous banque"))
        self.assertEqual(bank["notes"], "Apporter les relevés\net la carte")
        self.assertEqual(bank["attendees"], "Paul Mbala")
        self.assertEqual(bank["end"] - bank["start"], 5400)
        self.assertEqual(dt.datetime.fromtimestamp(bank["start"]).hour, 9)
        courses = sorted(e["start"] for e in evs if e["title"] == "Cours d'anglais")
        self.assertEqual(len(courses), 3)  # 5 occurrences − 1 exception − 1 déplacée
        self.assertEqual([dt.datetime.fromtimestamp(c).hour for c in courses], [10, 10, 10])
        moved = next(e for e in evs if e["title"] == "Cours d'anglais (déplacé)")
        self.assertEqual(dt.datetime.fromtimestamp(moved["start"]).hour, 14)
        bday = next(e for e in evs if e["title"] == "Anniversaire de Maman")
        self.assertTrue(bday["allday"])
        self.assertEqual(bday["end"] - bday["start"], 86400)
        self.assertEqual(len({e["uid"] for e in evs}), len(evs))

    def test_rrules(self):
        from zeuscore.calendar_sync import expand, parse_rrule
        start = dt.datetime(2026, 1, 5, 9, 0)  # lundi
        far = dt.datetime(2027, 1, 1)
        occ = expand(start, parse_rrule("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6"), None, far, start)
        self.assertEqual([d.day for d in occ], [5, 7, 9, 12, 14, 16])
        occ = expand(start, parse_rrule("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"), dt.datetime(2026, 2, 28), far, start)
        self.assertEqual([d.strftime("%m-%d") for d in occ], ["01-06", "01-20", "02-03", "02-17"])
        occ = expand(start, parse_rrule("FREQ=MONTHLY;BYDAY=1MO;COUNT=3"), None, far, start)
        self.assertEqual([d.strftime("%m-%d") for d in occ], ["01-05", "02-02", "03-02"])
        occ = expand(start, parse_rrule("FREQ=MONTHLY;BYDAY=-1FR;COUNT=2"), None, far, start)
        self.assertEqual([d.strftime("%m-%d") for d in occ], ["01-30", "02-27"])
        occ = expand(dt.datetime(2026, 1, 31, 8), parse_rrule("FREQ=MONTHLY;COUNT=3"), None, far, start)
        self.assertEqual([d.strftime("%m-%d") for d in occ], ["01-31", "03-31", "05-31"])  # pas de 31 février
        occ = expand(start, parse_rrule("FREQ=DAILY;INTERVAL=3;COUNT=4"), None, far, start)
        self.assertEqual([d.day for d in occ], [5, 8, 11, 14])
        occ = expand(dt.datetime(2024, 2, 29, 8), parse_rrule("FREQ=YEARLY"), None, dt.datetime(2032, 12, 31),
                     dt.datetime(2024, 1, 1))
        self.assertEqual([d.year for d in occ], [2024, 2028, 2032])
        # une série ancienne ne renvoie que la fenêtre demandée
        occ = expand(dt.datetime(2015, 1, 1, 9), parse_rrule("FREQ=DAILY"), None, dt.datetime(2026, 1, 10),
                     dt.datetime(2026, 1, 1))
        self.assertEqual(len(occ), 9)  # du 1er au 9 janvier à 9 h (le 10 à 9 h dépasse la fenêtre)

    def test_timezones_and_links(self):
        from zeuscore.calendar_sync import _tz, google_link, outlook_link, parse_dt, provider_of, to_ts
        w, allday, tz = parse_dt("20261110T090000", {"TZID": "Romance Standard Time"})
        if tz is not None:  # base des fuseaux disponible (toujours sous Linux ; sous Windows avec tzdata)
            self.assertEqual(to_ts(w, tz), dt.datetime(2026, 11, 10, 8, 0, tzinfo=dt.timezone.utc).timestamp())
        self.assertEqual(to_ts(*parse_dt("20261110T080000Z", {})[::2]),
                         dt.datetime(2026, 11, 10, 8, 0, tzinfo=dt.timezone.utc).timestamp())
        self.assertIsNone(_tz("Fuseau/Inexistant"))
        e = {"title": "Réunion budget", "start": 1794207600.0, "end": 1794211200.0, "location": "Salle 2",
             "notes": "Ordre du jour"}
        g = urllib.parse.parse_qs(urllib.parse.urlparse(google_link(e)).query)
        self.assertEqual(g["text"], ["Réunion budget"])
        self.assertEqual(g["dates"], ["20261109T070000Z/20261109T080000Z"])
        o = urllib.parse.parse_qs(urllib.parse.urlparse(outlook_link(e)).query)
        self.assertEqual(o["subject"], ["Réunion budget"])
        self.assertEqual(o["startdt"], ["2026-11-09T07:00:00Z"])
        self.assertIn("outlook.office.com", outlook_link(e, work=True))
        self.assertEqual(provider_of("https://calendar.google.com/calendar/ical/x/basic.ics"), "Google Agenda")
        self.assertEqual(provider_of("https://outlook.live.com/owa/calendar/x/calendar.ics"), "Outlook")


class TestCalendarSync(WebMixin, ToolsMixin, Base):
    def setUp(self):
        super().setUp()
        self.start_web()

    def tearDown(self):
        self.web.stop()
        super().tearDown()

    def test_connect_sync_conflicts_and_feed(self):
        today = dt.date.today()
        ICS_SRV.set("/google.ics", sample_ics(today))
        ICS_SRV.set("/page.html", "<html><body>Connexion</body></html>", ctype="text/html")
        ICS_SRV.set("/revoque.ics", "Not found", code=404)
        self.assertTrue(self.run_tool("calendar_connect", url="ftp://x").error)
        r = self.run_tool("calendar_connect", url=ICS_SRV.url("/page.html"))
        self.assertTrue(r.error)
        self.assertIn("page web", r.text)
        self.assertEqual(self.z.calendars.feeds(), [])  # un lien invalide n'est pas gardé
        r = self.run_tool("calendar_connect", url=ICS_SRV.url("/google.ics").replace("http://", "http://"),
                          name="Agenda perso", remind=15)
        self.assertFalse(r.error, r.text)
        self.assertIn("rendez-vous importés", r.text)
        feed = self.z.calendars.feeds()[0]
        self.assertEqual(feed["name"], "Agenda perso")
        self.assertEqual(sum(1 for s in self.z.db.list_schedules() if s["kind"] == "system:calendar_sync"), 1)
        # les rendez-vous importés apparaissent dans l'agenda, avec leur source
        r = self.run_tool("agenda_list", days=30)
        self.assertIn("Rendez-vous banque, agence centre", r.text)
        self.assertIn("[Agenda perso]", r.text)
        ev = next(e for e in self.z.db.list_events(0, 4e9) if e["title"].startswith("Rendez-vous banque"))
        # lecture seule
        r = self.run_tool("agenda_delete", id=ev["id"])
        self.assertTrue(r.error)
        self.assertIn("Google Agenda ou Outlook", r.text)
        self.assertEqual(self.call(f"/api/office/events/{ev['id']}", method="DELETE")[0], 409)
        # conflit signalé quand ZEUS ajoute un rendez-vous au même moment
        when = dt.datetime.fromtimestamp(ev["start"] + 1800).strftime("%Y-%m-%d %H:%M")
        r = self.run_tool("agenda_add", title="Dentiste", when=when, duration=30)
        self.assertIn("Conflit avec", r.text)
        self.assertIn("[Agenda perso]", r.text)
        self.assertIn("calendar.google.com/calendar/render", r.text)
        self.assertIn("outlook.live.com", r.text)
        # rappels créés pour les rendez-vous des 48 prochaines heures (le cours de demain, la banque…)
        st = self.z.calendars.status()[feed["id"]]
        self.assertTrue(st["ok"])
        self.assertGreaterEqual(st["reminders"], 1)
        reminders_before = [s for s in self.z.db.list_schedules() if s["kind"] == "reminder"]
        # resynchroniser ne duplique ni les rendez-vous ni les rappels
        n_before = len(self.z.db.list_events(0, 4e9))
        self.z.calendars.sync_all()
        self.assertEqual(len(self.z.db.list_events(0, 4e9)), n_before)
        self.assertEqual(len([s for s in self.z.db.list_schedules() if s["kind"] == "reminder"]), len(reminders_before))
        # API de l'agenda : liens pour les rendez-vous de ZEUS, source pour les importés
        code, office = self.call("/api/office")
        mine = next(e for e in office["events"] if e["title"] == "Dentiste")
        self.assertIn("calendar.google.com", mine["google"])
        imp = next(e for e in office["events"] if e["title"].startswith("Rendez-vous banque"))
        self.assertEqual(imp["source_name"], "Agenda perso")
        self.assertNotIn("google", imp)
        code, cal = self.call("/api/calendar")
        self.assertEqual(cal["feeds"][0]["status"]["ok"], True)
        self.assertTrue(cal["feeds"][0]["url"].endswith("…"))  # l'adresse secrète n'est pas renvoyée en entier
        # flux .ics de ZEUS : seulement ses propres rendez-vous, lien secret obligatoire
        tok = self.z.calendars.feed_token()
        self.assertIn(tok, cal["feed_url"])
        req = urllib.request.Request(self.base + f"/api/calendar/zeus-{tok}.ics")
        with urllib.request.urlopen(req, timeout=10) as resp:  # sans cookie de connexion
            body = resp.read().decode()
        self.assertIn("SUMMARY:Dentiste", body)
        self.assertNotIn("banque", body)
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(self.base + "/api/calendar/zeus-mauvais.ics", timeout=10)
        # export .ics : sans les rendez-vous importés (ils reviendraient en double dans Google)
        r = self.run_tool("agenda_export", path=str(self.tmp / "a.ics"))
        self.assertNotIn("banque", (self.tmp / "a.ics").read_text(encoding="utf-8"))
        # lien révoqué : erreur claire, anciens rendez-vous conservés
        cfg = self.z.calendars.feeds()
        cfg[0]["url"] = ICS_SRV.url("/revoque.ics")
        self.z.config.set("calendar.feeds", cfg)
        st = self.z.calendars.sync(cfg[0])
        self.assertFalse(st["ok"])
        self.assertIn("404", st["error"])
        self.assertIn("ERREUR", self.run_tool("calendar_feeds").text)
        self.assertEqual(len(self.z.db.list_events(0, 4e9)), n_before)
        # débrancher : rendez-vous et rappels importés disparaissent
        self.assertIn("débranché", self.run_tool("calendar_disconnect", id=feed["id"]).text)
        left = self.z.db.list_events(0, 4e9)
        self.assertEqual([e["title"] for e in left], ["Dentiste"])
        self.assertEqual(sum(1 for s in self.z.db.list_schedules() if s["kind"] == "system:calendar_sync"), 0)
        self.assertLess(len([s for s in self.z.db.list_schedules() if s["kind"] == "reminder"]), len(reminders_before))

    def test_web_add_feed_and_webcal(self):
        ICS_SRV.set("/o.ics", sample_ics(dt.date.today()))
        code, r = self.call("/api/calendar/feeds", {"url": "pas une adresse"})
        self.assertEqual(code, 400)
        code, r = self.call("/api/calendar/feeds", {"url": ICS_SRV.url("/o.ics"), "name": "Bureau"})
        self.assertEqual(code, 200, r)
        self.assertGreater(r["status"]["events"], 3)
        code, r = self.call("/api/calendar/sync", {})
        self.assertTrue(r["results"][0]["ok"])
        from zeuscore.calendar_sync import CalendarSync
        self.assertEqual(CalendarSync.normalize_url("webcal://p01-calendars.icloud.com/x.ics"),
                         "https://p01-calendars.icloud.com/x.ics")
        code, r = self.call("/api/calendar/feeds/bureau", method="DELETE")
        self.assertTrue(r["ok"])


class TestMigration(unittest.TestCase):
    def test_old_database_gets_new_columns(self):
        tmp = Path(tempfile.mkdtemp())
        db = sqlite3.connect(tmp / "zeus.db")
        db.execute("CREATE TABLE agenda(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, start REAL, end REAL, "
                   "location TEXT DEFAULT '', notes TEXT DEFAULT '', attendees TEXT DEFAULT '', reminder_id INTEGER, "
                   "created REAL)")
        db.execute("INSERT INTO agenda(title,start,end,created) VALUES('ancien',1,2,3)")
        db.commit()
        db.close()
        from zeuscore.store import Store
        s = Store(tmp / "zeus.db")
        cols = {r["name"] for r in s.q("PRAGMA table_info(agenda)")}
        self.assertTrue({"source", "uid", "url"} <= cols)
        self.assertEqual(s.list_events(0, 10)[0]["source"], "")
        s.close()


if __name__ == "__main__":
    unittest.main()
