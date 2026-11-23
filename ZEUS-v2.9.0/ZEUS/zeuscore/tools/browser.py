"""Navigateur piloté (Chromium via Playwright, facultatif) : ouvrir des sites, lire la page sous forme
d'éléments numérotés, cliquer, remplir des formulaires, faire défiler, capturer.

Activation : pip install playwright  puis  python -m playwright install chromium
Le profil est persistant (data/browser-profile) : connecte-toi une fois à tes sites, ZEUS garde la session.
"""

from __future__ import annotations

import importlib.util
import queue
import re
import threading
import time
from typing import TYPE_CHECKING, Any, Callable

from ..security import text_mentions_money
from ..util import log, norm, truncate, wrap_untrusted
from . import ToolContext, ToolResult, p, tool

if TYPE_CHECKING:  # pragma: no cover
    from ..core import Zeus

AVAILABLE = importlib.util.find_spec("playwright") is not None

COLLECT_JS = r"""
() => {
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox],'
    + '[role=tab], [role=menuitem], [role=option], [contenteditable=true], [onclick], summary';
  document.querySelectorAll('[data-zeus-id]').forEach(e => e.removeAttribute('data-zeus-id'));
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
    i += 1;
    el.setAttribute('data-zeus-id', String(i));
    const tag = el.tagName.toLowerCase();
    const field = tag === 'input' || tag === 'select' || tag === 'textarea';
    let own = tag === 'select' ? '' : (el.getAttribute('aria-label') || (field ? '' : el.innerText) || (tag === 'input' && ['submit', 'button'].includes(el.type) ? el.value : '')
      || el.placeholder || el.title || el.alt || el.getAttribute('name') || '');
    own = String(own).trim().replace(/\s+/g, ' ');
    const lab = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : el.closest('label');
    let label = lab && field ? (lab.innerText.trim().replace(/\s+/g, ' ') + (own && own !== lab.innerText.trim() ? ' — ' + own : '')) : own;
    if (tag === 'select' && el.selectedIndex >= 0) label = (label ? label + ' : ' : '') + el.options[el.selectedIndex].text;
    if (!label) label = tag === 'input' ? (el.type || 'champ') : tag;
    label = label.slice(0, 90);
    out.push({i, tag, type: (el.type || '').toLowerCase(), label, href: (el.href || '').slice(0, 120),
      vis: r.top < innerHeight && r.bottom > 0, checked: !!el.checked, disabled: !!el.disabled,
      value: (tag === 'input' || tag === 'textarea') && el.type !== 'password' ? String(el.value || '').slice(0, 60) : ''});
    if (i >= 160) break;
  }
  const main = document.querySelector('main, article, [role=main]') || document.body;
  return {title: document.title, url: location.href, elements: out, text: (main ? main.innerText : '').slice(0, 5000)};
}
"""


class Browser:
    """Un seul fil d'exécution possède Playwright (l'API synchrone n'est pas multi-fils)."""

    def __init__(self, zeus: "Zeus"):
        self.zeus = zeus
        self.jobs: queue.Queue = queue.Queue()
        self.thread: threading.Thread | None = None
        self.ctx = None
        self.page = None
        self.pw = None
        self.last: dict = {}
        self._lock = threading.Lock()

    def _worker(self) -> None:
        from playwright.sync_api import sync_playwright  # type: ignore
        cfg = self.zeus.config
        try:
            self.pw = sync_playwright().start()
            profile = cfg.dir("browser-profile")
            headless = bool(cfg.get("browser.headless", False))
            try:
                self.ctx = self.pw.chromium.launch_persistent_context(
                    str(profile), headless=headless, viewport={"width": 1280, "height": 860}, locale="fr-FR",
                    accept_downloads=True, args=["--disable-blink-features=AutomationControlled"])
            except Exception:
                self.ctx = self.pw.chromium.launch_persistent_context(
                    str(profile), headless=True, viewport={"width": 1280, "height": 860}, locale="fr-FR",
                    accept_downloads=True)
            self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        except Exception as e:  # noqa: BLE001
            log.error("navigateur : %s", e)
            err = e
            while True:
                fn, box = self.jobs.get()
                if fn is None:
                    return
                box["error"] = err
                box["done"].set()
        while True:
            fn, box = self.jobs.get()
            if fn is None:
                break
            try:
                box["result"] = fn(self)
            except Exception as e:  # noqa: BLE001
                box["error"] = e
            box["done"].set()
        try:
            self.ctx.close()
            self.pw.stop()
        except Exception:
            pass

    def run(self, fn: Callable[["Browser"], Any], timeout: float = 90) -> Any:
        if not AVAILABLE:
            raise RuntimeError("navigateur non installé : pip install playwright  puis  python -m playwright install chromium")
        with self._lock:
            if self.thread is None or not self.thread.is_alive():
                self.thread = threading.Thread(target=self._worker, daemon=True, name="navigateur")
                self.thread.start()
        box: dict[str, Any] = {"done": threading.Event()}
        self.jobs.put((fn, box))
        if not box["done"].wait(timeout):
            raise TimeoutError("le navigateur ne répond pas")
        if "error" in box:
            raise box["error"]
        return box.get("result")

    def stop(self) -> None:
        if self.thread and self.thread.is_alive():
            self.jobs.put((None, None))

    # ------------------------------------------------------------------ à exécuter dans le fil navigateur
    def snapshot(self) -> dict:
        try:
            self.page.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception:
            pass
        data = self.page.evaluate(COLLECT_JS)
        self.last = data
        return data


