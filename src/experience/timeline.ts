import { useEffect, useSyncExternalStore, type RefObject } from "react";

// Ligne de temps de la visite animée de l'accueil. Sa position est mesurée en « écrans » (unité historique) :
// elle avance par étapes au fil des gestes du visiteur. Toutes les animations (3D, légendes, guides)
// lisent la même valeur lissée, `timeline.p`.

export const T = {
  // Les quatre appareils en cercle.
  intro: [0, 1] as const,
  // Le cercle tourne, le téléphone choisi s'avance ; le message arrive, puis Six s'ouvre.
  phoneFront: [1, 2] as const,
  phoneMessage: 1.55,
  phoneOpenSix: 2.15,
  // La caméra entre dans l'écran.
  phoneDive: [2.5, 3.4] as const,
  // Guide sur téléphone : 4 étapes.
  phoneGuide: [3.4, 7.8] as const,
  // On ressort du téléphone, puis le cercle revient.
  phoneExit: [7.8, 8.9] as const,
  // L'ordinateur choisi s'avance, la caméra entre dans l'écran.
  laptopFront: [8.9, 9.8] as const,
  laptopDive: [9.9, 10.7] as const,
  // Guide sur ordinateur : 3 étapes.
  laptopGuide: [10.7, 14.0] as const,
  laptopExit: [14.0, 15.0] as const,
  // Les quatre appareils de nouveau en cercle, puis la page continue (Télécharger, questions…).
  outro: [15.0, 15.8] as const,
  total: 15.8,
};

// Arrêts de la visite : un geste (molette, doigt, flèche) passe à l'arrêt suivant, la transition se joue seule.
// Chaque arrêt est placé là où l'étape est entièrement montrée (légende lisible, interface complète).
const guideStops = ([a, b]: readonly [number, number], count: number) =>
  Array.from({ length: count }, (_, i) => a + ((i + 0.92) * (b - a)) / count);
export const STOPS = [
  0, // accueil : l'accroche et le cercle d'appareils
  1.95, // le téléphone s'avance, un message arrive
  2.45, // Six s'ouvre
  ...guideStops(T.phoneGuide, 4), // étapes 1 à 4, dans le téléphone
  8.5, // on ressort : la réponse est envoyée
  9.85, // l'ordinateur s'avance
  ...guideStops(T.laptopGuide, 3), // étapes 5 à 7, dans l'ordinateur
  T.total, // de nouveau le cercle ; la page continue ensuite normalement
];
// Arrêts des liens « Comment ça marche » (étape 1 du guide) et « Arnaques » (étape 7).
export const GUIDE_STOP = STOPS[3];
export const SCAM_STOP = STOPS[STOPS.length - 2];

// Téléphone ou tablette (écran tactile sans souris) : version allégée, transitions plus courtes.
export const isTouchDevice = () => typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const range = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// Départ et arrivée en douceur, sans accélération brutale au milieu (mouvements de caméra).
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Apparition puis disparition d'un élément sur [a, b] : monte sur `fade`, reste, redescend sur `fade`.
export const window01 = (p: number, a: number, b: number, fade = 0.18) =>
  Math.min(range(p, a, a + fade), 1 - range(p, b - fade, b));

// Position dans un guide : numéro d'étape et avancement dans l'étape (0 → 1).
export function stepAt(p: number, [a, b]: readonly [number, number], count: number) {
  const x = range(p, a, b) * count;
  const i = Math.min(count - 1, Math.floor(x));
  return { i, s: clamp01(x - i) };
}

// Mise en page mesurée sur la page, lue par la scène 3D : bas du texte d'accueil, en fraction de la hauteur
// de l'écran. Le cercle d'appareils se place dans l'espace libre en dessous, sans jamais passer derrière le texte.
export const layout = { introBottom: 0.5 };

type Listener = () => void;
export const timeline = {
  /** Position de la visite (en « écrans »), fixée par les gestes du visiteur et les transitions. */
  target: 0,
  /** Valeur suivie par toutes les animations (égale à target, lissée si le visiteur préfère moins d'animations). */
  p: 0,
  listeners: new Set<Listener>(),
};

