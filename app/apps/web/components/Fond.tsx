'use client';

import { useEffect, useRef } from 'react';
import { mouvementReduit } from '@/lib/accessibilite';

/**
 * Fond animé de Six, choisi dans Réglages > Thème (attribut data-fond de la page) :
 * - vagues : une vague faite de voiles transparents à bord lumineux, en biais, qui tourne lentement ;
 * - aurore : de grandes lueurs douces qui dérivent ;
 * - points : de petits points qui montent lentement ;
 * - uni : aucun dessin, la couleur du thème seule.
 * Toujours aux couleurs du thème, immobile quand le téléphone demande moins d'animations.
 */
export type FondId = 'vagues' | 'aurore' | 'points' | 'uni';
export const FONDS: { id: FondId; label: string }[] = [
  { id: 'vagues', label: 'Vagues' },
  { id: 'aurore', label: 'Aurore' },
  { id: 'points', label: 'Points' },
  { id: 'uni', label: 'Uni' },
];
export const FOND_DEFAUT: FondId = 'vagues';

export function fondValide(x: string | null | undefined): FondId {
  return FONDS.some((f) => f.id === x) ? (x as FondId) : FOND_DEFAUT;
}

// Au plus une soixantaine d'images par seconde, même sur les écrans plus rapides.
const IMAGE_MS = 15;

/** Couleur d'une variable CSS du thème, en « r, g, b » (le navigateur la calcule, quel que soit son format). */
function rgb(nom: string): string {
  const sonde = document.createElement('i');
  sonde.style.color = `var(${nom})`;
  sonde.style.display = 'none';
  document.body.appendChild(sonde);
  const valeur = getComputedStyle(sonde).color;
  sonde.remove();
  const m = valeur.match(/[\d.]+/g);
  return m ? m.slice(0, 3).join(', ') : '120, 150, 230';
}

type Teinte = { rgb: string; rgb2: string; clair: boolean };

/** Teintes du dessin : la couleur du thème, et une seconde plus douce pour les fonds à plusieurs lueurs. */
function lireTeinte(): Teinte {
  const fond = rgb('--bg').split(', ').map(Number);
  const clair = (fond[0] * 299 + fond[1] * 587 + fond[2] * 114) / 1000 > 140;
  return { rgb: rgb(clair ? '--accent-b' : '--brand'), rgb2: rgb('--accent-a'), clair };
}

type Peintre = (
  ctx: CanvasRenderingContext2D,
  l: number,
  h: number,
  secondes: number,
  t: Teinte,
) => void;

/* ---------- Vagues ---------- */
const VAGUE = { amplitude: 0.1, longueur: 1.25, vitesse: 0.12 };
const BIAIS = { milieu: -0.75, ecart: 0.55, vitesse: 0.045 };
const VOILES = [
  { decalage: 0, hauteur: -0.03, epaisseur: 0.07, ampleur: 1, derive: 0 },
  { decalage: 0.35, hauteur: -0.012, epaisseur: 0.05, ampleur: 0.92, derive: 0.7 },
  { decalage: 0.7, hauteur: 0.004, epaisseur: 0.085, ampleur: 1.08, derive: 1.5 },
  { decalage: 1.1, hauteur: 0.02, epaisseur: 0.045, ampleur: 0.85, derive: 2.3 },
  { decalage: 1.5, hauteur: 0.034, epaisseur: 0.065, ampleur: 1.15, derive: 3.1 },
];

