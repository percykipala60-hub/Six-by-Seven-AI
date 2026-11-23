"""Outils de base : fichiers, shell, Python, web, partage de fichiers, analyse d'images."""

from __future__ import annotations

import base64
import fnmatch
import gzip
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from pathlib import Path

from ..security import classify_python, classify_shell
from ..util import (IS_WINDOWS, html_to_text, human_size, iso, is_image, log, read_text_file, run_cmd, truncate,
                    wrap_untrusted)
from . import ToolContext, ToolResult, p, tool
from .documents import TEXT_EXT, extract_text, ocr_available, ocr_image

DOC_EXT = {".pdf", ".docx", ".docm", ".xlsx", ".xlsm", ".pptx", ".odt", ".ods", ".odp", ".eml", ".rtf"}
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".idea", ".cache", "AppData", "Library"}
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")


def _trash(ctx: ToolContext, path: Path, copy: bool = False) -> Path:
    d = ctx.cfg.dir("trash")
    dest = d / f"{time.strftime('%Y%m%d-%H%M%S')}_{path.name}"
    if copy:
        if path.is_dir():
            shutil.copytree(path, dest)
        else:
            shutil.copy2(path, dest)
    else:
        shutil.move(str(path), str(dest))
    return dest


def _suggest(path: Path) -> str:
    parent = path.parent
    if not parent.exists():
        return ""
    import difflib
    names = [x.name for x in parent.iterdir()][:500]
    close = difflib.get_close_matches(path.name, names, n=3, cutoff=0.4)
    return f" Fichiers proches dans {parent} : {', '.join(close)}." if close else ""


# =========================================================================== fichiers (base)
@tool("read_file", "Lit un fichier texte (avec numéros de ligne) ou extrait le texte d'un PDF, Word, Excel, "
                   "PowerPoint, OpenDocument, e-mail ou image (OCR).",
      {"path": p("string", "Chemin (relatif = espace de travail ZEUS)"),
       "offset": p("integer", "Première ligne à lire (1 par défaut)"),
       "limit": p("integer", "Nombre de lignes (400 par défaut)")}, required=["path"])
def read_file(ctx: ToolContext, path: str, offset: int = 1, limit: int = 400) -> ToolResult | str:
    f = ctx.resolve(path)
    if not f.exists():
        return ToolResult.err(f"introuvable : {f}.{_suggest(f)}")
    if f.is_dir():
        return list_dir(ctx, str(f))
    ext = f.suffix.lower()
    if ext in DOC_EXT or (is_image(str(f)) and ext not in TEXT_EXT):
        text, meta = extract_text(f, 60000)
        if meta.get("error"):
            return ToolResult.err(meta["error"])
        if is_image(str(f)) and not text.strip():
            return ToolResult(text=f"Image {f.name} ({human_size(f.stat().st_size)}) — pas de texte détecté.",
                              images=[str(f)])
        head = f"{f} — {meta.get('format')} ({meta.get('method')}"
        head += f", {meta['pages']} pages)" if meta.get("pages") else ")"
        return wrap_untrusted(f"fichier:{f.name}", head + "\n" + text)
    if f.stat().st_size > 25_000_000:
        return ToolResult.err(f"fichier trop gros ({human_size(f.stat().st_size)}) : utilise run_shell ou run_python")
    text = read_text_file(f)
    lines = text.splitlines()
    offset = max(1, int(offset or 1))
    limit = max(1, int(limit or 400))
    sel = lines[offset - 1: offset - 1 + limit]
    body = "\n".join(f"{i:>5}│ {ln[:2000]}" for i, ln in enumerate(sel, offset))
    rng = f" (lignes {offset}-{offset + len(sel) - 1} sur {len(lines)})" if len(sel) < len(lines) else f" ({len(lines)} lignes)"
    return f"{f}{rng}\n{body}"


@tool("write_file", "Crée ou remplace un fichier texte (ou ajoute à la fin). L'ancienne version part à la corbeille ZEUS.",
      {"path": p("string", "Chemin"), "content": p("string", "Contenu complet"),
       "append": p("boolean", "true = ajouter à la fin au lieu de remplacer")}, required=["path", "content"],
      risk="write", summary=lambda a: f"Écrire le fichier {a.get('path')} ({len(a.get('content', ''))} caractères)")
