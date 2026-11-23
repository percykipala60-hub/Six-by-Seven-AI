"""Bibliothèque de ZEUS : recherche dans tes propres documents (cours, notes, PDF, Word, dossiers RH…).

Tout reste sur la machine. ZEUS lit les dossiers que tu lui confies, découpe chaque document en passages
(avec le numéro de page pour les PDF) et les range dans un index plein texte SQLite (FTS5, insensible aux
accents). Une recherche renvoie les meilleurs passages avec leur source, que le modèle cite dans sa réponse.
Aucune dépendance : on réutilise l'extraction de texte de tools/documents.py.
"""

from __future__ import annotations

import os
import re
import threading
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Callable

from .util import keywords, log, norm

if TYPE_CHECKING:  # pragma: no cover
    from .core import Zeus

# Formats indexés (les images ne le sont que si l'OCR est activé : c'est lent)
DOC_EXT = {".pdf", ".docx", ".docm", ".pptx", ".ppsx", ".xlsx", ".xlsm", ".odt", ".ods", ".odp", ".rtf", ".eml",
           ".txt", ".md", ".markdown", ".html", ".htm", ".csv", ".tsv", ".json", ".tex", ".srt", ".vtt", ".log"}
IMG_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}
SKIP_DIRS = {".git", ".svn", "node_modules", "__pycache__", ".venv", "venv", "env", "$recycle.bin", "appdata",
             ".cache", ".idea", ".vscode", "site-packages", "dist", "build", ".tox", "system volume information"}
CHUNK_CHARS = 1000
CHUNK_OVERLAP = 150
MAX_DOC_CHARS = 600_000
MAX_FILES = 20_000
PAGE_RE = re.compile(r"^--- page(?: (\d+))? ---\s*$", re.M)


# =========================================================================== découpage
def _paragraphs(text: str) -> list[str]:
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    out: list[str] = []
    for p in parts:
        if len(p) <= CHUNK_CHARS:
            out.append(p)
            continue
        # paragraphe trop long : on coupe aux fins de phrase, sinon brutalement
        buf = ""
        for s in re.split(r"(?<=[.!?;:])\s+", p):
            while len(s) > CHUNK_CHARS:
                if buf:
                    out.append(buf)
                    buf = ""
                out.append(s[:CHUNK_CHARS])
                s = s[CHUNK_CHARS:]
            if len(buf) + len(s) + 1 > CHUNK_CHARS and buf:
                out.append(buf)
                buf = s
            else:
                buf = f"{buf} {s}".strip()
        if buf:
            out.append(buf)
    return out


def _heading_of(par: str) -> str:
    first = par.split("\n", 1)[0].strip()
    if first.startswith("#"):
        return first.lstrip("#").strip()[:120]
    if 3 <= len(first) <= 80 and not first.endswith((".", ",", ";")) and "\n" in par:
        letters = [c for c in first if c.isalpha()]
        if letters and (sum(c.isupper() for c in letters) / len(letters) > 0.7 or re.match(r"^(\d+[.)]|[IVX]+[.)])\s", first)):
            return first[:120]
    return ""


def chunk_text(text: str) -> list[dict]:
    """Découpe un texte en passages d'environ 1000 caractères : [{page, heading, text}]."""
    pages: list[tuple[int, str]] = []
    marks = list(PAGE_RE.finditer(text))
    if marks:
        if text[:marks[0].start()].strip():
            pages.append((0, text[:marks[0].start()]))
        for i, m in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
            num = int(m.group(1)) if m.group(1) else i + 1
            pages.append((num, text[m.end():end]))
    else:
        pages.append((0, text))
    chunks: list[dict] = []
    heading = ""
    for page, body in pages:
        buf = ""
        buf_head = heading
        for par in _paragraphs(body):
            h = _heading_of(par)
            if h:
                heading = h
            if buf and len(buf) + len(par) + 2 > CHUNK_CHARS:
                chunks.append({"page": page, "heading": buf_head, "text": buf})
                tail = buf[-CHUNK_OVERLAP:]
                cut = tail.find(" ")
                buf = (tail[cut + 1:] if 0 <= cut < len(tail) - 1 else "") + "\n\n" + par
                buf_head = heading
            else:
                buf = f"{buf}\n\n{par}" if buf else par
                if not buf_head:
                    buf_head = heading
        if buf.strip():
            chunks.append({"page": page, "heading": buf_head, "text": buf.strip()})
    return chunks


