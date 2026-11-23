"""Extraction de texte sans dépendance : PDF, Word, Excel, PowerPoint, OpenDocument, e-mails,
HTML, images (OCR Tesseract si présent). Utilise pypdf / pdftotext s'ils sont installés."""

from __future__ import annotations

import email
import re
import zipfile
import zlib
from email import policy
from functools import lru_cache
from pathlib import Path
from xml.etree import ElementTree as ET

from ..util import IMAGE_EXT, html_to_text, read_text_file, run_cmd, truncate, which

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
TEXT_EXT = {".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml", ".log", ".ini", ".cfg", ".py", ".js",
            ".ts", ".html", ".htm", ".css", ".sql", ".sh", ".bat", ".ps1", ".java", ".c", ".cpp", ".h", ".go",
            ".rs", ".php", ".rb", ".kt", ".swift", ".toml", ".srt", ".vtt", ".tex"}


def extract_text(path: Path | str, max_chars: int = 60000) -> tuple[str, dict]:
    """Renvoie (texte, méta). Ne lève pas d'exception pour un format inconnu."""
    path = Path(path)
    ext = path.suffix.lower()
    meta: dict = {"format": ext.lstrip(".") or "?", "method": ""}
    try:
        if ext == ".pdf":
            text, meta["method"], meta["pages"] = _pdf(path)
        elif ext in (".docx", ".docm", ".dotx"):
            text, meta["method"] = _docx(path), "docx"
        elif ext in (".xlsx", ".xlsm"):
            text, meta["method"] = _xlsx(path), "xlsx"
        elif ext in (".pptx", ".ppsx"):
            text, meta["method"] = _pptx(path), "pptx"
        elif ext in (".odt", ".ods", ".odp"):
            text, meta["method"] = _odf(path), "odf"
        elif ext in (".eml",):
            text, meta["method"] = _eml(path), "eml"
        elif ext in (".html", ".htm"):
            title, body, _ = html_to_text(read_text_file(path))
            text, meta["method"] = (f"# {title}\n\n" if title else "") + body, "html"
        elif ext == ".rtf":
            text, meta["method"] = _rtf(read_text_file(path)), "rtf"
        elif ext in IMAGE_EXT:
            text, meta["method"] = ocr_image(path), "ocr"
        elif ext in TEXT_EXT or _looks_text(path):
            text, meta["method"] = read_text_file(path), "texte"
        else:
            return "", {**meta, "error": f"format « {ext} » non pris en charge"}
    except zipfile.BadZipFile:
        return "", {**meta, "error": "fichier Office abîmé ou protégé"}
    except Exception as e:  # noqa: BLE001
        return "", {**meta, "error": f"{type(e).__name__} : {e}"}
    text = re.sub(r"[ \t]+\n", "\n", text or "")
    text = re.sub(r"\n{4,}", "\n\n\n", text).strip()
    meta["chars"] = len(text)
    return truncate(text, max_chars, "document long"), meta


def _looks_text(path: Path) -> bool:
    try:
        chunk = path.open("rb").read(2048)
    except OSError:
        return False
    if not chunk:
        return True
    if b"\x00" in chunk:
        return False
    printable = sum(32 <= b < 127 or b in (9, 10, 13) or b >= 128 for b in chunk)
    return printable / len(chunk) > 0.95


# --------------------------------------------------------------------------- PDF
def _pdf(path: Path) -> tuple[str, str, int]:
    pages = 0
    try:
        import pypdf  # type: ignore
        r = pypdf.PdfReader(str(path))
        pages = len(r.pages)
        parts = []
        for i, pg in enumerate(r.pages[:80]):
            parts.append(f"--- page {i + 1} ---\n{pg.extract_text() or ''}")
        text = "\n".join(parts)
        if len(re.sub(r"\s|---.*?---", "", text)) > 40:
            return text, "pypdf", pages
    except ImportError:
        pass
    except Exception:
        pass
    if which("pdftotext"):
        code, out, _ = run_cmd(["pdftotext", "-layout", "-l", "80", str(path), "-"], timeout=60)
        if code == 0 and len(out.strip()) > 40:
            pages = out.count("\f") + 1
            return out.replace("\f", "\n--- page ---\n"), "pdftotext", pages
    data = path.read_bytes()
    pages = pages or len(re.findall(rb"/Type\s*/Page[^s]", data))
    text = _pdf_fallback(data)
    if len(text.strip()) > 40:
        return text, "interne", pages
    ocr = _pdf_ocr(path)
    if ocr.strip():
        return ocr, "ocr", pages
    return text, "interne (peu de texte : PDF scanné ?)", pages