def write_file(ctx: ToolContext, path: str, content: str, append: bool = False) -> str:
    f = ctx.resolve(path)
    f.parent.mkdir(parents=True, exist_ok=True)
    backup = ""
    if f.exists() and not append:
        backup = f" (ancienne version : {_trash(ctx, f, copy=True).name})"
    with f.open("a" if append else "w", encoding="utf-8", newline="") as fh:
        fh.write(content)
    return f"{'Ajouté à' if append else 'Écrit'} {f} ({human_size(f.stat().st_size)}){backup}."


@tool("list_dir", "Liste le contenu d'un dossier (récursif possible, filtre glob).",
      {"path": p("string", "Dossier (défaut : espace de travail)"), "pattern": p("string", "Filtre, ex. *.pdf"),
       "recursive": p("boolean", "Inclure les sous-dossiers")})
def list_dir(ctx: ToolContext, path: str = ".", pattern: str = "*", recursive: bool = False) -> ToolResult | str:
    d = ctx.resolve(path)
    if not d.exists():
        return ToolResult.err(f"dossier introuvable : {d}")
    if d.is_file():
        st = d.stat()
        return f"{d} — fichier {human_size(st.st_size)}, modifié {iso(st.st_mtime)}"
    rows = []
    it = d.rglob(pattern or "*") if recursive else d.glob(pattern or "*")
    count = 0
    for x in it:
        if any(part in SKIP_DIRS for part in x.relative_to(d).parts[:-1]):
            continue
        count += 1
        if len(rows) >= 300:
            continue
        try:
            st = x.stat()
        except OSError:
            continue
        rel = x.relative_to(d)
        rows.append(f"{'📁' if x.is_dir() else '📄'} {rel}{'/' if x.is_dir() else ''}  "
                    f"{'' if x.is_dir() else human_size(st.st_size)}  {iso(st.st_mtime)}")
    rows.sort()
    more = f"\n… {count - 300} autres" if count > 300 else ""
    return f"{d} ({count} éléments)\n" + "\n".join(rows) + more


@tool("share_file", "Remet un fichier à l'utilisateur (lien de téléchargement dans l'interface, envoi sur "
                    "Telegram/WhatsApp/e-mail selon le canal).",
      {"path": p("string", "Chemin du fichier"), "caption": p("string", "Légende courte")}, required=["path"])
def share_file(ctx: ToolContext, path: str, caption: str = "") -> ToolResult:
    f = ctx.resolve(path)
    if not f.exists() or not f.is_file():
        return ToolResult.err(f"fichier introuvable : {f}")
    return ToolResult(text=f"Fichier remis : {f.name} ({human_size(f.stat().st_size)}). {caption}".strip(),
                      files=[str(f)])


# =========================================================================== fichiers (avancé)
@tool("edit_file", "Remplace un passage exact dans un fichier texte (l'ancienne version part à la corbeille).",
      {"path": p("string"), "old": p("string", "Texte exact à remplacer"), "new": p("string", "Nouveau texte"),
       "replace_all": p("boolean", "Remplacer toutes les occurrences")}, required=["path", "old", "new"],
      risk="write", toolset="files")
def edit_file(ctx: ToolContext, path: str, old: str, new: str, replace_all: bool = False) -> ToolResult | str:
    f = ctx.resolve(path)
    if not f.exists():
        return ToolResult.err(f"introuvable : {f}")
    text = read_text_file(f)
    n = text.count(old)
    if n == 0:
        return ToolResult.err("texte à remplacer introuvable (vérifie espaces et retours à la ligne avec read_file)")
    if n > 1 and not replace_all:
        return ToolResult.err(f"texte présent {n} fois : précise un passage unique ou mets replace_all=true")
    _trash(ctx, f, copy=True)
    f.write_text(text.replace(old, new) if replace_all else text.replace(old, new, 1), encoding="utf-8")
    return f"Modifié {f} ({n if replace_all else 1} remplacement(s))."


@tool("search_files", "Cherche un texte dans les fichiers d'un dossier (et dans les noms de fichiers).",
      {"query": p("string", "Texte ou expression régulière"), "path": p("string", "Dossier"),
       "glob": p("string", "Filtre de fichiers, ex. *.txt"), "regex": p("boolean", "query est une regex")},
      required=["query"], toolset="files")
