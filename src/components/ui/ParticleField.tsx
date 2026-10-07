import { useEffect, useRef } from "react";
import styles from "./ParticleField.module.css";

// Champ de particules, inspiré de la page d'accueil d'antigravity.google : de petits traits répartis sur
// toute la surface, qui tournent doucement autour du centre. Ils sont déjà là et ne suivent personne :
// le curseur (ou le doigt) les traverse comme de l'eau. Il entraîne les particules proches dans son
// sillage et chaque geste fait partir des vagues en cercles ; chaque particule revient ensuite à sa
// place en ondulant. Immobile si l'utilisateur préfère moins d'animations.
type Props = { theme?: "light" | "dark"; density?: number; className?: string };

const PALETTES = {
  // Bleu et blanc : bleu nuit, bleu de la marque, bleu ciel, bleu pâle, et du blanc.
  light: ["#0e1526", "#1b2540", "#2d5fe6", "#2d5fe6", "#4d7cfe", "#6b93ff", "#4fb3ec", "#7cc8f2", "#a9dcf7", "#ffffff", "#ffffff", "#ffffff"],
  dark: ["#2d5fe6", "#4d7cfe", "#6b93ff", "#8fa8ff", "#4fb3ec", "#7cc8f2", "#a9dcf7", "#dfe8ff", "#ffffff", "#ffffff"],
};

// Réglages de « l'eau ».
const WAKE_RADIUS = 160; // rayon d'entraînement autour du curseur (px)
const WAKE = 0.9; // part de la vitesse du curseur transmise aux particules derrière lui
const PART = 5; // force avec laquelle les particules devant lui s'écartent
const ATTRACT = 6; // attraction des particules derrière lui vers sa trajectoire
const CLEAR = 46; // espace libre gardé autour du curseur immobile (px)
const SPRING = 22; // force de rappel vers la place d'origine
const DAMPING = 3.2; // amortissement (plus petit = ondule plus longtemps)
const WAVE_SPEED = 520; // vitesse des vagues (px/s)
const WAVE_LIFE = 1.1; // durée de vie d'une vague (s)
const WAVE_PUSH = 260; // poussée d'une vague