def _terms(query: str) -> list[str]:
    """Mots-clés de la requête, avec une racine simple (pluriels) pour la recherche par préfixe."""
    from .util import STOPWORDS
    words = keywords(query, 12) or [w for w in re.findall(r"[a-z0-9]{2,}", norm(query))
                                    if w not in STOPWORDS][:8]
    out: list[str] = []
    for w in words:
        if len(w) > 4 and w[-1] in "sx":
            w = w[:-1]
        if w not in out:
            out.append(w)
    return out


def snippet(text: str, terms: list[str], width: int = 320) -> str:
    """Extrait centré sur la zone qui contient le plus de mots cherchés."""
    flat = re.sub(r"(^|\n)#{1,6}\s+", r"\1", text)  # titres Markdown : sans les « # »
    flat = re.sub(r"\s+", " ", flat).strip()
    if len(flat) <= width:
        return flat
    low = norm(flat)
    if len(low) != len(flat):  # norm() peut changer la longueur (ligatures) : on cherche sans décaler
        low = flat.lower()
    best, best_pos = -1, 0
    positions = [m.start() for t in terms for m in re.finditer(re.escape(t), low)]
    for pos in positions or [0]:
        lo = max(0, pos - width // 3)
        window = low[lo:lo + width]
        score = sum(1 for t in terms if t in window)
        if score > best:
            best, best_pos = score, lo
    lo = best_pos
    if lo:
        sp = flat.find(" ", lo)
        lo = sp + 1 if 0 <= sp < lo + 30 else lo
    out = flat[lo:lo + width]
    sp = out.rfind(" ")
    if lo + width < len(flat) and sp > width - 40:
        out = out[:sp]
    return ("… " if lo else "") + out + (" …" if lo + len(out) < len(flat) else "")


# =========================================================================== bibliothèque
class Library:
    """Index des documents du propriétaire (dossiers et fichiers confiés à ZEUS + dossier data/bibliotheque)."""

    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self._lock = threading.Lock()
        self.state: dict[str, Any] = {"running": False, "done": 0, "total": 0, "current": "", "last": None}

    # ------------------------------------------------------------------ configuration
    @property
    def db(self):
        return self.zeus.db

    def inbox(self) -> Path:
        return self.zeus.config.dir("bibliotheque")

    def folders(self) -> list[str]:
        return [str(f) for f in (self.zeus.config.get("knowledge.folders") or []) if str(f).strip()]

    def files(self) -> list[str]:
        return [str(f) for f in (self.zeus.config.get("knowledge.files") or []) if str(f).strip()]

    def roots(self) -> list[Path]:
        return [self.inbox()] + [Path(f) for f in self.folders()]

    @staticmethod
    def _canon(path: str | Path) -> str:
        p = Path(os.path.expandvars(os.path.expanduser(str(path).strip().strip('"'))))
        try:
            p = p.resolve()
        except OSError:
            pass
        return str(p)

    def add_folder(self, path: str) -> tuple[str, bool]:
        p = Path(self._canon(path))
        if not p.exists():
            raise ValueError(f"dossier introuvable : {p}")
        if p.is_file():
            return self.add_file(str(p))
        if p.parent == p or str(p).rstrip("\\/").endswith(":"):
            raise ValueError("choisis un dossier précis (pas la racine d'un disque) : l'indexation serait trop longue")
        cur = self.folders()
        if str(p) in cur:
            return str(p), False
        self.zeus.config.set("knowledge.folders", cur + [str(p)])
        self.ensure_job()
        return str(p), True

    def add_file(self, path: str) -> tuple[str, bool]:
        p = Path(self._canon(path))
        if not p.is_file():
            raise ValueError(f"fichier introuvable : {p}")
        if p.suffix.lower() not in DOC_EXT | IMG_EXT:
            raise ValueError(f"format « {p.suffix} » non pris en charge")
        cur = self.files()
        if str(p) in cur:
            return str(p), False
        self.zeus.config.set("knowledge.files", cur + [str(p)])
        self.ensure_job()
        return str(p), True

    def remove_folder(self, path: str) -> int:
        target = self._canon(path)
        folders = [f for f in self.folders() if self._canon(f) != target]
        files = [f for f in self.files() if self._canon(f) != target]
        changed = len(folders) != len(self.folders()) or len(files) != len(self.files())
        if changed:
            self.zeus.config.set("knowledge.folders", folders, save=False)
            self.zeus.config.set("knowledge.files", files)
        n = 0
        for d in self.db.q("SELECT id, path FROM kb_docs"):
            if d["path"] == target or d["path"].startswith(target.rstrip("\\/") + os.sep):
                self.db.kb_delete_doc(d["id"])
                n += 1
        if changed or n:
            self.zeus.bus.publish("kb_changed")
        return n

    def ensure_job(self) -> None:
        """Réindexation automatique (nouveaux fichiers, fichiers modifiés ou supprimés)."""
        minutes = int(self.zeus.config.get("knowledge.auto_index_minutes") or 0)
        jobs = [s for s in self.db.list_schedules() if s["kind"] == "system:kb_index"]
        if minutes <= 0:
            for s in jobs:
                self.db.delete_schedule(s["id"])
            return
        if not jobs:
            self.db.add_schedule("Mise à jour de la bibliothèque de documents", "bibliothèque",
                                 f"every {minutes}m", time.time() + minutes * 60, kind="system:kb_index")

    # ------------------------------------------------------------------ indexation
    def _wanted(self, p: Path) -> bool:
        ext = p.suffix.lower()
        if ext in DOC_EXT:
            return True
        return ext in IMG_EXT and bool(self.zeus.config.get("knowledge.ocr_images"))

    def scan(self) -> list[Path]:
        max_bytes = float(self.zeus.config.get("knowledge.max_file_mb") or 40) * 1e6
        found: dict[str, Path] = {}
        for root in self.roots():
            if not root.exists():
                continue
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = [d for d in dirnames if not d.startswith((".", "~$")) and d.lower() not in SKIP_DIRS]
                for fn in filenames:
                    if fn.startswith(("~$", ".")):
                        continue
                    p = Path(dirpath) / fn
                    if not self._wanted(p):
                        continue
                    try:
                        if p.stat().st_size > max_bytes:
                            continue
                    except OSError:
                        continue
                    found[str(p)] = p
                    if len(found) >= MAX_FILES:
                        return list(found.values())
        for f in self.files():
            p = Path(f)
            if p.is_file():
                found[str(p)] = p
        return list(found.values())

    def _root_of(self, p: Path) -> str:
        s = str(p)
        for r in sorted((str(x) for x in self.roots()), key=len, reverse=True):
            if s == r or s.startswith(r.rstrip("\\/") + os.sep):
                return r
        return str(p.parent)

    def index_file(self, p: Path, force: bool = False) -> str:
        """Indexe un fichier. Renvoie « new », « updated », « same » ou « error »."""
        from .tools.documents import extract_text
        try:
            st = p.stat()
        except OSError:
            return "error"
        old = self.db.one("SELECT * FROM kb_docs WHERE path=?", (str(p),))
        if old and not force and old["size"] == st.st_size and abs((old["mtime"] or 0) - st.st_mtime) < 1:
            return "same"
        text, meta = extract_text(p, MAX_DOC_CHARS)
        chunks = chunk_text(text) if text.strip() else []
        status = "ok" if chunks else ("erreur" if meta.get("error") else "vide")
        err = meta.get("error") or ("aucun texte lisible (scan sans OCR ?)" if not chunks else "")
        self.db.kb_save_doc(str(p), p.name, self._root_of(p), p.suffix.lower().lstrip("."), st.st_size,
                            st.st_mtime, int(meta.get("pages") or 0), status, err, chunks)
        return "updated" if old else "new"

    def index(self, force: bool = False, progress: Callable[[dict], None] | None = None,
              budget: float | None = None) -> dict:
        """Met l'index à jour. budget = secondes max (le reste attendra la prochaine passe)."""
        if not self._lock.acquire(blocking=False):
            return {"busy": True, **self.state}
        t0 = time.time()
        stats = {"new": 0, "updated": 0, "same": 0, "error": 0, "removed": 0, "pending": 0}
        try:
            files = self.scan()
            self.state.update(running=True, done=0, total=len(files), current="")
            self.zeus.bus.publish("kb_progress", **self.state)
            wanted = {str(p) for p in files}
            for d in self.db.q("SELECT id, path FROM kb_docs"):
                if d["path"] not in wanted:
                    self.db.kb_delete_doc(d["id"])
                    stats["removed"] += 1
            for i, p in enumerate(files):
                if budget is not None and time.time() - t0 > budget:
                    stats["pending"] = len(files) - i
                    break
                self.state.update(done=i, current=p.name)
                try:
                    stats[self.index_file(p, force)] += 1
                except Exception as e:  # noqa: BLE001
                    log.warning("bibliothèque : %s : %s", p, e)
                    stats["error"] += 1
                if progress and i % 10 == 0:
                    progress(dict(self.state))
                if i % 25 == 0:
                    self.zeus.bus.publish("kb_progress", **self.state)
            stats["seconds"] = round(time.time() - t0, 1)
            self.state.update(running=False, done=len(files) - stats["pending"], current="", last=time.time())
            self.zeus.db.kv_set("kb.last_index", {"ts": time.time(), **stats})
            return stats
        finally:
            self.state["running"] = False
            self._lock.release()
            self.zeus.bus.publish("kb_changed", **stats)

    def index_async(self, force: bool = False) -> threading.Thread:
        th = threading.Thread(target=self.index, kwargs={"force": force}, daemon=True, name="bibliotheque")
        th.start()
        return th

    # ------------------------------------------------------------------ recherche
    def search(self, query: str, limit: int = 8, folder: str = "", per_doc: int = 3) -> list[dict]:
        terms = _terms(query)
        if not terms:
            return []
        rows = self.db.kb_search(terms, max(40, limit * 6), folder=self._canon(folder) if folder else "")
        phrase = norm(query).strip()
        scored = []
        for r in rows:
            low = norm(r["text"])
            head = norm(r.get("heading") or "") + " " + norm(r.get("name") or "")
            cover = sum(1 for t in terms if t in low or t in head)
            score = (r.get("rank") or 1.0) * (1 + cover) * (1 + cover / max(1, len(terms)))
            if len(phrase) > 6 and phrase in low:
                score *= 2
            if any(t in head for t in terms):
                score *= 1.3
            scored.append((score, cover, r))
        scored.sort(key=lambda x: (-x[0], -x[1]))
        out, per = [], {}
        for score, cover, r in scored:
            if per.get(r["doc_id"], 0) >= per_doc:
                continue
            per[r["doc_id"]] = per.get(r["doc_id"], 0) + 1
            out.append({"doc_id": r["doc_id"], "chunk_id": r["id"], "ord": r["ord"], "name": r["name"],
                        "path": r["path"], "page": r["page"] or None, "heading": r.get("heading") or "",
                        "snippet": snippet(r["text"], terms), "score": round(score, 3), "matched": cover,
                        "terms": terms})
            if len(out) >= limit:
                break
        return out

    def read(self, doc_id: int, page: int = 0, chunk: int = 0, around: int = 1, max_chars: int = 12000) -> dict:
        d = self.db.one("SELECT * FROM kb_docs WHERE id=?", (doc_id,))
        if not d:
            raise ValueError("document introuvable dans la bibliothèque")
        if chunk:
            c = self.db.one("SELECT ord FROM kb_chunks WHERE id=? AND doc_id=?", (chunk, doc_id))
            if not c:
                raise ValueError("passage introuvable")
            rows = self.db.q("SELECT * FROM kb_chunks WHERE doc_id=? AND ord BETWEEN ? AND ? ORDER BY ord",
                             (doc_id, c["ord"] - around, c["ord"] + around))
        elif page:
            rows = self.db.q("SELECT * FROM kb_chunks WHERE doc_id=? AND page=? ORDER BY ord", (doc_id, page))
        else:
            rows = self.db.q("SELECT * FROM kb_chunks WHERE doc_id=? ORDER BY ord", (doc_id,))
        parts, size, last_page = [], 0, None
        for r in rows:
            block = r["text"]
            if r["page"] and r["page"] != last_page:
                block = f"[page {r['page']}]\n{block}"
                last_page = r["page"]
            if size + len(block) > max_chars:
                parts.append("… (suite coupée : demande une page ou un passage précis)")
                break
            parts.append(block)
            size += len(block)
        return {"doc": d, "text": "\n\n".join(parts), "chunks": len(rows)}

    def summary(self) -> dict:
        s = self.db.one("SELECT COUNT(*) n, COALESCE(SUM(chunks),0) c, COALESCE(SUM(size),0) b, "
                        "SUM(status!='ok') bad FROM kb_docs") or {}
        return {"docs": s.get("n") or 0, "chunks": s.get("c") or 0, "bytes": s.get("b") or 0,
                "problems": s.get("bad") or 0, "folders": self.folders(), "files": self.files(),
                "inbox": str(self.inbox()), "last": self.db.kv_get("kb.last_index"), "state": dict(self.state)}


def cite(hit: dict) -> str:
    return hit["name"] + (f", p. {hit['page']}" if hit.get("page") else "")


__all__ = ["Library", "chunk_text", "snippet", "cite", "DOC_EXT"]