// La visite n'occupe qu'un écran dans la page : ses étapes ne dépendent pas du défilement, seulement
// des gestes faits sur elle. Avant, elle occupait près de 17 écrans de page : un défilement rapide
// depuis le bas du site la traversait et s'arrêtait n'importe où au milieu (souvent sur « Colle la
// discussion »), et chaque fin d'étape demandait de recaler la page, ce qui faisait trembler l'écran
// des appareils sur iPhone.

// Géométrie de la visite dans la page, mesurée seulement quand la mise en page change.
const geom = { top: 0, height: 0 };
const measure = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  geom.top = r.top + window.scrollY;
  geom.height = r.height;
};
// La visite est entièrement à l'écran (en haut de la fenêtre) : les gestes y font avancer les étapes.
const tourOnScreen = () => Math.abs(window.scrollY - geom.top) <= 4;

// Étape atteinte, gardée pendant la session : un rechargement (y compris ceux que Safari fait seul)
// ou un changement de langue ramène à la même étape.
const SAVE_KEY = "six:tour-step";
const savePosition = () => {
  try {
    sessionStorage.setItem(SAVE_KEY, String(timeline.target));
  } catch {
    /* stockage indisponible */
  }
};
const savedPosition = () => {
  try {
    const v = parseFloat(sessionStorage.getItem(SAVE_KEY) ?? "");
    return Number.isFinite(v) ? Math.min(Math.max(v, 0), T.total) : null;
  } catch {
    return null;
  }
};
// Rechargement, retour arrière ou changement de langue (marqué par autoTranslate) : on reprend l'étape.
const isReturnVisit = () => {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "reload" || nav?.type === "back_forward";
};
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", savePosition);
  window.addEventListener("six:sync-scroll", savePosition);
}

// En développement : ligne de temps accessible aux scripts de test.
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __timeline: typeof timeline }).__timeline = timeline;

const subscribe = (l: Listener) => {
  timeline.listeners.add(l);
  return () => {
    timeline.listeners.delete(l);
  };
};

// Fait suivre `timeline.p` à la position de la visite, image par image, et prévient les animations.
export function useTimelineDriver(sectionRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = sectionRef.current;
    if (!el) return;
    measure(el);
    const remeasure = () => measure(el);
    const ro = new ResizeObserver(remeasure);
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener("resize", remeasure);
    if (isReturnVisit()) timeline.target = savedPosition() ?? 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      // Les transitions sont déjà adoucies : on les suit telles quelles (lissage seulement si le
      // visiteur préfère moins d'animations, où les étapes changent sans transition).
      const k = reduced ? 1 - Math.exp(-dt * 12) : 1;
      const next = timeline.p + (timeline.target - timeline.p) * k;
      const changed = Math.abs(next - timeline.p) > 1e-5;
      timeline.p = Math.abs(timeline.target - next) < 1e-4 ? timeline.target : next;
      if (changed) timeline.listeners.forEach((l) => l());
      raf = requestAnimationFrame(tick);
    };
    timeline.p = timeline.target;
    timeline.listeners.forEach((l) => l());
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [sectionRef]);
}

// Valeur dérivée de la ligne de temps (nombre, booléen ou texte) : le composant ne se redessine
// que lorsqu'elle change, pas à chaque image.
export function useTimeline<V extends string | number | boolean>(select: (p: number) => V): V {
  return useSyncExternalStore(subscribe, () => select(timeline.p));
}

// Appelle `apply` à chaque mouvement de la ligne de temps, pour écrire directement les styles
// (opacité, transformation) sans passer par React.
export function useTimelineEffect(apply: (p: number) => void) {
  useEffect(() => {
    const run = () => apply(timeline.p);
    run();
    return subscribe(run);
  });
}

// Aller à une étape précise (liens « Comment ça marche », « Arnaques ») : envoyé par la page.
export const goToStop = (stop: number) => window.dispatchEvent(new CustomEvent("six:goto", { detail: stop }));