export function ParticleField({ theme = "light", density = 1, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Écran tactile : moins de particules et une image sur deux, pour ménager le téléphone.
    const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const colors = PALETTES[theme];

    // Chaque particule : angle, distance au centre (en fraction du rayon), longueur, couleur, vitesse
    // de rotation, et son écart à sa place (ox, oy) avec la vitesse de cet écart (vx, vy).
    const parts = Array.from({ length: Math.round(1800 * density * (touch ? 0.33 : 1)) }, () => {
      // Répartition régulière sur toute la surface (jusque dans les coins), un peu moins au centre.
      const r = 0.12 + Math.sqrt(Math.random()) * 0.95;
      return {
        a: Math.random() * Math.PI * 2,
        r,
        len: 2 + Math.random() * 5,
        c: colors[Math.floor(Math.random() * colors.length)],
        v: (0.025 + Math.random() * 0.05) * (Math.random() < 0.85 ? 1 : -1),
        ph: Math.random() * Math.PI * 2,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
      };
    });

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    // Curseur ou doigt (NaN quand il n'y en a pas) et sa vitesse.
    const pointer = { x: NaN, y: NaN, vx: 0, vy: 0, t: 0 };
    // Vagues en cours : point de départ et heure.
    const waves: { x: number; y: number; t: number }[] = [];
    let lastWave = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(0);
    };

    const paths = new Map<string, Path2D>();
    const draw = (t: number) => {
      const dt = last ? Math.min(t - last, 0.1) : 0;
      last = t;
      const active = !Number.isNaN(pointer.x);
      // La vitesse du curseur retombe quand il s'arrête.
      const pv = Math.exp(-dt * 8);
      pointer.vx *= pv;
      pointer.vy *= pv;
      while (waves.length && t - waves[0].t > WAVE_LIFE) waves.shift();

      ctx.clearRect(0, 0, w, h);
      // Rayon : la demi-diagonale, pour couvrir toute la surface.
      const R = Math.hypot(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      const damp = Math.exp(-dt * DAMPING);
      // Un tracé par couleur (une dizaine en tout) plutôt qu'un par particule : bien plus léger.
      ctx.lineWidth = 1.4;
      for (const color of colors) paths.set(color, new Path2D());
      for (const p of parts) {
        const a = p.a + t * p.v;
        const rr = R * (p.r + Math.sin(t * 0.6 + p.ph) * 0.008);
        const bx = cx + Math.cos(a) * rr;
        const by = cy + Math.sin(a) * rr;
        let x = bx + p.ox;
        let y = by + p.oy;

        if (dt) {
          // Comme une masse qui traverse l'eau : devant le curseur, les particules s'écartent de part et
          // d'autre pour le laisser passer (la mer qui s'ouvre) ; derrière lui, elles sont attirées et
          // suivent dans son sillage. À l'arrêt, il garde juste un petit espace libre autour de lui.
          if (active) {
            const dx = x - pointer.x;
            const dy = y - pointer.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < WAKE_RADIUS * WAKE_RADIUS) {
              const d = Math.sqrt(d2) || 1;
              const f = 1 - d / WAKE_RADIUS;
              const speed = Math.hypot(pointer.vx, pointer.vy);
              if (speed > 40) {
                const nx = pointer.vx / speed;
                const ny = pointer.vy / speed;
                const along = dx * nx + dy * ny; // > 0 : devant, < 0 : derrière
                if (along > 0) {
                  // Devant : poussée sur le côté, perpendiculaire au mouvement.
                  let sx = dx - along * nx;
                  let sy = dy - along * ny;
                  let sl = Math.hypot(sx, sy);
                  if (sl < 0.5) {
                    sx = -ny;
                    sy = nx;
                    sl = 1;
                  }
                  const push = f * f * speed * PART * dt;
                  p.vx += (sx / sl) * push;
                  p.vy += (sy / sl) * push;
                } else {
                  // Derrière : entraînées dans le mouvement et attirées vers sa trajectoire.
                  const pull = f * f * WAKE * dt * 9;
                  p.vx += pointer.vx * pull - dx * f * ATTRACT * dt;
                  p.vy += pointer.vy * pull - dy * f * ATTRACT * dt;
                }
              } else if (d < CLEAR) {
                const push = (1 - d / CLEAR) * 900 * dt;
                p.vx += (dx / d) * push;
                p.vy += (dy / d) * push;
              }
            }
          }
          // Vagues : un anneau qui s'élargit pousse les particules qu'il traverse.
          for (const wv of waves) {
            const age = t - wv.t;
            const front = age * WAVE_SPEED;
            const dx = x - wv.x;
            const dy = y - wv.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const band = 1 - Math.abs(d - front) / 40;
            if (band > 0) {
              const push = band * WAVE_PUSH * (1 - age / WAVE_LIFE) * dt;
              p.vx += (dx / d) * push;
              p.vy += (dy / d) * push;
            }
          }
          // Rappel vers sa place, amorti : la particule revient en ondulant.
          p.vx = (p.vx - p.ox * SPRING * dt) * damp;
          p.vy = (p.vy - p.oy * SPRING * dt) * damp;
          p.ox += p.vx * dt;
          p.oy += p.vy * dt;
          x = bx + p.ox;
          y = by + p.oy;
        }

        // Trait orienté vers le centre, comme une limaille autour d'un aimant.
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const path = paths.get(p.c)!;
        path.moveTo(x, y);
        path.lineTo(x + ux * p.len, y + uy * p.len);
      }
      for (const [color, path] of paths) {
        ctx.strokeStyle = color;
        ctx.stroke(path);
      }
    };

    let frame = 0;
    const loop = (now: number) => {
      frame++;
      if (visible && (!touch || frame % 2 === 0)) draw(now / 1000);
      raf = requestAnimationFrame(loop);
    };

    const wave = (x: number, y: number) => {
      const now = performance.now() / 1000;
      if (now - lastWave < 0.14) return;
      lastWave = now;
      waves.push({ x, y, t: now });
      if (waves.length > 6) waves.shift();
    };
    const place = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      const x = e.clientX - b.left;
      const y = e.clientY - b.top;
      const now = performance.now() / 1000;
      if (!Number.isNaN(pointer.x)) {
        const dt = Math.max(now - pointer.t, 0.008);
        // Vitesse lissée du curseur (px/s), limitée pour éviter les à-coups.
        const clamp = (v: number) => Math.max(-2500, Math.min(2500, v));
        pointer.vx = pointer.vx * 0.5 + clamp((x - pointer.x) / dt) * 0.5;
        pointer.vy = pointer.vy * 0.5 + clamp((y - pointer.y) / dt) * 0.5;
        if (Math.hypot(pointer.vx, pointer.vy) > 500) wave(x, y);
      }
      pointer.x = x;
      pointer.y = y;
      pointer.t = now;
    };
    // Souris : agit en permanence. Doigt : agit tant qu'il touche l'écran.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.buttons || e.pressure > 0) place(e);
    };
    const onDown = (e: PointerEvent) => {
      place(e);
      wave(pointer.x, pointer.y);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") pointer.x = pointer.y = NaN;
    };
    const onLeave = () => {
      pointer.x = pointer.y = NaN;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(canvas);
    resize();
    if (!reduce) {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [theme, density]);

  return <canvas ref={ref} className={`${styles.field} ${className ?? ""}`} aria-hidden="true" />;
}
