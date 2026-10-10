import { useEffect, useRef } from "react";
import { chameleonAt, css, mix, rgba, type Rgb } from "../../theme/chameleon";
import styles from "./WaveField.module.css";

// Fond animé dans l'esprit du thème de base de la PS4 : des rubans bleus faits de fines lignes
// translucides, qui ondulent lentement comme un tissu ou de l'eau. Chaque ligne est une somme de
// sinusoïdes qui glissent dans le temps ; les lignes d'un même ruban sont légèrement décalées, ce qui
// donne ce relief de voile. Le curseur (ou le doigt posé) soulève le voile : les lignes proches
// s'écartent, puis reviennent en place. Immobile si l'utilisateur préfère moins d'animations.
// Couleurs : celles du thème caméléon (theme/chameleon.ts). Le fond du site est peint ici : chaque nouvelle
// ambiance le traverse de gauche à droite comme une vague, et les rubans changent de teinte à son passage.
type Props = { theme?: "light" | "dark"; className?: string; fixed?: boolean };

type Ribbon = {
  y: number; // hauteur de base (fraction de la hauteur)
  amp: number; // ampleur (fraction de la hauteur)
  k: number; // fréquence le long de la largeur
  speed: number;
  phase: number;
  spread: number; // écart entre la première et la dernière ligne (fraction de la hauteur)
  color: number; // teinte du ruban dans l'ambiance du moment (voir MOODS)
};