def search_files(ctx: ToolContext, query: str, path: str = ".", glob: str = "*", regex: bool = False) -> str:
    d = ctx.resolve(path)
    pat = re.compile(query if regex else re.escape(query), re.I)
    hits: list[str] = []
    names: list[str] = []
    scanned = 0
    for root, dirs, files in os.walk(d):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith(".")]
        for fn in files:
            if not fnmatch.fnmatch(fn, glob or "*"):
                continue
            fp = Path(root) / fn
            if pat.search(fn):
                names.append(str(fp))
            scanned += 1
            if scanned > 20000 or len(hits) >= 120:
                break
            try:
                if fp.stat().st_size > 3_000_000:
                    continue
                if fp.suffix.lower() in DOC_EXT:
                    txt, _ = extract_text(fp, 200000)
                elif fp.suffix.lower() in TEXT_EXT or fp.suffix == "":
                    txt = read_text_file(fp)
                else:
                    continue
            except Exception:
                continue
            for i, line in enumerate(txt.splitlines(), 1):
                if pat.search(line):
                    hits.append(f"{fp}:{i}: {line.strip()[:200]}")
                    if len(hits) >= 120:
                        break
    out = []
    if names:
        out.append("Noms correspondants :\n" + "\n".join(names[:50]))
    if hits:
        out.append("Contenus correspondants :\n" + "\n".join(hits))
    return "\n\n".join(out) or f"Aucun résultat pour « {query} » dans {d} ({scanned} fichiers examinés)."


def _move_risk(ctx: ToolContext, a: dict) -> str:
    try:
        return "danger" if ctx.resolve(a.get("destination", "")).exists() else "write"
    except Exception:
        return "write"


@tool("move_path", "Déplace ou renomme un fichier/dossier.", {"source": p("string"), "destination": p("string")},
      required=["source", "destination"], risk="write", toolset="files", risk_fn=_move_risk)
def move_path(ctx: ToolContext, source: str, destination: str) -> ToolResult | str:
    s, d = ctx.resolve(source), ctx.resolve(destination)
    if not s.exists():
        return ToolResult.err(f"introuvable : {s}")
    if d.is_dir():
        d = d / s.name
    if d.exists():
        _trash(ctx, d)
    d.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(s), str(d))
    return f"Déplacé : {s} → {d}"


@tool("copy_path", "Copie un fichier ou un dossier.", {"source": p("string"), "destination": p("string")},
      required=["source", "destination"], risk="write", toolset="files")
def copy_path(ctx: ToolContext, source: str, destination: str) -> ToolResult | str:
    s, d = ctx.resolve(source), ctx.resolve(destination)
    if not s.exists():
        return ToolResult.err(f"introuvable : {s}")
    if d.is_dir():
        d = d / s.name
    d.parent.mkdir(parents=True, exist_ok=True)
    if s.is_dir():
        shutil.copytree(s, d, dirs_exist_ok=True)
    else:
        shutil.copy2(s, d)
    return f"Copié : {s} → {d}"


@tool("delete_path", "Supprime un fichier/dossier en l'envoyant dans la corbeille ZEUS (récupérable).",
      {"path": p("string")}, required=["path"], risk="danger", toolset="files",
      summary=lambda a: f"Mettre à la corbeille : {a.get('path')}")
def delete_path(ctx: ToolContext, path: str) -> ToolResult | str:
    f = ctx.resolve(path)
    if not f.exists():
        return ToolResult.err(f"introuvable : {f}")
    if f == Path(f.anchor) or f == Path.home() or f == ctx.cfg.home:
        return ToolResult.err("refusé : ce dossier est protégé")
    dest = _trash(ctx, f)
    return f"Mis à la corbeille ZEUS : {f} (récupérable dans {dest})."


@tool("download_file", "Télécharge un fichier depuis une URL.",
      {"url": p("string"), "path": p("string", "Destination (dossier ou fichier)")}, required=["url"],
      risk="write", toolset="files")
def download_file(ctx: ToolContext, url: str, path: str = "downloads") -> ToolResult | str:
    dest = ctx.resolve(path)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        name = Path(urllib.parse.urlparse(r.geturl()).path).name or "fichier"
        cd = r.headers.get("Content-Disposition") or ""
        m = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)', cd)
        if m:
            name = urllib.parse.unquote(m.group(1))
        if dest.is_dir() or not dest.suffix:
            dest.mkdir(parents=True, exist_ok=True)
            dest = dest / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        total = 0
        with dest.open("wb") as fh:
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > 500_000_000:
                    return ToolResult.err("fichier trop gros (> 500 Mo)")
                fh.write(chunk)
    return f"Téléchargé : {dest} ({human_size(total)})"


