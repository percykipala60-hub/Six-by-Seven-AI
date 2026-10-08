// Traduction automatique du site avec Google Traduction (aucune traduction écrite à la main).
// Le site est écrit en français. Quand un visiteur choisit une autre langue, on enregistre son choix
// dans le cookie que lit Google Traduction (« googtrans ») et on recharge la page : le script de Google
// traduit alors tout le texte affiché, y compris ce qui apparaît ensuite (étapes du guide, écrans…).

export const SOURCE_LANGUAGE = "fr";

const COOKIE = "googtrans";

const readCookie = () => {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
};

// Langue affichée : celle du cookie (« /fr/en » → « en »), sinon le français.
export function currentLanguage(): string {
  if (typeof document === "undefined") return SOURCE_LANGUAGE;
  const target = readCookie().split("/")[2];
  return target || SOURCE_LANGUAGE;
}

export const isTranslated = () => currentLanguage() !== SOURCE_LANGUAGE;

// Enregistre la langue choisie puis recharge la page dans cette langue.
export function setLanguage(code: string) {
  const host = window.location.hostname;
  // Le cookie peut avoir été posé pour le domaine exact ou pour le domaine parent : on nettoie les deux.
  const domains = ["", `; domain=${host}`, `; domain=.${host}`];
  for (const d of domains) document.cookie = `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
  if (code !== SOURCE_LANGUAGE) document.cookie = `${COOKIE}=/${SOURCE_LANGUAGE}/${code}; path=/`;
  // On retient où l'on était pour y revenir après le rechargement (sinon on se retrouvait tout en haut).
  try {
    const doc = document.documentElement;
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ y: window.scrollY, fromBottom: doc.scrollHeight - window.scrollY }));
  } catch {
    /* stockage indisponible : on rechargera simplement en haut */
  }
  window.location.reload();
}

const SCROLL_KEY = "six:scroll-after-language";

// Après un changement de langue : revient à la position d'avant. Près du bas de page (le choix de
// langue est dans le pied de page), on se repère par rapport au bas, car la traduction change un peu
// la longueur de la page. On réajuste quelques instants, le temps que la traduction se pose, et on
// s'arrête dès que le visiteur fait lui-même défiler la page.
export function restoreScrollAfterLanguage(): boolean {
  let saved: { y: number; fromBottom: number } | null = null;
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    sessionStorage.removeItem(SCROLL_KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  if (!saved) return false;
  const { y, fromBottom } = saved;
  let stopped = false;
  const stop = () => (stopped = true);
  window.addEventListener("wheel", stop, { once: true, passive: true });
  window.addEventListener("touchstart", stop, { once: true, passive: true });
  window.addEventListener("keydown", stop, { once: true });
  const place = () => {
    if (stopped) return;
    const doc = document.documentElement;
    const nearBottom = fromBottom < window.innerHeight * 2.5;
    const top = nearBottom ? doc.scrollHeight - fromBottom : y;
    window.scrollTo({ top, behavior: "instant" });
  };
  [0, 120, 400, 900, 1600, 2600, 4000].forEach((ms) => window.setTimeout(place, ms));
  return true;
}

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: { translate: { TranslateElement: new (options: object, id: string) => unknown } };
  }
}

// Au démarrage : si une autre langue que le français est choisie, on charge Google Traduction.
export function startAutoTranslate() {
  if (typeof window === "undefined" || !isTranslated()) return;
  document.documentElement.dataset.translated = currentLanguage();
  protectReactFromTranslation();
  protectBrandNames();
  const holder = document.createElement("div");
  holder.id = "google_translate_element";
  holder.style.display = "none";
  document.body.appendChild(holder);
  window.googleTranslateElementInit = () => {
    if (!window.google) return;
    new window.google.translate.TranslateElement({ pageLanguage: SOURCE_LANGUAGE, autoDisplay: false }, "google_translate_element");
  };
  const script = document.createElement("script");
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  document.head.appendChild(script);
}

// Google Traduction remplace les textes de la page par les siens. Quand React veut ensuite retirer ou
// insérer un élément à côté d'un texte remplacé, le navigateur lève une erreur et l'affichage se bloque.
// Ce correctif, classique avec les outils de traduction, ignore ces cas au lieu de planter.
function protectReactFromTranslation() {
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return node;
    return insertBefore.call(this, node, ref) as T;
  };
}

// Les noms Six et Seven.AI ne se traduisent jamais (Google traduirait « Six » comme le chiffre).
// Chaque fois qu'ils apparaissent dans un texte de la page, on les place dans un élément marqué
// translate="no", que Google Traduction laisse tel quel. Surveille aussi les textes affichés plus tard.
const BRAND = /\b(Six|Seven\.AI)\b/;
function protectBrandNames() {
  const wrap = (node: Text) => {
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, [translate='no'], .notranslate")) return;
    const text = node.nodeValue ?? "";
    if (!BRAND.test(text)) return;
    // Les espaces autour du nom vont dans l'élément protégé : Google Traduction rogne les espaces au bord
    // des passages qu'il traduit, ce qui collait les mots (« ndaniSixAnakupa »).
    // La ponctuation qui suit le nom y va aussi (sinon « Six. Il… » devenait « SixAnakupa… »).
    const parts = text.split(/(\s?\b(?:Six|Seven\.AI)\b[.,;:!?]?\s?)/);
    // Une seule enveloppe pour toute la phrase : dans un conteneur en ligne flexible (questions), les
    // morceaux deviendraient sinon des blocs séparés, sur plusieurs lignes.
    const frag = document.createElement("span");
    parts.forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 1) {
        const span = document.createElement("span");
        span.className = "notranslate";
        span.setAttribute("translate", "no");
        span.style.whiteSpace = "pre";
        span.textContent = part;
        frag.appendChild(span);
      } else frag.appendChild(document.createTextNode(part));
    });
    parent.replaceChild(frag, node);
  };
  const scan = (root: Node) => {
    if (root.nodeType === Node.TEXT_NODE) return wrap(root as Text);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) found.push(n as Text);
    found.forEach(wrap);
  };
  scan(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") scan(r.target);
      else r.addedNodes.forEach(scan);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

