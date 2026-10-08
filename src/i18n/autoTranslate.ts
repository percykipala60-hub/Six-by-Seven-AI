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
  window.location.reload();
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
