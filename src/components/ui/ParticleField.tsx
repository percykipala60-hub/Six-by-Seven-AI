import { useEffect, useRef } from "react";
import styles from "./ParticleField.module.css";

// Champ de particules en anneau, inspiré de la page d'accueil d'antigravity.google :
// de petits traits qui tournent autour d'un vide central. L'anneau suit le curseur (les particules
// proches du centre le rattrapent plus vite que celles du bord, ce qui forme une traîne) et, quand
// le curseur s'arrête, continue de tourner autour de lui. Immobile si l'utilisateur préfère moins d'animations.
type Props = { theme?: "light" | "dark"; density?: number; className?: string };

const PALETTES = {
  // Surtout du sable foncé, quelques touches aux couleurs de la marque et des messageries.
  light: ["#cbbca4", "#cbbca4", "#bfae94", "#d2c5b0", "#4d7cfe", "#2d5fe6", "#7c5cf0", "#e8a33d", "#e5484d", "#25d366"],
  dark: ["#2c3753", "#2c3753", "#3b4a70", "#4d7cfe", "#6b93ff", "#8fa8ff", "#7c5cf0"],
};

export function ParticleField({ theme = "light", density = 1, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Écran tactile : l'anneau reste au centre (il ne suit pas le doigt), avec moins de particules
    // et une image sur deux, pour ménager le téléphone.
    const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const colors = PALETTES[theme];

    // Chaque particule : angle, distance au centre (en fraction du rayon), longueur, couleur, vitesse.
    const parts = Array.from({ length: Math.round(520 * density * (touch ? 0.45 : 1)) }, () => {
      // Densité plus forte sur l'anneau, presque rien au centre.
      const u = Math.random();
      const r = 0.6 + Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 1.6) * 0.5;
      return {
        a: Math.random() * Math.PI * 2,
        r: Math.max(0.36, r),
        len: 1.5 + Math.random() * 4.5,
        c: colors[Math.floor(Math.random() * colors.length)],
        v: (0.07 + Math.random() * 0.1) * (Math.random() < 0.85 ? 1 : -1),
        ph: Math.random() * Math.PI * 2,
      };
    });

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    // Position du curseur, et deux centres qui le rattrapent, l'un vite (intérieur de l'anneau), l'autre lentement (bord).
    const pointer = { x: NaN, y: NaN };
    const fast = { x: 0, y: 0 };
    const slow = { x: 0, y: 0 };
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!last) {
        fast.x = slow.x = w / 2;
        fast.y = slow.y = h / 2;
      }
      if (reduce) draw(0);
    };

    const draw = (t: number) => {
      const dt = last ? Math.min(t - last, 0.1) : 0;
      last = t;
      // Sans curseur (écran tactile, curseur hors de la zone), l'anneau revient au centre.
      const tx = Number.isNaN(pointer.x) ? w / 2 : pointer.x;
      const ty = Number.isNaN(pointer.y) ? h / 2 : pointer.y;
      const kf = 1 - Math.exp(-dt * 7);
      const ks = 1 - Math.exp(-dt * 2.5);
      fast.x += (tx - fast.x) * kf;
      fast.y += (ty - fast.y) * kf;
      slow.x += (tx - slow.x) * ks;
      slow.y += (ty - slow.y) * ks;

      ctx.clearRect(0, 0, w, h);
      const R = Math.min(Math.max(w, h) * 0.34, 460);
      for (const p of parts) {
        const a = p.a + t * p.v;
        const rr = R * (p.r + Math.sin(t * 0.6 + p.ph) * 0.008);
        // Centre propre à la particule : entre le centre rapide et le centre lent, selon sa distance.
        const k = Math.min(1, Math.max(0, (p.r - 0.36) / 0.7));
        const cx = fast.x + (slow.x - fast.x) * k;
        const cy = fast.y + (slow.y - fast.y) * k;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.72;
        // Trait orienté vers le centre, comme une limaille autour d'un aimant.
        const ux = Math.cos(a);
        const uy = Math.sin(a) * 0.72;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + ux * p.len, y + uy * p.len);
        ctx.stroke();
      }
    };

    let frame = 0;
    const loop = (now: number) => {
      frame++;
      if (visible && (!touch || frame % 2 === 0)) draw(now / 1000);
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const b = canvas.getBoundingClientRect();
      pointer.x = e.clientX - b.left;
      pointer.y = e.clientY - b.top;
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
      document.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [theme, density]);

  return <canvas ref={ref} className={`${styles.field} ${className ?? ""}`} aria-hidden="true" />;
}
