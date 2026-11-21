'use client';

import { useEffect, useRef } from 'react';

// Une seule vague faite de quelques voiles transparents superposés : chacun a un bord lumineux et s'efface
// vers le bas ; ils dérivent légèrement décalés, si bien que l'ensemble respire.
const VAGUE = { amplitude: 0.1, longueur: 1.25, vitesse: 0.12 };
// La vague traverse l'écran en biais, un biais qui tourne très lentement (presque couchée, presque debout).
const BIAIS = { milieu: -0.75, ecart: 0.55, vitesse: 0.045 };
const VOILES = [
  { decalage: 0, hauteur: -0.03, epaisseur: 0.07, ampleur: 1, derive: 0 },
  { decalage: 0.35, hauteur: -0.012, epaisseur: 0.05, ampleur: 0.92, derive: 0.7 },
  { decalage: 0.7, hauteur: 0.004, epaisseur: 0.085, ampleur: 1.08, derive: 1.5 },
  { decalage: 1.1, hauteur: 0.02, epaisseur: 0.045, ampleur: 0.85, derive: 2.3 },
  { decalage: 1.5, hauteur: 0.034, epaisseur: 0.065, ampleur: 1.15, derive: 3.1 },
];
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

/** Teinte de la vague : la couleur du thème, plus présente sur fond sombre que sur fond clair. */
function lireTeinte() {
  const fond = rgb('--bg').split(', ').map(Number);
  const clair = (fond[0] * 299 + fond[1] * 587 + fond[2] * 114) / 1000 > 140;
  return clair
    ? { rgb: rgb('--accent-b'), corps: 0.08, bord: 0.36, halo: 0.07 }
    : { rgb: rgb('--brand'), corps: 0.08, bord: 0.42, halo: 0.09 };
}

/**
 * Fond de Six : une vague lumineuse qui bouge lentement derrière le contenu, aux couleurs du thème choisi.
 * Dessinée une seule fois et immobile quand le téléphone demande moins d'animations.
 */
export function FondVagues() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const immobile = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let largeur = 0;
    let hauteur = 0;
    let image = 0;
    let derniere = 0;
    // Horloge propre, bornée à chaque image : après une mise en veille de l'onglet, la vague reprend sans sauter.
    let horloge = 0;
    let teinte = lireTeinte();

    // Dessinée en pixels d'écran (la vague est douce) : bien moins de travail à chaque image. La toile garde la
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

    const tracer = (points: [number, number][]) =>
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));

    const dessiner = (temps: number) => {
      const secondes = temps / 1000;
      ctx.clearRect(0, 0, largeur, hauteur);
      const echelle = Math.max(largeur, hauteur);
      const portee = Math.hypot(largeur, hauteur) / 2 + echelle * 0.15;
      const pas = Math.max(8, portee / 60);
      const phase = secondes * VAGUE.vitesse;
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
          const t = x / (echelle * VAGUE.longueur);
          const centre =
            echelle * voile.hauteur +
            echelle *
              VAGUE.amplitude *
              voile.ampleur *
              Math.sin(t * Math.PI * 2 + 0.6 + voile.decalage * 0.25 + phase * 2);
          // Chaque voile s'épaissit et s'affine le long de la vague, à son propre rythme.
          const epais =
            echelle *
            voile.epaisseur *
            (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * Math.PI * 1.6 + voile.derive + phase * 2.6)));
          haut.push([x, centre]);
          bas.push([x, centre + epais]);
          min = Math.min(min, centre);
          max = Math.max(max, centre + epais);
        }
        const corps = ctx.createLinearGradient(0, min, 0, max);
        corps.addColorStop(0, `rgba(${teinte.rgb}, ${teinte.corps})`);
        corps.addColorStop(1, `rgba(${teinte.rgb}, 0)`);
        ctx.beginPath();
        tracer(haut);
        for (let i = bas.length - 1; i >= 0; i -= 1) ctx.lineTo(bas[i][0], bas[i][1]);
        ctx.closePath();
        ctx.fillStyle = corps;
        ctx.fill();
        // Bord lumineux : un halo large et doux, puis la ligne fine.
        ctx.beginPath();
        tracer(haut);
        ctx.strokeStyle = `rgba(${teinte.rgb}, ${teinte.halo})`;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${teinte.rgb}, ${teinte.bord})`;
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
      if (redimensionner()) dessiner(horloge);
    };
    // Thème, couleur ou mode système changés : nouvelle teinte, redessinée tout de suite.
    const surTheme = () => {
      teinte = lireTeinte();
      dessiner(horloge);
    };
    const observateur = new MutationObserver(surTheme);
    observateur.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent'],
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
