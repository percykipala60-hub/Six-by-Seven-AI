"""Outils transverses : journalisation, texte, JSON tolérant, commandes système."""

from __future__ import annotations

import ast
import datetime as _dt
import html
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
from html.parser import HTMLParser
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

IS_WINDOWS = os.name == "nt"
IS_MAC = sys.platform == "darwin"
IS_TERMUX = "TERMUX_VERSION" in os.environ or os.path.isdir("/data/data/com.termux/files")

log = logging.getLogger("zeus")

_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
         "septembre", "octobre", "novembre", "décembre"]

SECRET_KEYS = ("api_key", "token", "password", "secret", "access_token", "bot_token",
               "unlock_pin", "app_secret", "verify_token", "pairing_code")


def setup_logging(log_dir: Path | None, verbose: bool = False, filename: str = "zeus.log") -> None:
    """Journal console + fichier tournant (data/logs/zeus.log)."""
    if getattr(setup_logging, "_done", False):
        return
    setup_logging._done = True  # type: ignore[attr-defined]
    log.setLevel(logging.DEBUG)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s", "%H:%M:%S")
    ch = logging.StreamHandler(sys.stderr)
    ch.setLevel(logging.DEBUG if verbose else logging.WARNING)
    ch.setFormatter(fmt)
    log.addHandler(ch)
    if log_dir:
        try:
            log_dir.mkdir(parents=True, exist_ok=True)
            fh = RotatingFileHandler(log_dir / filename, maxBytes=2_000_000, backupCount=3,
                                     encoding="utf-8")
            fh.setLevel(logging.DEBUG)
            fh.setFormatter(fmt)
            log.addHandler(fh)
        except OSError:
            pass


def fix_console() -> None:
    """UTF-8 et couleurs ANSI sur toutes les consoles (Windows compris)."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:
            pass
    if IS_WINDOWS:
        os.system("")  # active les séquences VT


def now() -> float:
    return time.time()


def fr_datetime(ts: float | None = None) -> str:
    d = _dt.datetime.fromtimestamp(ts if ts is not None else time.time())
    return f"{_JOURS[d.weekday()]} {d.day} {_MOIS[d.month - 1]} {d.year}, {d:%H:%M}"


def iso(ts: float | None) -> str:
    if not ts:
        return ""
    return _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")


def local_tz_name() -> str:
    try:
        off = _dt.datetime.now().astimezone().utcoffset()
        mins = int(off.total_seconds() // 60) if off else 0
        sign = "+" if mins >= 0 else "-"
        mins = abs(mins)
        return f"UTC{sign}{mins // 60:02d}:{mins % 60:02d}"
    except Exception:
        return "UTC"


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm(s: str) -> str:
    """Minuscules sans accents, espaces compactés — pour les comparaisons floues."""
    s = strip_accents(s or "").lower().replace("’", "'")
    return re.sub(r"\s+", " ", s).strip()


def slugify(s: str, maxlen: int = 60) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", norm(s)).strip("-")
    return s[:maxlen] or "x"


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 3)


def truncate(text: str, max_chars: int, note: str = "") -> str:
    """Garde le début et la fin d'un texte trop long."""
    if text is None:
        return ""
    if len(text) <= max_chars:
        return text
    head = int(max_chars * 0.7)
    tail = max_chars - head
    cut = len(text) - head - tail
    msg = f"\n\n[… {cut} caractères coupés{(' — ' + note) if note else ''} …]\n\n"
    return text[:head] + msg + text[-tail:]


def jdump(obj: Any, indent: int | None = None) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=indent, default=str)


def jload(s: str | None, default: Any = None) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