@tool("look_at_image", "Analyse une image (photo, capture, document scanné) : description, texte, réponse à une question.",
      {"path": p("string", "Chemin de l'image"), "question": p("string", "Ce que tu veux savoir")},
      required=["path"], toolset="files")
def look_at_image(ctx: ToolContext, path: str, question: str = "Décris précisément cette image et son texte.") -> ToolResult:
    f = ctx.resolve(path)
    if not f.exists():
        return ToolResult.err(f"introuvable : {f}")
    router = ctx.zeus.router
    if router.vision_available():
        r = router.chat([{"role": "system", "content": "Tu analyses des images avec précision, en français."},
                         {"role": "user", "content": [{"type": "text", "text": question},
                                                      {"type": "image", "path": str(f)}]}],
                        None, purpose="vision", need_vision=True, max_tokens=1200)
        return ToolResult(text=wrap_untrusted(f"image:{f.name}", r.text))
    if ocr_available():
        t = ocr_image(f)
        return ToolResult(text=wrap_untrusted(f"ocr:{f.name}", t or "(aucun texte détecté)") +
                          "\n(Aucun modèle de vision configuré : seul le texte a pu être lu.)")
    return ToolResult.err("aucun modèle de vision ni OCR disponible (ajoute un modèle « vision » dans Réglages, "
                          "ou installe Tesseract)")


# =========================================================================== shell & python
def _shell_risk(ctx: ToolContext, a: dict) -> str:
    return classify_shell(a.get("command", ""))


@tool("run_shell", "Exécute une commande système (PowerShell sous Windows, bash sinon) et renvoie la sortie.",
      {"command": p("string", "Commande"), "timeout": p("integer", "Délai max en secondes (120)"),
       "cwd": p("string", "Dossier de travail")}, required=["command"], risk="write", risk_fn=_shell_risk,
      summary=lambda a: f"Commande : {a.get('command')}")
def run_shell(ctx: ToolContext, command: str, timeout: int = 120, cwd: str = "") -> ToolResult:
    wd = str(ctx.resolve(cwd)) if cwd else str(ctx.cfg.workspace)
    if IS_WINDOWS:
        args: list[str] | str = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
                                 "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " + command]
        shell = False
    else:
        sh = shutil.which("bash") or "/bin/sh"
        args, shell = [sh, "-c", command], False
    code, out, err = run_cmd(args, timeout=max(5, min(int(timeout or 120), 3600)), cwd=wd, shell=shell,
                             cancel=ctx.cancel)
    text = f"$ {command}\n[code de sortie {code}]\n{out}"
    if err.strip():
        text += f"\n[stderr]\n{err}"
    return ToolResult(text=text.strip(), error=code not in (0,))


@tool("run_python", "Exécute un script Python (calculs, traitement de données, automatisation). print() pour la sortie. "
                    "Dans le script, `from zeus_outils import outil` appelle n'importe quel outil de ZEUS en une "
                    "ligne, ex. outil(\"phone_screen\"), outil(\"web_search\", query=\"…\") — idéal pour les boucles "
                    "et les traitements en série (mêmes validations que d'habitude).",
      {"code": p("string", "Code Python complet"), "timeout": p("integer", "Délai max en secondes (120)")},
      required=["code"], risk="write", risk_fn=lambda c, a: classify_python(a.get("code", "")),
      summary=lambda a: "Script Python :\n" + truncate(a.get("code", ""), 500))