const RIBBONS: Record<"light" | "dark", Ribbon[]> = {
  // Sur le fond clair : assez transparents pour rester derrière le contenu.
  light: [
    { y: 0.62, amp: 0.1, k: 1.3, speed: 0.22, phase: 0, spread: 0.16, color: 0 },
    { y: 0.74, amp: 0.08, k: 1.8, speed: -0.16, phase: 2.1, spread: 0.12, color: 1 },
    { y: 0.45, amp: 0.12, k: 1.0, speed: 0.12, phase: 4.2, spread: 0.2, color: 2 },
    { y: 0.22, amp: 0.09, k: 1.5, speed: -0.2, phase: 5.3, spread: 0.14, color: 3 },
    { y: 0.86, amp: 0.06, k: 2.2, speed: 0.28, phase: 1.3, spread: 0.08, color: 4 },
  ],
  // Sur le bleu nuit : des teintes plus claires qui s'additionnent, comme une lueur.
  dark: [
    { y: 0.58, amp: 0.1, k: 1.3, speed: 0.22, phase: 0, spread: 0.16, color: 0 },
    { y: 0.72, amp: 0.08, k: 1.8, speed: -0.16, phase: 2.1, spread: 0.12, color: 1 },
    { y: 0.4, amp: 0.12, k: 1.0, speed: 0.12, phase: 4.2, spread: 0.2, color: 2 },
    { y: 0.2, amp: 0.09, k: 1.5, speed: -0.2, phase: 5.3, spread: 0.14, color: 3 },
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
    const motes = Array.from({ length: touch ? 24 : 60 }, () => ({
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
      // Moins d'animations demandées : les vagues restent figées, seules les couleurs évoluent.
      const dt = last && !reduce ? Math.min(now - last, 0.05) : 0;
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

      // Couleurs du moment. Pendant un passage, la nouvelle ambiance traverse l'écran de gauche à droite
      // comme une vague : un front ondulé, au bord large et fondu, précédé d'une crête de lumière. Le front est
      // calculé dans le repère de la fenêtre : le fond du site et le panneau sombre le voient passer ensemble.
      const { from, to, p } = chameleonAt();
      const box = fixed ? { left: 0, top: 0 } : canvas.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const amp = Math.min(vw, vh) * 0.05; // ampleur des ondulations du front
      const feather = Math.max(vw * 0.55, 320); // largeur du fondu entre les deux couleurs
      // Position du front : entièrement à gauche de l'écran au début, entièrement à droite à la fin.
      const front = -(feather / 2 + amp) + p * (vw + feather + 2 * amp) - box.left;
      const swell = (y: number) => {
        const v = (y + box.top) / vh;
        return amp * (0.7 * Math.sin(v * Math.PI * 2.4 + t * 0.9) + 0.3 * Math.sin(v * Math.PI - t * 0.6));
      };
      const palette = dark ? "dark" : "light";
      const paint = (a: Rgb, b: Rgb) => {
        if (p <= 0) return css(a);
        const g = ctx.createLinearGradient(front - feather / 2, 0, front + feather / 2, 0);
        g.addColorStop(0, css(b));
        g.addColorStop(1, css(a));
        return g;
      };
      // Bords successifs du fondu (0 : côté nouvelle couleur, BANDS : tout devant), tous ondulés de la même
      // façon pour ne jamais se croiser.
      const BANDS = 12;
      const YS = touch ? 32 : 24;
      const edge = (k: number, y: number) => front + feather * (k / BANDS - 0.5) + swell(y);
      const trace = (k: number, down: boolean) => {
        for (let i = 0; i <= Math.ceil(h / YS) + 1; i++) {
          const y = down ? (i - 1) * YS : (Math.ceil(h / YS) - i) * YS;
          ctx.lineTo(edge(k, y), y);
        }
      };

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (fixed) {
        ctx.fillStyle = css(from.bg);
        ctx.fillRect(0, 0, w, h);
        if (p > 0) {
          // Nouvelle couleur derrière le front, puis des bandes de couleurs intermédiaires : chaque point
          // n'est peint qu'une fois (pas de superpositions transparentes, plus coûteuses).
          ctx.fillStyle = css(to.bg);
          ctx.beginPath();
          ctx.moveTo(-1, -YS);
          trace(0, true);
          ctx.lineTo(-1, h + YS);
          ctx.fill();
          for (let k = 0; k < BANDS; k++) {
            ctx.fillStyle = css(mix(to.bg, from.bg, (k + 1) / (BANDS + 1)));
            ctx.beginPath();
            ctx.moveTo(edge(k, -YS), -YS);
            trace(k, true);
            trace(k + 1, false);
            ctx.fill();
          }
        }
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      // Crête de lumière à l'avant de la vague, qui s'efface au début et à la fin du passage.
      if (p > 0 && p < 1) {
        const glow = Math.sin(Math.PI * p);
        ctx.strokeStyle = "#ffffff";
        for (const [width, alpha] of [[28, 0.05], [1.5, 0.14]]) {
          ctx.lineWidth = width;
          ctx.globalAlpha = alpha * glow * (dark ? 0.6 : 1);
          ctx.beginPath();
          ctx.moveTo(edge(BANDS, -YS), -YS);
          trace(BANDS, true);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";

      // Aurore boréale : trois grandes lueurs étirées en hauteur, comme des rideaux de lumière, qui dérivent
      // lentement dans le haut de l'écran et respirent. De simples dégradés : aucun flou à calculer.
      for (let i = 0; i < 3; i++) {
        const c = mix(from.aurora[i], to.aurora[i], p);
        const cx = (0.18 + i * 0.32 + Math.sin(t * 0.045 + i * 2.1) * 0.12) * w;
        const cy = (0.2 + Math.sin(t * 0.06 + i * 1.3) * 0.08) * h;
        const ry = h * 0.55;
        const rx = Math.max(w * 0.2, 160);
        const glow = 0.2 * (0.7 + 0.3 * Math.sin(t * 0.25 + i * 1.7));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.sin(t * 0.04 + i) * 0.35);
        ctx.scale(rx / ry, 1);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
        g.addColorStop(0, rgba(c, glow));
        g.addColorStop(0.45, rgba(c, glow * 0.45));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(-ry, -ry, ry * 2, ry * 2);
        ctx.restore();
      }
      ctx.lineWidth = 1;

      for (const rb of ribbons) {
        ctx.strokeStyle = paint(from[palette][rb.color], to[palette][rb.color]);
        // Le ruban entier se déplace lentement dans tous les sens : il monte, descend et s'incline
        // (jusqu'en haut de l'écran), sans jamais repasser deux fois par le même chemin.
        const rise = Math.sin(t * 0.07 + rb.phase) * 0.18 + Math.sin(t * 0.031 + rb.phase * 2.3) * 0.12;
        const tilt = Math.sin(t * 0.05 + rb.phase * 1.4) * 0.35;
        for (let i = 0; i < LINES; i++) {
          const f = i / (LINES - 1); // position de la ligne dans le ruban (0 → 1)
          // Les lignes du milieu sont les plus visibles : le ruban a l'air d'avoir du volume.
          ctx.globalAlpha = 0.16 * Math.sin(Math.PI * (0.15 + f * 0.7));
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

      // Points lumineux : des étoiles, blanches dans la plupart des ambiances.
      ctx.globalAlpha = 1;
      const moteColor: Rgb = dark ? [200, 220, 255] : mix(from.star, to.star, p);
      for (const m of motes) {
        // Les points sortent par la droite et reviennent par la gauche en fondu (pas d'apparition brusque).
        const px = (m.x + t * m.v) % 1;
        const x = px * w;
        const edge = Math.min(1, px / 0.08, (1 - px) / 0.08);
        const y = (m.y + Math.sin(t * 0.4 + m.ph) * 0.02) * h;
        const a = (dark ? 0.5 : 0.35) * (0.5 + 0.5 * Math.sin(t * 0.8 + m.ph)) * edge;
        ctx.fillStyle = rgba(moteColor, dark ? a : a * 1.6);
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
    // 30 images par seconde suffisent à des rubans aussi lents (l'œil n'y voit aucune différence), quel que
    // soit l'écran (60, 120 ou 144 Hz). Sur ordinateur, pendant que le curseur soulève le voile et le temps
    // qu'il retombe, on dessine à chaque image pour que la réaction reste parfaitement fluide.
    const IDLE_MS = 1000 / 30;
    let lastDraw = -Infinity;
    let movedAt = -Infinity;
    const loop = (now: number) => {
      const interval = !touch && now - movedAt < 1500 ? 0 : IDLE_MS;
      if (visible && now - lastDraw >= interval - 4 && (!touch || now > scrollingUntil)) {
        draw(now / 1000);
        lastDraw = now;
      }
      // Hors de l'écran : plus aucune image demandée ; la boucle repart quand les vagues reviennent.
      raf = visible ? requestAnimationFrame(loop) : 0;
    };

    const place = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      pointer.x = e.clientX - b.left;
      pointer.y = e.clientY - b.top;
      movedAt = performance.now();
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
      movedAt = performance.now(); // le voile retombe en douceur
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf && !reduce) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);
    resize();
    const still = reduce ? window.setInterval(() => visible && draw(performance.now() / 1000), 500) : 0;
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
      window.clearInterval(still);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", place);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [theme, fixed]);

  return <canvas ref={ref} className={[styles.field, fixed && styles.fixed, className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