// Défilement étape par étape : quand la visite est à l'écran, un geste vers le bas ou vers le haut
// amène à l'arrêt suivant ou précédent, avec une transition jouée automatiquement.
// Au dernier arrêt, un geste vers le bas fait glisser la page jusqu'à la section suivante ;
// au premier arrêt, un geste vers le haut laisse la page défiler normalement.
export function useStepScroll(sectionRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let busy = false;
    // Gestes faits pendant une transition : joués à la suite dès qu'elle se termine. Ceux qui veulent
    // aller vite enchaînent deux ou trois gestes : chacun compte (jusqu'à 3 en attente).
    let queued = { dir: 1 as 1 | -1, n: 0 };
    const queue = (dir: 1 | -1) => {
      queued = { dir, n: queued.dir === dir ? Math.min(queued.n + 1, 3) : 1 };
    };
    // Début de la dernière étape lancée : une simple remontée de l'élan juste après n'est pas un nouveau
    // geste (rebond du pavé tactile), alors qu'une vraie reprise après une pause en est toujours un.
    let stepStartedAt = -Infinity;
    const SAME_GESTURE_MS = 500;
    // Suivi des gestes de molette, pour en reconnaître le début (voir onWheel).
    let lastWheel = 0;
    let peak = 0;
    let trough = Infinity;
    let falling = false;

    // Après le dernier arrêt : sortie de la visite (la page glisse jusqu'à la section suivante).
    const EXIT = T.total + 1;
    // Arrêt suivant (dir = 1) ou précédent (dir = -1) ; null quand il n'y en a plus.
    const nextStop = (dir: 1 | -1) => {
      const u = timeline.target;
      const stops = [...STOPS, EXIT];
      return dir > 0 ? (stops.find((s) => s > u + 0.02) ?? null) : ([...stops].reverse().find((s) => s < u - 0.02) ?? null);
    };

    const duration = (u0: number, to: number) => {
      const dist = Math.abs(to - u0);
      // Les mouvements d'appareils (le cercle qui tourne, l'appareil qui s'avance, la caméra qui entre
      // dans l'écran ou en ressort) prennent leur temps ; les étapes à l'intérieur de l'appli restent vives.
      const moves = [T.phoneFront, T.phoneDive, T.phoneExit, T.laptopFront, T.laptopDive, T.laptopExit, T.outro];
      const lo = Math.min(u0, to);
      const hi = Math.max(u0, to);
      const camera = moves.some(([a, b]) => lo < b && hi > a);
      // Sur téléphone, tout est plus court : les longues transitions y donnent une impression de lenteur.
      const touch = isTouchDevice();
      if (reduced) return 0;
      if (camera) return touch ? Math.min(1900, 900 + dist * 380) : Math.min(3400, 1500 + dist * 650);
      return touch ? Math.min(900, 450 + dist * 260) : Math.min(1400, 650 + dist * 380);
    };

    const finish = () => {
      busy = false;
      savePosition();
      if (queued.n > 0) {
        queued.n--;
        if (!advance(queued.dir)) queued.n = 0;
      }
    };

    const go = (to: number) => {
      busy = true;
      stepStartedAt = performance.now();
      cancelAnimationFrame(raf);
      const start = performance.now();
      if (to === EXIT) {
        // Sortie : la page défile pour de vrai jusqu'à la section suivante (la visite garde sa dernière étape).
        const from = window.scrollY;
        const target = geom.top + geom.height;
        const d = reduced ? 0 : isTouchDevice() ? 900 : 1100;
        const step = (now: number) => {
          const t = d ? Math.min(1, (now - start) / d) : 1;
          window.scrollTo({ top: from + (target - from) * easeInOutSine(t), behavior: "instant" });
          if (t < 1) raf = requestAnimationFrame(step);
          else finish();
        };
        raf = requestAnimationFrame(step);
        return;
      }
      const u0 = timeline.target;
      const d = duration(u0, to);
      const step = (now: number) => {
        const t = d ? Math.min(1, (now - start) / d) : 1;
        timeline.target = u0 + (to - u0) * easeInOutSine(t);
        if (t < 1) raf = requestAnimationFrame(step);
        else {
          timeline.target = to;
          finish();
        }
      };
      raf = requestAnimationFrame(step);
    };

    // Avance d'un arrêt ; renvoie false si le geste doit faire défiler la page normalement.
    const advance = (dir: 1 | -1) => {
      if (!tourOnScreen()) return false;
      const to = nextStop(dir);
      if (to === null) return false;
      go(to);
      return true;
    };

    // Un geste = un arrêt, ni plus ni moins. Un pavé tactile envoie des dizaines d'évènements par geste,
    // puis une traîne d'élan qui décroît : on ne réagit qu'au début d'un geste, c'est-à-dire après une pause
    // (plus de 0,2 s sans évènement), ou quand l'intensité remonte nettement après avoir baissé (nouveau geste lancé
    // pendant l'élan du précédent). Un geste fait pendant une transition est retenu et joué ensuite.
    const isNewGesture = (abs: number, gap: number): "pause" | "rise" | null => {
      if (gap > 220) {
        peak = trough = abs;
        falling = false;
        return "pause";
      }
      if (abs > peak) peak = abs;
      if (!falling && abs < peak * 0.6) {
        falling = true;
        trough = abs;
      }
      if (falling) trough = Math.min(trough, abs);
      // Remontée nette seulement : l'élan d'un pavé tactile a de petits rebonds qu'on ne doit pas prendre
      // pour un nouveau geste (sinon un seul geste faisait passer deux étapes).
      if (falling && abs >= 16 && abs > trough * 4) {
        peak = trough = abs;
        falling = false;
        return "rise";
      }
      return null;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      // Heure de création de l'évènement (et non de son traitement, qui peut être retardé pendant une transition).
      const now = e.timeStamp;
      const gap = now - lastWheel;
      lastWheel = now;
      const abs = Math.abs(e.deltaY);
      const fresh = isNewGesture(abs, gap);
      if (!tourOnScreen() && !busy) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      if (nextStop(dir) === null && !busy) return; // au début de la visite, vers le haut : défilement normal
      e.preventDefault();
      if (!fresh || abs < 1) return;
      // Remontée de l'élan juste après le départ d'une étape : c'est la fin du même geste, on l'ignore.
      if (fresh === "rise" && now - stepStartedAt < SAME_GESTURE_MS) return;
      if (busy) queue(dir);
      else advance(dir);
    };

    let touch: { y: number; decided: boolean; mine: boolean } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touch = { y: e.touches[0].clientY, decided: false, mine: false };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touch) return;
      const dy = touch.y - e.touches[0].clientY; // > 0 : le doigt monte, la page descendrait
      if (!touch.decided) {
        if (Math.abs(dy) < 6) {
          if (tourOnScreen()) e.preventDefault();
          return;
        }
        touch.decided = true;
        touch.mine = busy || (tourOnScreen() && nextStop(dy > 0 ? 1 : -1) !== null);
      }
      if (touch.mine) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = touch;
      touch = null;
      if (!t?.mine) return;
      const dy = t.y - e.changedTouches[0].clientY;
      if (Math.abs(dy) <= 30) return;
      if (busy) queue(dy > 0 ? 1 : -1);
      else advance(dy > 0 ? 1 : -1);
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.altKey || e.ctrlKey || e.metaKey || el.closest("input, textarea, select, [contenteditable]")) return;
      const down = ["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey);
      const up = ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey);
      if (!down && !up) return;
      if (busy) {
        queue(down ? 1 : -1);
        return e.preventDefault();
      }
      if (advance(down ? 1 : -1)) e.preventDefault();
    };

    // Aller directement à une étape (liens du menu) : la page remonte sur la visite, puis la transition se joue.
    const onGoto = (e: Event) => {
      const stop = (e as CustomEvent<number>).detail;
      window.scrollTo({ top: geom.top, behavior: "instant" });
      queued.n = 0;
      go(stop);
    };

    // Molette et doigt : écoutés sur la visite seulement. Ailleurs, la page défile librement,
    // sans que le navigateur attende notre code à chaque mouvement (défilement fluide).
    const el = sectionRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("six:goto", onGoto);
    return () => {
      cancelAnimationFrame(raf);
      savePosition();
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("six:goto", onGoto);
    };
  }, [sectionRef]);
}
