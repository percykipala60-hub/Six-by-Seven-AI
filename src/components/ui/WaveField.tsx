import { useEffect, useRef } from "react";
import styles from "./WaveField.module.css";

// Fond animé dans l'esprit du thème de base de la PS4 : des rubans bleus faits de fines lignes
// translucides, qui ondulent lentement comme un tissu ou de l'eau. Chaque ligne est une somme de
// sinusoïdes qui glissent dans le temps ; les lignes d'un même ruban sont légèrement décalées, ce qui
// donne ce relief de voile. Le curseur (ou le doigt posé) soulève le voile : les lignes proches
// s'écartent, puis reviennent en place. Immobile si l'utilisateur préfère moins d'animations.
type Props = { theme?: "light" | "dark"; className?: string; fixed?: boolean };

type Ribbon = {
  y: number; // hauteur de base (fraction de la hauteur)
  amp: number; // ampleur (fraction de la hauteur)
  k: number; // fréquence le long de la largeur
  speed: number;
  phase: number;
  spread: number; // écart entre la première et la dernière ligne (fraction de la hauteur)
  color: string;
};

const RIBBONS: Record<"light" | "dark", Ribbon[]> = {
  // Sur le fond sable : bleus de la marque, assez transparents pour rester derrière le contenu.
  light: [
    { y: 0.62, amp: 0.1, k: 1.3, speed: 0.22, phase: 0, spread: 0.16, color: "45, 95, 230" },
    { y: 0.74, amp: 0.08, k: 1.8, speed: -0.16, phase: 2.1, spread: 0.12, color: "79, 179, 236" },
    { y: 0.45, amp: 0.12, k: 1.0, speed: 0.12, phase: 4.2, spread: 0.2, color: "107, 147, 255" },
    { y: 0.22, amp: 0.09, k: 1.5, speed: -0.2, phase: 5.3, spread: 0.14, color: "79, 179, 236" },
    { y: 0.86, amp: 0.06, k: 2.2, speed: 0.28, phase: 1.3, spread: 0.08, color: "14, 21, 38" },
  ],
  // Sur le bleu nuit : des bleus plus clairs qui s'additionnent, comme une lueur.
  dark: [
    { y: 0.58, amp: 0.1, k: 1.3, speed: 0.22, phase: 0, spread: 0.16, color: "77, 124, 254" },
    { y: 0.72, amp: 0.08, k: 1.8, speed: -0.16, phase: 2.1, spread: 0.12, color: "124, 200, 242" },
    { y: 0.4, amp: 0.12, k: 1.0, speed: 0.12, phase: 4.2, spread: 0.2, color: "143, 168, 255" },
    { y: 0.2, amp: 0.09, k: 1.5, speed: -0.2, phase: 5.3, spread: 0.14, color: "124, 200, 242" },
  ],
};