def run_python(ctx: ToolContext, code: str, timeout: int = 120) -> ToolResult:
    tmp = ctx.cfg.dir("tmp")
    f = tmp / f"script_{int(time.time() * 1000)}.py"
    f.write_text(code, encoding="utf-8")
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    limit = max(5, min(int(timeout or 120), 3600))
    bridge = getattr(ctx.zeus, "bridge", None)
    token = ""
    if bridge is not None and ctx.trust != "external":
        try:
            bridge.ensure()
            token = bridge.issue(ctx.session, ctx.run, ttl=limit + 120)
            env.update(bridge.env(token, env))
        except OSError as e:
            log.warning("pont d'outils indisponible : %s", e)
    try:
        code_, out, err = run_cmd([sys.executable, str(f)], timeout=limit, cwd=str(ctx.cfg.workspace), env=env,
                                  cancel=ctx.cancel)
    finally:
        if token:
            bridge.revoke(token)
        try:
            f.unlink()
        except OSError:
            pass
    text = f"[code de sortie {code_}]\n{out}"
    if err.strip():
        text += f"\n[stderr]\n{err}"
    return ToolResult(text=text.strip(), error=code_ != 0)


# =========================================================================== web
def _http_get(url: str, timeout: float = 25, headers: dict | None = None, max_bytes: int = 6_000_000,
              data: bytes | None = None) -> tuple[bytes, str, str]:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept-Language": "fr,en;q=0.8",
                                                          "Accept": "*/*", "Accept-Encoding": "gzip, deflate",
                                                          **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(max_bytes)
        enc = (r.headers.get("Content-Encoding") or "").lower()
        if enc == "gzip":
            raw = gzip.decompress(raw)
        elif enc == "deflate":
            try:
                raw = zlib.decompress(raw)
            except zlib.error:
                raw = zlib.decompress(raw, -zlib.MAX_WBITS)
        return raw, (r.headers.get("Content-Type") or "").lower(), r.geturl()


def _decode(raw: bytes, ctype: str) -> str:
    m = re.search(r"charset=([\w-]+)", ctype)
    enc = m.group(1) if m else None
    if not enc:
        m2 = re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', raw[:3000], re.I)
        enc = m2.group(1).decode() if m2 else "utf-8"
    try:
        return raw.decode(enc, errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def _search_ddg(q: str, n: int) -> list[dict]:
    raw, ctype, _ = _http_get("https://html.duckduckgo.com/html/", data=urllib.parse.urlencode(
        {"q": q, "kl": "fr-fr"}).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"})
    html = _decode(raw, ctype)
    out = []
    for m in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>(.*?)(?=<a[^>]+class="result__a"|$)',
                         html, re.S):
        href, title, rest = m.group(1), m.group(2), m.group(3)
        if "uddg=" in href:
            href = urllib.parse.unquote(re.search(r"uddg=([^&]+)", href).group(1))  # type: ignore[union-attr]
        if href.startswith("//"):
            href = "https:" + href
        if "duckduckgo.com/y.js" in href:
            continue
        sn = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', rest, re.S)
        out.append({"title": html_to_text(title)[1], "url": href,
                    "snippet": html_to_text(sn.group(1))[1] if sn else ""})
        if len(out) >= n:
            break
    return out


def _search_bing(q: str, n: int) -> list[dict]:
    raw, ctype, _ = _http_get("https://www.bing.com/search?" + urllib.parse.urlencode({"q": q, "setlang": "fr",
                                                                                        "cc": "FR"}))
    html = _decode(raw, ctype)
    out = []
    for m in re.finditer(r'<li class="b_algo"(.*?)</li>', html, re.S):
        block = m.group(1)
        a = re.search(r'<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
        if not a:
            continue
        href = a.group(1).replace("&amp;", "&")
        u = re.search(r"[?&]u=a1([^&]+)", href)
        if "bing.com/ck/" in href and u:
            try:
                b = u.group(1)
                href = base64.urlsafe_b64decode(b + "=" * (-len(b) % 4)).decode("utf-8", "replace")
            except Exception:
                pass
        sn = re.search(r"<p[^>]*>(.*?)</p>", block, re.S)
        out.append({"title": html_to_text(a.group(2))[1], "url": href,
                    "snippet": html_to_text(sn.group(1))[1] if sn else ""})
        if len(out) >= n:
            break
    return out


def _search_api(ctx: ToolContext, q: str, n: int) -> list[dict]:
    cfg = ctx.cfg
    from ..config import Config
    brave = Config.secret(cfg.get("search.brave_api_key"))
    tavily = Config.secret(cfg.get("search.tavily_api_key"))
    searx = cfg.get("search.searxng_url")
    if brave:
        raw, _, _ = _http_get("https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode(
            {"q": q, "count": n}), headers={"X-Subscription-Token": brave, "Accept": "application/json"})
        j = json.loads(raw)
        return [{"title": r.get("title", ""), "url": r.get("url", ""), "snippet": html_to_text(r.get("description", ""))[1]}
                for r in (j.get("web") or {}).get("results", [])[:n]]
    if tavily:
        raw, _, _ = _http_get("https://api.tavily.com/search", data=json.dumps(
            {"api_key": tavily, "query": q, "max_results": n}).encode(), headers={"Content-Type": "application/json"})
        j = json.loads(raw)
        return [{"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")[:400]}
                for r in j.get("results", [])[:n]]
    if searx:
        raw, _, _ = _http_get(searx.rstrip("/") + "/search?" + urllib.parse.urlencode({"q": q, "format": "json"}))
        j = json.loads(raw)
        return [{"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")[:400]}
                for r in j.get("results", [])[:n]]
    return []