def _get(zeus: "Zeus") -> Browser:
    b = getattr(zeus, "_browser", None)
    if b is None:
        b = Browser(zeus)
        zeus._browser = b  # type: ignore[attr-defined]
    return b


def _fmt(data: dict, text: bool = False) -> str:
    lines = [f"Page : {data.get('title') or '(sans titre)'}", f"Adresse : {data.get('url')}"]
    els = []
    for e in data.get("elements") or []:
        kind = {"a": "lien", "button": "bouton", "select": "liste", "textarea": "zone de texte"}.get(e["tag"], e["tag"])
        if e["tag"] == "input":
            kind = {"checkbox": "case", "radio": "option", "submit": "bouton", "button": "bouton",
                    "search": "champ recherche", "email": "champ e-mail", "password": "champ mot de passe",
                    "tel": "champ téléphone", "number": "champ nombre"}.get(e["type"], "champ")
        flags = []
        if e.get("value"):
            flags.append(f"valeur « {e['value']} »")
        if e["type"] in ("checkbox", "radio"):
            flags.append("coché" if e.get("checked") else "non coché")
        if e.get("disabled"):
            flags.append("grisé")
        if not e.get("vis"):
            flags.append("hors écran")
        els.append(f"[{e['i']}] {kind} \"{e['label']}\"" + (f" ({', '.join(flags)})" if flags else ""))
    body = "\n".join(lines) + "\n" + ("\n".join(els) if els else "(aucun élément interactif)")
    if text:
        body += "\n\nTexte de la page :\n" + truncate(data.get("text") or "", 4000)
    return wrap_untrusted(f"navigateur:{data.get('url', '')[:80]}", body)


def _money(ctx: ToolContext, a: dict) -> str:
    b = getattr(ctx.zeus, "_browser", None)
    last = (b.last if b else {}) or {}
    page_text = (last.get("text") or "") + " " + (last.get("url") or "")
    label = str(a.get("text") or "")
    el = a.get("element")
    if el:
        e = next((x for x in last.get("elements") or [] if x["i"] == int(el)), None)
        label += " " + (e or {}).get("label", "")
    if re.search(r"checkout|paiement|payment|/pay|cart|panier", norm(last.get("url") or "")) and \
            re.search(r"pay|confirm|valid|command|acheter|buy|order|placer", norm(label)):
        return "money"
    if text_mentions_money(label) or (text_mentions_money(page_text) and re.search(
            r"pay|confirm|valid|command|acheter|buy|order|envoyer|submit|transf", norm(label))):
        return "money"
    return "write"


def _type_money(ctx: ToolContext, a: dict) -> str:
    b = getattr(ctx.zeus, "_browser", None)
    last = (b.last if b else {}) or {}
    el = a.get("element")
    e = next((x for x in last.get("elements") or [] if el and x["i"] == int(el)), None) or {}
    lab = norm(e.get("label", ""))
    if re.search(r"carte|card|cvv|cvc|expir|iban|pin", lab) or e.get("type") == "password":
        return "money" if re.search(r"carte|card|cvv|cvc|iban|pin", lab) else "write"
    return "write"


def _bt(name: str, desc: str, params: dict | None = None, required: list | None = None, risk: str = "write", **kw):
    if not AVAILABLE:
        return lambda fn: fn
    return tool(name, desc, params, required, risk=risk, toolset="browser", parallel_safe=False, **kw)


@_bt("browser_open", "Ouvre une page dans le navigateur piloté et renvoie ses éléments numérotés [n].",
     {"url": p("string", "Adresse"), "new_tab": p("boolean", "Nouvel onglet")}, required=["url"])
def browser_open(ctx: ToolContext, url: str, new_tab: bool = False) -> ToolResult:
    if not re.match(r"^[a-z]+://", url):
        url = "https://" + url

    def go(b: Browser) -> dict:
        if new_tab:
            b.page = b.ctx.new_page()
        b.page.goto(url, wait_until="domcontentloaded", timeout=45000)
        b.page.wait_for_timeout(800)
        return b.snapshot()
    return ToolResult(text=_fmt(_get(ctx.zeus).run(go)))


@_bt("browser_read", "Relit la page en cours : éléments numérotés, et le texte si text=true.",
     {"text": p("boolean", "Inclure le texte de la page")}, risk="read")
def browser_read(ctx: ToolContext, text: bool = True) -> ToolResult:
    return ToolResult(text=_fmt(_get(ctx.zeus).run(lambda b: b.snapshot()), text=text))


