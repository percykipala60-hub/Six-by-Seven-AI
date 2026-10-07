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
  listeners: new Set<Listener>(),
};

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
    const read = () => {
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      timeline.target = run > 0 ? (clamp01(-r.top / run) * T.total) : 0;
    };
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      read();
      // Lissage léger : les transitions entre arrêts sont déjà adoucies ; il reste utile si on tire l'ascenseur.
      const k = reduced ? 1 : 1 - Math.exp(-dt * 12);
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
    return () => cancelAnimationFrame(raf);
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

    const geometry = () => {
      const el = sectionRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, unit: (r.height - window.innerHeight) / T.total, r };
    };
    // La visite occupe l'écran : de son début jusqu'au moment où la section suivante arrive en haut.
    const pinned = () => {
      const g = geometry();
      return !!g && g.r.top <= 1 && g.r.bottom >= -2;
    };
    const current = () => {
      const g = geometry();
      return g ? (window.scrollY - g.top) / g.unit : 0;
    };
    // Arrêt suivant (dir = 1) ou précédent (dir = -1) ; null quand il n'y en a plus.
    // Après le dernier arrêt, un dernier geste fait glisser la visite vers le haut et amène la section suivante.
    const nextStop = (dir: 1 | -1) => {
      const g = geometry();
      const u = current();
      const stops = g ? [...STOPS, g.r.height / g.unit] : STOPS;
      return dir > 0 ? (stops.find((s) => s > u + 0.02) ?? null) : ([...stops].reverse().find((s) => s < u - 0.02) ?? null);
    };

    const go = (to: number) => {
      const g = geometry();
      if (!g) return;
      const from = window.scrollY;
      const target = g.top + to * g.unit;
      const u0 = current();
      const dist = Math.abs(to - u0);
      // Les mouvements d'appareils (le cercle qui tourne, l'appareil qui s'avance, la caméra qui entre
      // dans l'écran ou en ressort) prennent leur temps ; les étapes à l'intérieur de l'appli restent vives.
      const moves = [T.phoneFront, T.phoneDive, T.phoneExit, T.laptopFront, T.laptopDive, T.laptopExit, T.outro];
      const lo = Math.min(u0, to);
      const hi = Math.max(u0, to);
      const camera = moves.some(([a, b]) => lo < b && hi > a);
      const duration = reduced ? 0 : camera ? Math.min(3400, 1500 + dist * 650) : Math.min(1400, 650 + dist * 380);
      const start = performance.now();
      busy = true;
      cancelAnimationFrame(raf);
      const step = (now: number) => {
        const t = duration ? Math.min(1, (now - start) / duration) : 1;
        window.scrollTo({ top: from + (target - from) * easeInOutSine(t), behavior: "instant" });
        if (t < 1) raf = requestAnimationFrame(step);
        else {
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

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [sectionRef]);
}