// `fixed` : fond de tout le site, collé à la fenêtre derrière le contenu.
export function WaveField({ theme = "light", className, fixed = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Écran tactile : moins de lignes et de points, une image sur deux.
    const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    // Téléphone : un ruban de moins et moins de lignes par ruban.
    const ribbons = touch ? RIBBONS[theme].slice(0, 3) : RIBBONS[theme];
    const LINES = touch ? 8 : 18;
    const STEP = touch ? 18 : 12; // pas horizontal du tracé (px)
    const dark = theme === "dark";

    // Petits points lumineux qui flottent, comme dans le thème de la console.
    const motes = Array.from({ length: touch ? 18 : 40 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.8,
      v: 0.004 + Math.random() * 0.01,
      ph: Math.random() * Math.PI * 2,
    }));

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    // Curseur ou doigt (NaN sans), et son influence lissée (0 → 1) pour que le voile se soulève en douceur.
    const pointer = { x: NaN, y: NaN };
    const lift = { x: 0, y: 0, k: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(0);
    };

    // Horloge propre aux vagues : elle n'avance que lorsqu'on les dessine. Avant, l'heure réelle continuait
    // de tourner pendant les pauses (défilement sur téléphone, vagues hors de l'écran) et, à la reprise,
    // les rubans sautaient d'un coup à une autre position.
    let last = 0;
    let clock = 0;
    const draw = (now: number) => {
      const dt = last ? Math.min(now - last, 0.05) : 0;
      last = now;
      clock += dt;
      const t = clock;
      const active = !Number.isNaN(pointer.x);
      // Le point soulevé suit le curseur avec un peu de retard, et retombe quand il s'en va.
      const kk = 1 - Math.exp(-dt * 6);
      if (active) {
        lift.x += (pointer.x - lift.x) * (lift.k < 0.01 ? 1 : kk);
        lift.y += (pointer.y - lift.y) * (lift.k < 0.01 ? 1 : kk);
      }
      lift.k += ((active ? 1 : 0) - lift.k) * (1 - Math.exp(-dt * 3));
      const sigma = Math.min(w, h) * 0.18;
      const push = Math.min(w, h) * 0.07 * lift.k;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      ctx.lineWidth = 1;

      for (const rb of ribbons) {
        // Le ruban entier se déplace lentement dans tous les sens : il monte, descend et s'incline
        // (jusqu'en haut de l'écran), sans jamais repasser deux fois par le même chemin.
        const rise = Math.sin(t * 0.07 + rb.phase) * 0.18 + Math.sin(t * 0.031 + rb.phase * 2.3) * 0.12;
        const tilt = Math.sin(t * 0.05 + rb.phase * 1.4) * 0.35;
        for (let i = 0; i < LINES; i++) {
          const f = i / (LINES - 1); // position de la ligne dans le ruban (0 → 1)
          // Les lignes du milieu sont les plus visibles : le ruban a l'air d'avoir du volume.
          const alpha = (dark ? 0.16 : 0.13) * Math.sin(Math.PI * (0.15 + f * 0.7));
          ctx.strokeStyle = `rgba(${rb.color}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          for (let x = -STEP; x <= w + STEP; x += STEP) {
            const u = x / w;
            const base =
              rb.y +
              rise +
              tilt * (u - 0.5) +
              Math.sin(u * Math.PI * 2 * rb.k + t * rb.speed + rb.phase) * rb.amp +
              Math.sin(u * Math.PI * 2 * rb.k * 0.53 - t * rb.speed * 0.7 + rb.phase * 1.7 + f * 1.4) * rb.amp * 0.6 +
              (f - 0.5) * rb.spread * (0.6 + 0.4 * Math.sin(u * 5 + t * 0.3 + rb.phase));
            let y = base * h;
            // Voile soulevé autour du curseur : les lignes s'écartent de part et d'autre de lui, en
            // douceur. tanh rend le passage progressif d'un côté à l'autre (pas de marche à angle droit).
            if (lift.k > 0.001) {
              const dx = x - lift.x;
              const dy = y - lift.y;
              const g = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
              y += Math.tanh(dy / (sigma * 0.45)) * push * g * 1.6;
            }
            if (x === -STEP) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Points lumineux.
      for (const m of motes) {
        // Les points sortent par la droite et reviennent par la gauche en fondu (pas d'apparition brusque).
        const px = (m.x + t * m.v) % 1;
        const x = px * w;
        const edge = Math.min(1, px / 0.08, (1 - px) / 0.08);
        const y = (m.y + Math.sin(t * 0.4 + m.ph) * 0.02) * h;
        const a = (dark ? 0.5 : 0.35) * (0.5 + 0.5 * Math.sin(t * 0.8 + m.ph)) * edge;
        ctx.fillStyle = dark ? `rgba(200, 220, 255, ${a.toFixed(3)})` : `rgba(45, 95, 230, ${(a * 0.6).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    // Téléphone : les vagues s'arrêtent pendant le défilement (redessiner un fond plein écran pendant que
    // la page défile oblige le navigateur à tout recomposer, d'où des saccades) et reprennent juste après.
    let scrollingUntil = 0;
    const onScroll = () => (scrollingUntil = performance.now() + 180);
    if (touch) window.addEventListener("scroll", onScroll, { passive: true });
    let frame = 0;
    const loop = (now: number) => {
      frame++;
      if (visible && (!touch || (frame % 2 === 0 && now > scrollingUntil))) draw(now / 1000);
      raf = requestAnimationFrame(loop);
    };

    const place = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      pointer.x = e.clientX - b.left;
      pointer.y = e.clientY - b.top;
    };
    // Souris : agit en permanence. Doigt : agit tant qu'il touche l'écran.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.buttons || e.pressure > 0) place(e);
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
      window.addEventListener("pointerdown", place, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", place);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [theme]);

  return <canvas ref={ref} className={[styles.field, fixed && styles.fixed, className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