def _pdf_unescape(b: bytes) -> bytes:
    out = bytearray()
    i = 0
    while i < len(b):
        c = b[i]
        if c == 0x5C and i + 1 < len(b):  # backslash
            n = b[i + 1]
            mapping = {ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12, ord("("): 40,
                       ord(")"): 41, 0x5C: 0x5C}
            if n in mapping:
                out.append(mapping[n])
                i += 2
                continue
            if 48 <= n <= 55:
                j = i + 1
                oct_digits = b""
                while j < len(b) and len(oct_digits) < 3 and 48 <= b[j] <= 55:
                    oct_digits += bytes([b[j]])
                    j += 1
                out.append(int(oct_digits, 8) & 0xFF)
                i = j
                continue
            i += 2
            continue
        out.append(c)
        i += 1
    return bytes(out)


_STR_RE = re.compile(rb"\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)|<[0-9A-Fa-f\s]+>|T\*|Td|TD|Tm|'|\"", re.S)


def _pdf_fallback(data: bytes) -> str:
    texts: list[str] = []
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end < 0:
            continue
        raw = data[start:end]
        head = data[max(0, m.start() - 400):m.start()]
        dstart = head.rfind(b"<<")
        d = head[dstart:] if dstart >= 0 else head
        if b"FlateDecode" in d:
            try:
                raw = zlib.decompressobj().decompress(raw)
            except zlib.error:
                continue
        elif b"/Filter" in d:
            continue
        if b"BT" not in raw:
            continue
        for bt in re.finditer(rb"BT(.*?)ET", raw, re.S):
            line: list[str] = []
            for tok in _STR_RE.finditer(bt.group(1)):
                t = tok.group(0)
                if t in (b"T*", b"Td", b"TD", b"Tm", b"'", b'"'):
                    if line and line[-1] != "\n":
                        line.append("\n")
                    continue
                if t.startswith(b"("):
                    s = _pdf_unescape(t[1:-1])
                else:
                    hx = re.sub(rb"\s", b"", t[1:-1])
                    if len(hx) % 2:
                        hx += b"0"
                    try:
                        s = bytes.fromhex(hx.decode())
                    except ValueError:
                        continue
                    if len(s) >= 2 and s[0] == 0:
                        try:
                            s = s.decode("utf-16-be").encode("latin-1", "ignore")
                        except Exception:
                            continue
                line.append(s.decode("latin-1", "ignore"))
            chunk = "".join(line)
            printable = sum(ch.isprintable() or ch in "\n\t" for ch in chunk)
            if chunk and printable / max(1, len(chunk)) > 0.85:
                texts.append(chunk)
    return "\n".join(texts)


def _pdf_ocr(path: Path) -> str:
    if not (which("pdftoppm") and which("tesseract")):
        return ""
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        code, _, _ = run_cmd(["pdftoppm", "-r", "200", "-l", "5", "-png", str(path), str(Path(td) / "p")], timeout=120)
        if code != 0:
            return ""
        out = []
        for img in sorted(Path(td).glob("p*.png")):
            out.append(ocr_image(img))
        return "\n".join(out)


# --------------------------------------------------------------------------- OCR
@lru_cache(maxsize=1)
def _tess_lang() -> str:
    if not which("tesseract"):
        return ""
    code, out, err = run_cmd(["tesseract", "--list-langs"], timeout=15)
    langs = set((out + err).split())
    chosen = [lang for lang in ("fra", "eng") if lang in langs]
    return "+".join(chosen) or "eng"


def ocr_available() -> bool:
    return bool(_tess_lang())


def ocr_image(path: Path | str) -> str:
    lang = _tess_lang()
    if not lang:
        return ""
    code, out, _ = run_cmd(["tesseract", str(path), "stdout", "-l", lang], timeout=90)
    return out if code == 0 else ""


# --------------------------------------------------------------------------- Office
def _xml(z: zipfile.ZipFile, name: str) -> ET.Element | None:
    try:
        return ET.fromstring(z.read(name))
    except KeyError:
        return None


def _docx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        root = _xml(z, "word/document.xml")
        if root is None:
            return ""
        body = root.find(f"{W}body")
        out: list[str] = []

        def para(pel: ET.Element) -> str:
            buf = []
            for el in pel.iter():
                if el.tag == f"{W}t" and el.text:
                    buf.append(el.text)
                elif el.tag == f"{W}tab":
                    buf.append("\t")
                elif el.tag in (f"{W}br", f"{W}cr"):
                    buf.append("\n")
            return "".join(buf)

        for child in (body if body is not None else []):
            if child.tag == f"{W}p":
                out.append(para(child))
            elif child.tag == f"{W}tbl":
                for tr in child.iter(f"{W}tr"):
                    cells = [" ".join(para(pp) for pp in tc.iter(f"{W}p")).strip() for tc in tr.iter(f"{W}tc")]
                    out.append(" | ".join(cells))
                out.append("")
        for extra in ("word/footnotes.xml",):
            r = _xml(z, extra)
            if r is not None:
                t = " ".join(e.text for e in r.iter(f"{W}t") if e.text)
                if t.strip():
                    out.append("\n[Notes] " + t)
        return "\n".join(out)


