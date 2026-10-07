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

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const range = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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
      // Lissage : la scène rattrape le défilement en douceur, comme un travelling de caméra.
      const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
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
