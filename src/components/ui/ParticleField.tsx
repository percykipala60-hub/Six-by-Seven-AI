import { useEffect, useRef } from "react";
import styles from "./ParticleField.module.css";

// Champ de particules en anneau, inspiré de la page d'accueil d'antigravity.google :
// de petits traits qui tournent lentement autour d'un vide central (là où se trouve le texte)
// et s'écartent un peu du pointeur. Immobile si l'utilisateur préfère moins d'animations.
type Props = { theme?: "light" | "dark"; density?: number; className?: string };

const PALETTES = {
  // Surtout du gris, quelques touches aux couleurs de la marque et des messageries.
  light: ["#c5cbd8", "#c5cbd8", "#c5cbd8", "#c5cbd8", "#4d7cfe", "#2d5fe6", "#7c5cf0", "#e8a33d", "#e5484d", "#25d366"],
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
    const colors = PALETTES[theme];

    // Chaque particule : angle, distance au centre (en fraction du rayon), longueur, couleur, vitesse.
    const parts = Array.from({ length: Math.round(520 * density) }, () => {
      // Densité plus forte sur l'anneau, presque rien au centre.
      const u = Math.random();
      const r = 0.6 + Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 1.6) * 0.5;
      return {
        a: Math.random() * Math.PI * 2,
        r: Math.max(0.36, r),
        len: 1.5 + Math.random() * 4.5,
        c: colors[Math.floor(Math.random() * colors.length)],
        v: (0.012 + Math.random() * 0.02) * (Math.random() < 0.85 ? 1 : -1),
        ph: Math.random() * Math.PI * 2,
      };
    });

    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    const pointer = { x: -9999, y: -9999 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduce) draw(0);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.max(w, h) * 0.5;
      for (const p of parts) {
        const a = p.a + t * p.v;
        const rr = R * (p.r + Math.sin(t * 0.6 + p.ph) * 0.008);
        let x = cx + Math.cos(a) * rr;
        let y = cy + Math.sin(a) * rr * 0.72;
        // Le pointeur repousse doucement les particules proches.
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22000) {
          const f = (1 - d2 / 22000) * 18;
          const d = Math.sqrt(d2) || 1;
          x += (dx / d) * f;
          y += (dy / d) * f;
        }
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

    const loop = (now: number) => {
      if (visible) draw(now / 1000);
      raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();
      pointer.x = e.clientX - b.left;
      pointer.y = e.clientY - b.top;
    };
    const onLeave = () => {
      pointer.x = pointer.y = -9999;
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