@tool("web_search", "Recherche sur internet (résultats : titre, lien, extrait). Pour lire une page : fetch_url.",
      {"query": p("string", "Requête"), "max_results": p("integer", "Nombre de résultats (6)")}, required=["query"])
def web_search(ctx: ToolContext, query: str, max_results: int = 6) -> ToolResult:
    n = max(1, min(int(max_results or 6), 15))
    errors = []
    for name, fn in (("api", lambda: _search_api(ctx, query, n)), ("duckduckgo", lambda: _search_ddg(query, n)),
                     ("bing", lambda: _search_bing(query, n))):
        try:
            res = fn()
        except Exception as e:  # noqa: BLE001
            errors.append(f"{name} : {e}")
            continue
        if res:
            lines = [f"{i}. {r['title']}\n   {r['url']}\n   {truncate(r['snippet'], 300)}" for i, r in enumerate(res, 1)]
            return ToolResult(text=wrap_untrusted(f"recherche:{name}", f"Résultats pour « {query} » :\n" +
                                                  "\n".join(lines)), data=res)
    return ToolResult.err("recherche impossible (" + "; ".join(errors or ["aucun résultat"]) + ")")


@tool("fetch_url", "Ouvre une page web (ou un PDF/JSON en ligne) et renvoie son texte lisible.",
      {"url": p("string", "Adresse"), "max_chars": p("integer", "Taille max du texte (12000)"),
       "links": p("boolean", "Inclure la liste des liens de la page")}, required=["url"])
def fetch_url(ctx: ToolContext, url: str, max_chars: int = 12000, links: bool = False) -> ToolResult:
    if not re.match(r"^https?://", url):
        url = "https://" + url
    try:
        raw, ctype, final = _http_get(url)
    except urllib.error.HTTPError as e:
        return ToolResult.err(f"HTTP {e.code} sur {url}")
    except Exception as e:  # noqa: BLE001
        return ToolResult.err(f"page injoignable : {e}")
    max_chars = max(1000, min(int(max_chars or 12000), 60000))
    if "pdf" in ctype or final.lower().endswith(".pdf"):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
            tf.write(raw)
        text, _ = extract_text(Path(tf.name), max_chars)
        os.unlink(tf.name)
        return ToolResult(text=wrap_untrusted(final, text))
    if ctype.startswith("image/"):
        d = ctx.cfg.dir("downloads")
        ext = "." + ctype.split("/")[1].split(";")[0]
        f = d / f"image_{int(time.time())}{ext}"
        f.write_bytes(raw)
        return ToolResult(text=f"Image téléchargée : {f}", images=[str(f)])
    body = _decode(raw, ctype)
    if "json" in ctype:
        try:
            body = json.dumps(json.loads(body), ensure_ascii=False, indent=1)
        except Exception:
            pass
        return ToolResult(text=wrap_untrusted(final, truncate(body, max_chars)))
    if "html" in ctype or "<html" in body[:500].lower():
        title, text, lks = html_to_text(body, keep_links=links)
        out = (f"# {title}\n" if title else "") + f"({final})\n\n" + truncate(text, max_chars)
        if links and lks:
            seen = []
            for t, h in lks:
                h = urllib.parse.urljoin(final, h)
                if h not in [s[1] for s in seen]:
                    seen.append((t, h))
            out += "\n\nLiens :\n" + "\n".join(f"- {t} → {h}" for t, h in seen[:80])
        return ToolResult(text=wrap_untrusted(final, out))
    return ToolResult(text=wrap_untrusted(final, truncate(body, max_chars)))