def _balanced_object(s: str, start: int) -> str | None:
    depth, in_str, esc = 0, False, False
    for i in range(start, len(s)):
        c = s[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
    return None


def parse_json_loose(text: str) -> Any:
    """Parse du JSON produit par un modèle (blocs ```, virgules finales, quotes simples…)."""
    if text is None:
        raise ValueError("vide")
    if isinstance(text, (dict, list)):
        return text
    t = text.strip()
    t = re.sub(r"^```(?:json|JSON)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except Exception:
        pass
    i = t.find("{")
    cand = _balanced_object(t, i) if i >= 0 else None
    if cand is None and t.startswith("["):
        cand = t
    if cand is None:
        raise ValueError("aucun objet JSON trouvé")
    try:
        return json.loads(cand)
    except Exception:
        pass
    fixed = re.sub(r",\s*([}\]])", r"\1", cand)
    try:
        return json.loads(fixed)
    except Exception:
        pass
    py = re.sub(r"\btrue\b", "True", fixed)
    py = re.sub(r"\bfalse\b", "False", py)
    py = re.sub(r"\bnull\b", "None", py)
    try:
        return ast.literal_eval(py)
    except Exception as e:
        raise ValueError(f"JSON illisible : {e}") from e


def redact(obj: Any) -> Any:
    """Masque les secrets avant journalisation ou affichage."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if any(sk in str(k).lower() for sk in SECRET_KEYS) and v and isinstance(v, str):
                out[k] = "••••" + v[-4:] if len(v) > 8 else "••••"
            else:
                out[k] = redact(v)
        return out
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    return obj


class _TextExtractor(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "head", "template", "iframe"}
    BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section",
             "article", "header", "footer", "table", "ul", "ol", "blockquote", "pre", "hr",
             "dd", "dt", "figcaption", "main", "nav", "form"}

    def __init__(self, keep_links: bool = False):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0
        self.title = ""
        self._in_title = False
        self.keep_links = keep_links
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._link_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP and tag != "head":
            self.skip += 1
        if tag == "title":
            self._in_title = True
        if tag in self.BLOCK:
            self.parts.append("\n")
        if tag in ("h1", "h2", "h3"):
            self.parts.append("## ")
        if tag == "li":
            self.parts.append("• ")
        if tag == "a" and self.keep_links:
            self._href = dict(attrs).get("href")
            self._link_text = []

    def handle_endtag(self, tag):
        if tag in self.SKIP and tag != "head" and self.skip:
            self.skip -= 1
        if tag == "title":
            self._in_title = False
        if tag in self.BLOCK:
            self.parts.append("\n")
        if tag == "a" and self.keep_links and self._href:
            txt = " ".join("".join(self._link_text).split())
            if txt and not self._href.startswith(("#", "javascript:")):
                self.links.append((txt[:80], self._href))
            self._href = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
            return
        if self.skip:
            return
        self.parts.append(data)
        if self._href is not None:
            self._link_text.append(data)


def html_to_text(src: str, keep_links: bool = False) -> tuple[str, str, list[tuple[str, str]]]:
    """HTML → (titre, texte, liens)."""
    p = _TextExtractor(keep_links=keep_links)
    try:
        p.feed(src)
        p.close()
    except Exception:
        pass
    text = "".join(p.parts)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    text = "\n".join(ln.strip() for ln in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return html.unescape(p.title.strip()), text, p.links


def which(cmd: str) -> str | None:
    return shutil.which(cmd)


def run_cmd(args: list[str] | str, timeout: float = 60, input_data: bytes | None = None,
            cwd: str | None = None, env: dict | None = None, binary: bool = False,
            shell: bool = False, cancel: threading.Event | None = None) -> tuple[int, Any, str]:
    """Lance une commande ; renvoie (code, stdout, stderr). Ne lève jamais d'exception."""
    kwargs: dict[str, Any] = {}
    if IS_WINDOWS:
        kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
    else:
        kwargs["start_new_session"] = True
    try:
        proc = subprocess.Popen(args, stdin=subprocess.PIPE if input_data is not None else subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd,
                                env=env, shell=shell, **kwargs)
    except FileNotFoundError as e:
        return 127, b"" if binary else "", f"Commande introuvable : {e}"
    except Exception as e:  # noqa: BLE001
        return 126, b"" if binary else "", f"Impossible de lancer la commande : {e}"
    deadline = time.time() + timeout
    out, err = b"", b""
    try:
        if cancel is None:
            out, err = proc.communicate(input=input_data, timeout=timeout)
        else:
            # Boucle courte pour pouvoir annuler en cours de route.
            if input_data is not None and proc.stdin:
                try:
                    proc.stdin.write(input_data)
                    proc.stdin.close()
                except Exception:
                    pass
            while True:
                try:
                    out, err = proc.communicate(timeout=0.5)
                    break
                except subprocess.TimeoutExpired:
                    if cancel.is_set():
                        _kill(proc)
                        out, err = proc.communicate()
                        err += "\n[annulé]".encode()
                        break
                    if time.time() > deadline:
                        raise
    except subprocess.TimeoutExpired:
        _kill(proc)
        try:
            out, err = proc.communicate(timeout=5)
        except Exception:
            pass
        err = (err or b"") + f"\n[délai dépassé après {int(timeout)} s]".encode()
        code = 124
        return code, out if binary else _dec(out), _dec(err)
    return proc.returncode, out if binary else _dec(out), _dec(err)


def _kill(proc: subprocess.Popen) -> None:
    try:
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        else:
            import signal
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def _dec(b: bytes | None) -> str:
    if not b:
        return ""
    for enc in ("utf-8", "cp1252" if IS_WINDOWS else "latin-1"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode("utf-8", errors="replace")


def read_text_file(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-16" if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("utf-8", errors="replace")


def human_size(n: float) -> str:
    for unit in ("o", "Ko", "Mo", "Go"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "o" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} To"


def wrap_untrusted(source: str, content: str) -> str:
    """Encadre un contenu externe : c'est de l'information, jamais des ordres."""
    content = (content or "").replace("</untrusted>", "</ untrusted>")
    return f'<untrusted source="{source}">\n{content}\n</untrusted>'


def guess_mime(path: str) -> str:
    import mimetypes
    m, _ = mimetypes.guess_type(path)
    if m:
        return m
    ext = Path(path).suffix.lower()
    return {".webp": "image/webp", ".heic": "image/heic", ".md": "text/markdown",
            ".ogg": "audio/ogg", ".opus": "audio/ogg", ".m4a": "audio/mp4"}.get(ext, "application/octet-stream")


IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic"}
AUDIO_EXT = {".ogg", ".opus", ".mp3", ".wav", ".m4a", ".aac", ".webm", ".flac", ".amr", ".3gp"}


def is_image(path: str) -> bool:
    return Path(path).suffix.lower() in IMAGE_EXT


def is_audio(path: str) -> bool:
    return Path(path).suffix.lower() in AUDIO_EXT


def image_size(data: bytes) -> tuple[int, int] | None:
    """Dimensions PNG/JPEG/GIF/WebP sans bibliothèque externe."""
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            import struct
            w, h = struct.unpack(">II", data[16:24])
            return w, h
        if data[:3] == b"GIF":
            return int.from_bytes(data[6:8], "little"), int.from_bytes(data[8:10], "little")
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            if data[12:16] == b"VP8X":
                return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
            if data[12:16] == b"VP8 ":
                return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
        if data[:2] == b"\xff\xd8":
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h = int.from_bytes(data[i + 5:i + 7], "big")
                    w = int.from_bytes(data[i + 7:i + 9], "big")
                    return w, h
                seg = int.from_bytes(data[i + 2:i + 4], "big")
                i += 2 + seg
    except Exception:
        return None
    return None


def shrink_image(data: bytes, max_side: int = 1280) -> tuple[bytes, str, float]:
    """Réduit une image si Pillow est installé (optionnel). Renvoie (octets, mime, échelle)."""
    try:
        from PIL import Image  # type: ignore
        import io
        im = Image.open(io.BytesIO(data))
        w, h = im.size
        scale = min(1.0, max_side / max(w, h))
        if scale < 1.0:
            im = im.resize((int(w * scale), int(h * scale)))
        im = im.convert("RGB")
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=80)
        return buf.getvalue(), "image/jpeg", scale
    except Exception:
        mime = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
        return data, mime, 1.0


STOPWORDS = set("""
le la les un une des du de d l et ou a au aux en dans sur pour par avec sans ce cet cette ces
mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles
me te se moi toi lui y est sont etre ai as avons avez ont fait faire qui que quoi dont ou ne pas plus
tres bien tout tous toute toutes comme mais donc car si alors aussi deja encore the a an of to in is
are be for on with and or it this that what how can you your i my me please stp svp merci peux peut
veux voudrais zeus
""".split())


def keywords(text: str, maxn: int = 12) -> list[str]:
    words = re.findall(r"[a-z0-9]{3,}", norm(text))
    out: list[str] = []
    for w in words:
        if w not in STOPWORDS and w not in out:
            out.append(w)
    return out[:maxn]
