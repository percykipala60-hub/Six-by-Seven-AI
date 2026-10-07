import { useEffect, useSyncExternalStore, type RefObject } from "react";

// Ligne de temps de la page « Découvrir ». Le défilement est mesuré en « écrans » :
// 1 unité = une hauteur de fenêtre parcourue. Toutes les animations (3D, légendes, guides)
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
  /** Valeur visée, lue sur le défilement. */
  target: 0,
  /** Valeur lissée, utilisée par toutes les animations. */
  p: 0,
  /** Pendant une transition entre deux arrêts : valeur imposée, sans faire défiler la page à chaque image. */
  override: null as number | null,
  listeners: new Set<Listener>(),
};

// Géométrie de la visite, mesurée seulement quand la mise en page change (et non à chaque image :
// relire la position d'un élément force le navigateur à recalculer la page, source de saccades).
const geom = { top: 0, height: 0, vh: 1 };
const measure = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  geom.top = r.top + window.scrollY;
  geom.height = r.height;
  geom.vh = window.innerHeight;
};
// Taille d'une unité de la ligne de temps, en pixels de défilement.
const unitPx = () => Math.max((geom.height - geom.vh) / T.total, 1);
// Position de défilement lue au moment du défilement (et non à chaque image, où la lire peut forcer
// un recalcul de la page).
let scrollY = typeof window !== "undefined" ? window.scrollY : 0;
if (typeof window !== "undefined") window.addEventListener("scroll", () => (scrollY = window.scrollY), { passive: true });
const scrollUnits = () => (scrollY - geom.top) / unitPx();

const subscribe = (l: Listener) => {
  timeline.listeners.add(l);
  return () => {
    timeline.listeners.delete(l);
  };
};

// Pilote la ligne de temps depuis le défilement de `sectionRef` : la section mesure (total + 1) écrans,
// la scène reste collée en haut pendant ce temps.
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
    const read = () => {
      timeline.target = timeline.override ?? clamp01(scrollUnits() / T.total) * T.total;
    };
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      read();
      // Lissage léger, utile seulement si on tire l'ascenseur : les transitions entre arrêts sont
      // déjà adoucies et appliquées telles quelles.
      const k = reduced || timeline.override !== null ? 1 : 1 - Math.exp(-dt * 12);
      const next = timeline.p + (timeline.target - timeline.p) * k;
      const changed = Math.abs(next - timeline.p) > 1e-5;
      timeline.p = Math.abs(timeline.target - next) < 1e-4 ? timeline.target : next;
      if (changed) timeline.listeners.forEach((l) => l());
      raf = requestAnimationFrame(tick);
    };
    read();
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