def _col_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref or "A")
    n = 0
    for ch in (letters.group(0) if letters else "A"):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _xlsx(path: Path, max_rows: int = 300, max_cols: int = 40) -> str:
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        sroot = _xml(z, "xl/sharedStrings.xml")
        if sroot is not None:
            for si in sroot.iter(f"{S}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{S}t")))
        wb = _xml(z, "xl/workbook.xml")
        rels = _xml(z, "xl/_rels/workbook.xml.rels")
        rel_map = {}
        if rels is not None:
            for r in rels:
                rel_map[r.get("Id")] = r.get("Target", "")
        sheets: list[tuple[str, str]] = []
        if wb is not None:
            for sh in wb.iter(f"{S}sheet"):
                target = rel_map.get(sh.get(f"{R_NS}id"), "")
                if target:
                    target = target.lstrip("/")
                    if not target.startswith("xl/"):
                        target = "xl/" + target
                    sheets.append((sh.get("name", "Feuille"), target))
        if not sheets:
            sheets = [(n.split("/")[-1], n) for n in z.namelist() if n.startswith("xl/worksheets/sheet")]
        out: list[str] = []
        for name, target in sheets:
            root = _xml(z, target)
            if root is None:
                continue
            out.append(f"## Feuille : {name}")
            nrows = 0
            for row in root.iter(f"{S}row"):
                vals: dict[int, str] = {}
                for c in row.iter(f"{S}c"):
                    idx = _col_index(c.get("r", ""))
                    if idx >= max_cols:
                        continue
                    t = c.get("t")
                    v = c.find(f"{S}v")
                    val = ""
                    if t == "s" and v is not None and v.text:
                        try:
                            val = shared[int(v.text)]
                        except (ValueError, IndexError):
                            val = v.text
                    elif t == "inlineStr":
                        val = "".join(x.text or "" for x in c.iter(f"{S}t"))
                    elif t == "b" and v is not None:
                        val = "VRAI" if v.text == "1" else "FAUX"
                    elif v is not None and v.text is not None:
                        val = v.text
                        if re.fullmatch(r"-?\d+\.\d{6,}", val):
                            val = f"{float(val):.4f}".rstrip("0").rstrip(".")
                    if val != "":
                        vals[idx] = val
                if vals:
                    width = max(vals) + 1
                    out.append(" | ".join(vals.get(i, "") for i in range(width)))
                    nrows += 1
                    if nrows >= max_rows:
                        out.append(f"[… lignes suivantes non affichées]")
                        break
            out.append("")
        return "\n".join(out)


def _pptx(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        names = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
                       key=lambda n: int(re.search(r"(\d+)", n.split("/")[-1]).group(1)))  # type: ignore[union-attr]
        out = []
        for i, n in enumerate(names, 1):
            root = _xml(z, n)
            if root is None:
                continue
            paras = []
            for pel in root.iter(f"{A}p"):
                t = "".join(x.text or "" for x in pel.iter(f"{A}t"))
                if t.strip():
                    paras.append(t)
            out.append(f"--- diapositive {i} ---\n" + "\n".join(paras))
        return "\n".join(out)


def _odf(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        root = _xml(z, "content.xml")
        if root is None:
            return ""
        out = []
        for el in root.iter():
            tag = el.tag.split("}")[-1]
            if tag in ("p", "h"):
                out.append("".join(el.itertext()))
            elif tag == "table-row":
                cells = ["".join(c.itertext()) for c in el if c.tag.split("}")[-1] == "table-cell"]
                if any(cells):
                    out.append(" | ".join(cells))
        return "\n".join(out)


def _eml(path: Path) -> str:
    msg = email.message_from_bytes(path.read_bytes(), policy=policy.default)
    head = f"De : {msg.get('From', '')}\nÀ : {msg.get('To', '')}\nDate : {msg.get('Date', '')}\nObjet : {msg.get('Subject', '')}\n"
    body = ""
    part = msg.get_body(preferencelist=("plain", "html"))
    if part is not None:
        body = part.get_content()
        if part.get_content_type() == "text/html":
            body = html_to_text(body)[1]
    atts = [a.get_filename() for a in msg.iter_attachments() if a.get_filename()]
    return head + ("Pièces jointes : " + ", ".join(atts) + "\n" if atts else "") + "\n" + body


def _rtf(src: str) -> str:
    s = re.sub(r"\\'([0-9a-fA-F]{2})", lambda m: bytes.fromhex(m.group(1)).decode("cp1252", "ignore"), src)
    s = re.sub(r"\\par[d]?\b", "\n", s)
    s = re.sub(r"\\[a-z]+-?\d* ?", "", s)
    s = re.sub(r"[{}]", "", s)
    return s