const vagues: Peintre = (ctx, largeur, hauteur, secondes, t) => {
  const force = t.clair
    ? { corps: 0.08, bord: 0.36, halo: 0.07 }
    : { corps: 0.08, bord: 0.42, halo: 0.09 };
  const echelle = Math.max(largeur, hauteur);
  const portee = Math.hypot(largeur, hauteur) / 2 + echelle * 0.15;
  const pas = Math.max(8, portee / 60);
  const phase = secondes * VAGUE.vitesse;
  const tracer = (points: [number, number][]) =>
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.save();
  ctx.translate(largeur / 2, hauteur / 2 + hauteur * 0.06);
  ctx.rotate(BIAIS.milieu + BIAIS.ecart * Math.sin(secondes * BIAIS.vitesse));
  ctx.lineJoin = 'round';
  for (const voile of VOILES) {
    const haut: [number, number][] = [];
    const bas: [number, number][] = [];
    let min = Infinity;
    let max = -Infinity;
    for (let x = -portee; x <= portee + pas; x += pas) {
      const u = x / (echelle * VAGUE.longueur);
      const centre =
        echelle * voile.hauteur +
        echelle *
          VAGUE.amplitude *
          voile.ampleur *
          Math.sin(u * Math.PI * 2 + 0.6 + voile.decalage * 0.25 + phase * 2);
      const epais =
        echelle *
        voile.epaisseur *
        (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(u * Math.PI * 1.6 + voile.derive + phase * 2.6)));
      haut.push([x, centre]);
      bas.push([x, centre + epais]);
      min = Math.min(min, centre);
      max = Math.max(max, centre + epais);
    }
    const corps = ctx.createLinearGradient(0, min, 0, max);
    corps.addColorStop(0, `rgba(${t.rgb}, ${force.corps})`);
    corps.addColorStop(1, `rgba(${t.rgb}, 0)`);
    ctx.beginPath();
    tracer(haut);
    for (let i = bas.length - 1; i >= 0; i -= 1) ctx.lineTo(bas[i][0], bas[i][1]);
    ctx.closePath();
    ctx.fillStyle = corps;
    ctx.fill();
    ctx.beginPath();
    tracer(haut);
    ctx.strokeStyle = `rgba(${t.rgb}, ${force.halo})`;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = `rgba(${t.rgb}, ${force.bord})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
  ctx.restore();
};

/* ---------- Aurore : trois grandes lueurs qui dérivent lentement ---------- */
const LUEURS = [
  { x: 0.2, y: 0.25, r: 0.55, vx: 0.07, vy: 0.05, p: 0, second: false },
  { x: 0.8, y: 0.35, r: 0.5, vx: 0.05, vy: 0.08, p: 2.1, second: true },
  { x: 0.5, y: 0.8, r: 0.6, vx: 0.06, vy: 0.04, p: 4.2, second: false },
];

const aurore: Peintre = (ctx, largeur, hauteur, secondes, t) => {
  const echelle = Math.max(largeur, hauteur);
  const force = t.clair ? 0.16 : 0.22;
  ctx.globalCompositeOperation = t.clair ? 'source-over' : 'lighter';
  for (const l of LUEURS) {
    const cx = largeur * (l.x + 0.12 * Math.sin(secondes * l.vx + l.p));
    const cy = hauteur * (l.y + 0.1 * Math.cos(secondes * l.vy + l.p));
    const r = echelle * l.r * (0.9 + 0.1 * Math.sin(secondes * 0.11 + l.p));
    const couleur = l.second ? t.rgb2 : t.rgb;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${couleur}, ${force})`);
    g.addColorStop(0.55, `rgba(${couleur}, ${force * 0.35})`);
    g.addColorStop(1, `rgba(${couleur}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, largeur, hauteur);
  }
  ctx.globalCompositeOperation = 'source-over';
};

/* ---------- Points : de petits points qui montent lentement, en oscillant ---------- */
const NB_POINTS = 46;
const POINTS = Array.from({ length: NB_POINTS }, (_, i) => {
  // Valeurs fixes (pas de hasard) : même dessin d'une ouverture à l'autre.
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.678;
  const fx = a - Math.floor(a);
  const fy = b - Math.floor(b);
  return { x: fx, y: fy, r: 1 + ((i * 7) % 5) * 0.45, v: 0.006 + fy * 0.012, p: fx * 6.28 };
});

const points: Peintre = (ctx, largeur, hauteur, secondes, t) => {
  const force = t.clair ? 0.32 : 0.45;
  for (const p of POINTS) {
    const y = (((p.y - secondes * p.v) % 1) + 1) % 1;
    const x = p.x + 0.015 * Math.sin(secondes * 0.4 + p.p);
    // Les points s'effacent en haut et en bas de l'écran.
    const bords = Math.min(1, y * 6, (1 - y) * 6);
    ctx.beginPath();
    ctx.arc(x * largeur, y * hauteur, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${t.rgb}, ${force * bords})`;
    ctx.fill();
  }
};

const PEINTRES: Record<Exclude<FondId, 'uni'>, Peintre> = { vagues, aurore, points };

export function Fond() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const root = document.documentElement;
    let immobile = mouvementReduit();
    let largeur = 0;
    let hauteur = 0;
    let image = 0;
    let derniere = 0;
    // Horloge propre, bornée à chaque image : après une mise en veille de l'onglet, le fond reprend sans sauter.
    let horloge = 0;
    let teinte = lireTeinte();
    let fond = fondValide(root.dataset.fond);

    // Dessiné en pixels d'écran (le fond est doux) : bien moins de travail à chaque image. La toile garde la
    // grande hauteur d'écran, donc la barre d'adresse qui apparaît pendant le défilement ne la redimensionne pas.
    const redimensionner = () => {
      const l = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (l === largeur && h === hauteur) return false;
      largeur = l;
      hauteur = h;
      canvas.width = l;
      canvas.height = h;
      return true;
    };

    const dessiner = (temps: number) => {
      ctx.clearRect(0, 0, largeur, hauteur);
      // Toile masquée (fond uni, panneau rapide) : rien à dessiner.
      if (!largeur || !hauteur) return;
      if (fond !== 'uni') PEINTRES[fond](ctx, largeur, hauteur, temps / 1000, teinte);
    };

    const boucle = (temps: number) => {
      image = requestAnimationFrame(boucle);
      const ecoule = temps - derniere;
      if (ecoule < IMAGE_MS) return;
      derniere = temps;
      if (fond === 'uni') return;
      horloge += Math.min(ecoule, 50);
      dessiner(horloge);
    };

    redimensionner();
    dessiner(horloge);
    if (!immobile) image = requestAnimationFrame(boucle);

    const surRedimension = () => {
      if (redimensionner()) dessiner(horloge);
    };
    // Thème, couleur, fond ou mode système changés : redessiné tout de suite.
    const surTheme = () => {
      teinte = lireTeinte();
      fond = fondValide(root.dataset.fond);
      redimensionner(); // la toile peut redevenir visible (après le fond uni)
      dessiner(horloge);
    };
    const observateur = new MutationObserver(() => {
      // Mouvement réduit choisi ou retiré dans les réglages : le fond s'arrête ou repart.
      const calme = mouvementReduit();
      if (calme !== immobile) {
        immobile = calme;
        cancelAnimationFrame(image);
        if (!immobile) image = requestAnimationFrame(boucle);
      }
      surTheme();
    });
    observateur.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent', 'data-fond', 'data-mouvement'],
    });
    const modeSysteme = window.matchMedia('(prefers-color-scheme: dark)');
    modeSysteme.addEventListener('change', surTheme);
    window.addEventListener('resize', surRedimension);
    return () => {
      cancelAnimationFrame(image);
      observateur.disconnect();
      modeSysteme.removeEventListener('change', surTheme);
      window.removeEventListener('resize', surRedimension);
    };
  }, []);

  return (
    <div aria-hidden="true" className="fond-vagues">
      <canvas ref={canvasRef} />
    </div>
  );
}