// Défilement étape par étape : tant que la visite occupe l'écran, un geste vers le bas ou vers le haut
// amène à l'arrêt suivant ou précédent, avec une transition jouée automatiquement.
// Au dernier arrêt, un geste vers le bas rend la main au défilement normal de la page.
export function useStepScroll(sectionRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let busy = false;
    // Geste fait pendant une transition : joué dès qu'elle se termine (un seul retenu).
    let queued: 0 | 1 | -1 = 0;
    // Suivi des gestes de molette, pour en reconnaître le début (voir onWheel).
    let lastWheel = 0;
    let peak = 0;
    let trough = Infinity;
    let falling = false;

    // La visite occupe l'écran : de son début jusqu'au moment où la section suivante arrive en haut.
    const pinned = () => window.scrollY >= geom.top - 1 && window.scrollY <= geom.top + geom.height + 2;
    const current = () => timeline.override ?? scrollUnits();
    // Fin de la visite : la section suivante arrive en haut de l'écran.
    const exitStop = () => geom.height / unitPx();
    // Arrêt suivant (dir = 1) ou précédent (dir = -1) ; null quand il n'y en a plus.
    // Après le dernier arrêt, un dernier geste fait glisser la visite vers le haut et amène la section suivante.
    const nextStop = (dir: 1 | -1) => {
      const u = current();
      const stops = [...STOPS, exitStop()];
      return dir > 0 ? (stops.find((s) => s > u + 0.02) ?? null) : ([...stops].reverse().find((s) => s < u - 0.02) ?? null);
    };

    const go = (to: number) => {
      const from = window.scrollY;
      const target = geom.top + to * unitPx();
      const u0 = current();
      // Entre deux arrêts de la visite, la scène reste collée à l'écran : inutile de faire défiler la page
      // à chaque image (c'était coûteux). On anime directement la ligne de temps, et la page ne défile
      // qu'une fois, à l'arrivée. Pour sortir de la visite, on fait défiler pour de vrai.
      const virtual = to <= T.total + 1e-6 && u0 <= T.total + 1e-6;
      const dist = Math.abs(to - u0);
      // Les mouvements d'appareils (le cercle qui tourne, l'appareil qui s'avance, la caméra qui entre
      // dans l'écran ou en ressort) prennent leur temps ; les étapes à l'intérieur de l'appli restent vives.
      const moves = [T.phoneFront, T.phoneDive, T.phoneExit, T.laptopFront, T.laptopDive, T.laptopExit, T.outro];
      const lo = Math.min(u0, to);
      const hi = Math.max(u0, to);
      const camera = moves.some(([a, b]) => lo < b && hi > a);
      // Sur téléphone, tout est plus court : les longues transitions y donnent une impression de lenteur.
      const touch = isTouchDevice();
      const duration = reduced
        ? 0
        : camera
          ? touch
            ? Math.min(1900, 900 + dist * 380)
            : Math.min(3400, 1500 + dist * 650)
          : touch
            ? Math.min(900, 450 + dist * 260)
            : Math.min(1400, 650 + dist * 380);
      const start = performance.now();
      busy = true;
      cancelAnimationFrame(raf);
      const step = (now: number) => {
        const t = duration ? Math.min(1, (now - start) / duration) : 1;
        const e = easeInOutSine(t);
        if (virtual) timeline.override = u0 + (to - u0) * e;
        else window.scrollTo({ top: from + (target - from) * e, behavior: "instant" });
        if (t < 1) raf = requestAnimationFrame(step);
        else {
          if (virtual) {
            window.scrollTo({ top: target, behavior: "instant" });
            // L'évènement de défilement n'arrivera qu'à l'image suivante : on note la position tout de suite.
            scrollY = window.scrollY;
            timeline.override = null;
          }
          busy = false;
          const next = queued;
          queued = 0;
          if (next) advance(next);
        }
      };
      raf = requestAnimationFrame(step);
    };

    // Avance d'un arrêt ; renvoie false si le geste doit faire défiler la page normalement.
    const advance = (dir: 1 | -1) => {
      if (!pinned()) return false;
      const to = nextStop(dir);
      if (to === null) return false;
      go(to);
      return true;
    };

    // Un geste = un arrêt, ni plus ni moins. Un pavé tactile envoie des dizaines d'évènements par geste,
    // puis une traîne d'élan qui décroît : on ne réagit qu'au début d'un geste, c'est-à-dire après une pause
    // (plus de 0,2 s sans évènement), ou quand l'intensité remonte nettement après avoir baissé (nouveau geste lancé
    // pendant l'élan du précédent). Un geste fait pendant une transition est retenu et joué ensuite.
    const isNewGesture = (abs: number, gap: number) => {
      if (gap > 220) {
        peak = trough = abs;
        falling = false;
        return true;
      }
      if (abs > peak) peak = abs;
      if (!falling && abs < peak * 0.6) {
        falling = true;
        trough = abs;
      }
      if (falling) trough = Math.min(trough, abs);
      if (falling && abs >= 10 && abs > trough * 3) {
        peak = trough = abs;
        falling = false;
        return true;
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      // Heure de création de l'évènement (et non de son traitement, qui peut être retardé pendant une transition).
      const now = e.timeStamp;
      const gap = now - lastWheel;
      lastWheel = now;
      const abs = Math.abs(e.deltaY);
      const fresh = isNewGesture(abs, gap);
      if (!pinned()) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      if (nextStop(dir) === null && !busy) return; // au bout de la visite : défilement normal
      e.preventDefault();
      if (!fresh || abs < 1) return;
      if (busy) queued = dir;
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
          if (pinned()) e.preventDefault();
          return;
        }
        touch.decided = true;
        touch.mine = pinned() && (busy || nextStop(dy > 0 ? 1 : -1) !== null);
      }
      if (touch.mine) e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = touch;
      touch = null;
      if (!t?.mine) return;
      const dy = t.y - e.changedTouches[0].clientY;
      if (Math.abs(dy) <= 30) return;
      if (busy) queued = dy > 0 ? 1 : -1;
      else advance(dy > 0 ? 1 : -1);
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.altKey || e.ctrlKey || e.metaKey || el.closest("input, textarea, select, [contenteditable]")) return;
      const down = ["ArrowDown", "PageDown"].includes(e.key) || (e.key === " " && !e.shiftKey);
      const up = ["ArrowUp", "PageUp"].includes(e.key) || (e.key === " " && e.shiftKey);
      if (!down && !up) return;
      if (busy && pinned()) {
        queued = down ? 1 : -1;
        return e.preventDefault();
      }
      if (advance(down ? 1 : -1)) e.preventDefault();
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
    return () => {
      cancelAnimationFrame(raf);
      timeline.override = null;
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [sectionRef]);
}
