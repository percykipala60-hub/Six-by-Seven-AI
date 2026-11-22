import { useEffect, useRef } from "react";
import { chameleonAt, css, mix, type Rgb } from "../../theme/chameleon";
import { isLiteDevice } from "../../lite";
import styles from "./WaveField.module.css";

// Fond animé, le même que dans l'application Six : une vague faite de quelques voiles transparents
// superposés, chacun avec un bord lumineux, qui traverse l'écran en biais et tourne très lentement.
// Léger : cinq tracés par image, aucune réaction au curseur, au plus une soixantaine d'images par seconde,
// dessiné en pixels d'écran. Immobile si l'utilisateur préfère moins d'animations ou sur un appareil modeste.
// Couleurs : celles du thème caméléon (theme/chameleon.ts), mélangées d'une ambiance à l'autre.
type Props = { theme?: "light" | "dark"; className?: string; fixed?: boolean };

const VAGUE = { amplitude: 0.1, longueur: 1.25, vitesse: 0.12 };
const BIAIS = { milieu: -0.75, ecart: 0.55, vitesse: 0.045 };
const VOILES = [
  { decalage: 0, hauteur: -0.03, epaisseur: 0.07, ampleur: 1, derive: 0 },
  { decalage: 0.35, hauteur: -0.012, epaisseur: 0.05, ampleur: 0.92, derive: 0.7 },
  { decalage: 0.7, hauteur: 0.004, epaisseur: 0.085, ampleur: 1.08, derive: 1.5 },
  { decalage: 1.1, hauteur: 0.02, epaisseur: 0.045, ampleur: 0.85, derive: 2.3 },
  { decalage: 1.5, hauteur: 0.034, epaisseur: 0.065, ampleur: 1.15, derive: 3.1 },
];
const IMAGE_MS = 15;

const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

// `fixed` : fond de tout le site, collé à la fenêtre derrière le contenu (il peint aussi la couleur du fond).
export function WaveField({ theme = "light", className, fixed = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const immobile = isLiteDevice() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sombre = theme === "dark";
    const force = sombre ? { corps: 0.1, bord: 0.5, halo: 0.12 } : { corps: 0.09, bord: 0.4, halo: 0.08 };
    let largeur = 0;
    let hauteur = 0;
    let image = 0;
    let derniere = 0;
    let horloge = 0;

    const redimensionner = () => {
      const l = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (l === largeur && h === hauteur) return;
      largeur = l;
      hauteur = h;
      canvas.width = l;
      canvas.height = h;
    };

    const tracer = (points: [number, number][]) =>
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));

    const dessiner = (temps: number) => {
      if (!largeur || !hauteur) return;
      const secondes = temps / 1000;
      const { from, to, p } = chameleonAt();
      const palette = sombre ? "dark" : "light";
      const teinte = mix(from[palette][0], to[palette][0], p);
      ctx.clearRect(0, 0, largeur, hauteur);
      if (fixed) {
        ctx.fillStyle = css(mix(from.bg, to.bg, p));
        ctx.fillRect(0, 0, largeur, hauteur);
      }
      const echelle = Math.max(largeur, hauteur);
      const portee = Math.hypot(largeur, hauteur) / 2 + echelle * 0.15;
      const pas = Math.max(8, portee / 60);
      const phase = secondes * VAGUE.vitesse;
      ctx.save();
      ctx.translate(largeur / 2, hauteur / 2 + hauteur * 0.06);
      ctx.rotate(BIAIS.milieu + BIAIS.ecart * Math.sin(secondes * BIAIS.vitesse));
      ctx.lineJoin = "round";
      for (const voile of VOILES) {
        const haut: [number, number][] = [];
        const bas: [number, number][] = [];
        let min = Infinity;
        let max = -Infinity;
        for (let x = -portee; x <= portee + pas; x += pas) {
          const u = x / (echelle * VAGUE.longueur);
          const centre =
            echelle * voile.hauteur +
            echelle * VAGUE.amplitude * voile.ampleur *
              Math.sin(u * Math.PI * 2 + 0.6 + voile.decalage * 0.25 + phase * 2);
          const epais =
            echelle * voile.epaisseur *
            (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(u * Math.PI * 1.6 + voile.derive + phase * 2.6)));
          haut.push([x, centre]);
          bas.push([x, centre + epais]);
          min = Math.min(min, centre);
          max = Math.max(max, centre + epais);
        }
        const corps = ctx.createLinearGradient(0, min, 0, max);
        corps.addColorStop(0, rgba(teinte, force.corps));
        corps.addColorStop(1, rgba(teinte, 0));
        ctx.beginPath();
        tracer(haut);
        for (let i = bas.length - 1; i >= 0; i -= 1) ctx.lineTo(bas[i][0], bas[i][1]);
        ctx.closePath();
        ctx.fillStyle = corps;
        ctx.fill();
        ctx.beginPath();
        tracer(haut);
        ctx.strokeStyle = rgba(teinte, force.halo);
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = rgba(teinte, force.bord);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      ctx.restore();
    };

    const boucle = (temps: number) => {
      image = requestAnimationFrame(boucle);
      const ecoule = temps - derniere;
      if (ecoule < IMAGE_MS) return;
      derniere = temps;
      horloge += Math.min(ecoule, 50);
      dessiner(horloge);
    };

    redimensionner();
    dessiner(horloge);
    if (!immobile) image = requestAnimationFrame(boucle);
    const surRedimension = () => {
      redimensionner();
      dessiner(horloge);
    };
    window.addEventListener("resize", surRedimension);
    return () => {
      cancelAnimationFrame(image);
      window.removeEventListener("resize", surRedimension);
    };
  }, [theme, fixed]);

  return <canvas ref={ref} className={[styles.field, fixed && styles.fixed, className].filter(Boolean).join(" ")} aria-hidden="true" />;
}