def _locate(b: Browser, element: int | None, text: str | None):
    if element:
        loc = b.page.locator(f'[data-zeus-id="{int(element)}"]')
        if loc.count():
            return loc.first
        b.snapshot()
        loc = b.page.locator(f'[data-zeus-id="{int(element)}"]')
        if loc.count():
            return loc.first
        raise RuntimeError(f"élément [{element}] introuvable : relis la page (browser_read)")
    if text:
        for loc in (b.page.get_by_role("button", name=text), b.page.get_by_role("link", name=text),
                    b.page.get_by_label(text), b.page.get_by_placeholder(text), b.page.get_by_text(text)):
            try:
                if loc.count():
                    return loc.first
            except Exception:
                continue
        raise RuntimeError(f"aucun élément « {text} » sur la page")
    raise RuntimeError("indique element (numéro) ou text")


@_bt("browser_click", "Clique sur un élément de la page (numéro [n] ou texte visible).",
     {"element": p("integer"), "text": p("string")}, risk_fn=_money,
     summary=lambda a: f"Navigateur : cliquer sur {a.get('element') or a.get('text')}")
def browser_click(ctx: ToolContext, element: int | None = None, text: str | None = None) -> ToolResult:
    def go(b: Browser) -> dict:
        loc = _locate(b, element, text)
        loc.scroll_into_view_if_needed(timeout=5000)
        loc.click(timeout=10000)
        b.page.wait_for_timeout(1200)
        return b.snapshot()
    return ToolResult(text="Cliqué.\n" + _fmt(_get(ctx.zeus).run(go)))


@_bt("browser_type", "Remplit un champ (numéro [n] ou libellé), submit=true pour valider avec Entrée.",
     {"element": p("integer"), "label": p("string", "Libellé du champ si pas de numéro"), "text": p("string"),
      "submit": p("boolean")}, required=["text"], risk_fn=_type_money,
     summary=lambda a: f"Navigateur : écrire « {truncate(str(a.get('text', '')), 120)} »")
def browser_type(ctx: ToolContext, text: str, element: int | None = None, label: str = "", submit: bool = False) -> ToolResult:
    def go(b: Browser) -> dict:
        loc = _locate(b, element, label or None)
        loc.fill(text, timeout=10000)
        if submit:
            loc.press("Enter")
            b.page.wait_for_timeout(1500)
        return b.snapshot()
    return ToolResult(text="Saisi.\n" + _fmt(_get(ctx.zeus).run(go)))


@_bt("browser_select", "Choisit une option dans une liste déroulante.", {"element": p("integer"), "value": p("string")},
     required=["element", "value"])
def browser_select(ctx: ToolContext, element: int, value: str) -> ToolResult:
    def go(b: Browser) -> dict:
        loc = _locate(b, element, None)
        try:
            loc.select_option(label=value, timeout=8000)
        except Exception:
            loc.select_option(value=value, timeout=8000)
        return b.snapshot()
    return ToolResult(text="Option choisie.\n" + _fmt(_get(ctx.zeus).run(go)))


@_bt("browser_scroll", "Fait défiler la page (bas/haut).", {"direction": p("string", enum=["bas", "haut"])}, risk="read")
def browser_scroll(ctx: ToolContext, direction: str = "bas") -> ToolResult:
    def go(b: Browser) -> dict:
        b.page.mouse.wheel(0, 700 if direction != "haut" else -700)
        b.page.wait_for_timeout(500)
        return b.snapshot()
    return ToolResult(text=_fmt(_get(ctx.zeus).run(go)))


@_bt("browser_back", "Revient à la page précédente.", risk="read")
def browser_back(ctx: ToolContext) -> ToolResult:
    def go(b: Browser) -> dict:
        b.page.go_back(timeout=20000)
        b.page.wait_for_timeout(600)
        return b.snapshot()
    return ToolResult(text=_fmt(_get(ctx.zeus).run(go)))


@_bt("browser_screenshot", "Capture la page en cours (pour la voir ou l'envoyer).", {"full_page": p("boolean")},
     risk="read")
def browser_screenshot(ctx: ToolContext, full_page: bool = False) -> ToolResult:
    f = ctx.cfg.dir("captures") / f"web_{int(time.time() * 1000)}.png"
    _get(ctx.zeus).run(lambda b: b.page.screenshot(path=str(f), full_page=full_page))
    return ToolResult(text=f"Capture : {f}", images=[str(f)], files=[])


@_bt("browser_tabs", "Onglets : list, switch (index), close (index).",
     {"action": p("string", enum=["list", "switch", "close"]), "index": p("integer")}, risk="read")
def browser_tabs(ctx: ToolContext, action: str = "list", index: int = 0) -> str:
    def go(b: Browser) -> str:
        pages = b.ctx.pages
        if action == "switch" and 0 <= index < len(pages):
            b.page = pages[index]
            b.page.bring_to_front()
        elif action == "close" and 0 <= index < len(pages) and len(pages) > 1:
            pages[index].close()
            b.page = b.ctx.pages[-1]
        return "\n".join(f"{'→' if pg == b.page else ' '} [{i}] {pg.title()[:70]} — {pg.url[:90]}"
                         for i, pg in enumerate(b.ctx.pages))
    return _get(ctx.zeus).run(go)


__all__ = ["AVAILABLE", "Browser"]
