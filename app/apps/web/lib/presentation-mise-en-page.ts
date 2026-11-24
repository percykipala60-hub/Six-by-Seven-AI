/**
 * Mise en page des diapositives : chaque diapositive devient une liste d'éléments posés (formes et textes), en
 * pourcentages de la diapositive (16:9, 13,333 × 7,5 pouces). L'aperçu (components/Diapositives.tsx) et l'export
 * .pptx (lib/pptx.ts) dessinent exactement ces éléments. Fonctions pures, testées.
 *
 * Tailles de police en points pour une diapositive de 960 pt de large.
 */
import type { Decor, Diapositive, Theme } from './presentation';

export type Forme = {
  genre: 'forme';
  forme: 'rect' | 'arrondi' | 'ellipse' | 'losange' | 'ligne';
  x: number;
  y: number;
  w: number;
  h: number;
  fond?: string;
  contour?: string;
  /** Épaisseur du contour, en points. */
  epaisseur?: number;
  /** Transparence du fond, de 0 (opaque) à 100. */
  transparence?: number;
};

export type Texte = {
  genre: 'texte';
  x: number;
  y: number;
  w: number;
  h: number;
  texte?: string;
  puces?: string[];
  taille: number;
  couleur: string;
  police: string;
  gras?: boolean;
  italique?: boolean;
  majuscules?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
};

export type Element = Forme | Texte;
export type DiapoPosee = { fond: string; elements: Element[] };

/** Rapport largeur / hauteur : 1 % de largeur vaut 16/9 % de hauteur. */
export const RAPPORT = 16 / 9;
const MARGE = 6;

const estForte = (d: Diapositive) => d.type === 'titre' || d.type === 'section' || d.type === 'fin';

function forme(
  f: Forme['forme'],
  x: number,
  y: number,
  w: number,
  h: number,
  o: Partial<Forme> = {},
): Forme {
  return { genre: 'forme', forme: f, x, y, w, h, ...o };
}

/** Cercle de diamètre d (en % de largeur), centré en (cx, cy). */
function cercle(cx: number, cy: number, d: number, o: Partial<Forme>): Forme {
  return forme('ellipse', cx - d / 2, cy - (d * RAPPORT) / 2, d, d * RAPPORT, o);
}

/* ---------- Décors propres à chaque thème ---------- */

function decor(t: Theme, d: Diapositive): Element[] {
  const fort = estForte(d);
  const deco: Record<Decor, () => Element[]> = {
    editorial: () =>
      fort
        ? [
            forme('ligne', MARGE, 10, 100 - 2 * MARGE, 0, {
              contour: t.encreFort,
              epaisseur: 0.75,
            }),
            forme('ligne', MARGE, 90, 100 - 2 * MARGE, 0, {
              contour: t.encreFort,
              epaisseur: 0.75,
            }),
          ]
        : [forme('rect', 100 - 26, 0, 26, 100, { fond: t.doux })],
    ardoise: () =>
      fort
        ? [
            forme('rect', 0, 0, 100, 100, { fond: t.accent }),
            forme('arrondi', 10, 14, 80, 72, { fond: t.fond }),
            forme('ellipse', 62, 22, 22, 22 * RAPPORT, { fond: t.doux }),
          ]
        : [
            forme('rect', 0, 0, 100, 3, { fond: t.accent }),
            forme('ellipse', 92, 84, 16, 16 * RAPPORT, { fond: t.accent }),
          ],
    vague: () =>
      fort
        ? [
            forme('ellipse', 62, -30, 60, 60 * RAPPORT, { fond: t.accent2 }),
            forme('ellipse', 68, -22, 52, 52 * RAPPORT, { fond: t.accent }),
            forme('ellipse', 74, -14, 44, 44 * RAPPORT, { fond: t.doux }),
            forme('ellipse', -14, 74, 30, 30 * RAPPORT, { fond: t.accent }),
          ]
        : [
            forme('ellipse', 86, -16, 22, 22 * RAPPORT, { fond: t.accent2 }),
            forme('ellipse', 89, -12, 16, 16 * RAPPORT, { fond: t.accent }),
            forme('rect', 0, 97, 100, 3, { fond: t.accent }),
          ],
    arche: () =>
      fort
        ? [
            forme('ellipse', 58, 18, 34, 34 * RAPPORT, { fond: t.accent }),
            forme('ellipse', 66, 30, 34, 34 * RAPPORT, { fond: t.accent2, transparence: 40 }),
          ]
        : [forme('ellipse', 90, -14, 18, 18 * RAPPORT, { fond: t.doux })],
    blob: () => [
      forme('ellipse', -9, -18, 15, 15 * RAPPORT, { fond: t.accent2 }),
      forme('ellipse', 86, 72, 24, 24 * RAPPORT, { fond: t.accent2 }),
      forme('ellipse', 82, -10, 20, 20 * RAPPORT, { contour: t.accent, epaisseur: 1.5 }),
      ...(fort
        ? [forme('ellipse', -6, 74, 16, 16 * RAPPORT, { contour: t.accent, epaisseur: 1.5 })]
        : []),
    ],
    points: () => {
      const points: Element[] = [];
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 3; c++)
          points.push(cercle(92 + c * 2.4, 22 + r * 4.6, 0.7, { fond: t.accent2 }));
      return [
        forme('ellipse', 18, 12, 64, 76, { fond: t.doux, transparence: 30 }),
        ...points,
        ...[0, 1, 2, 3, 4].map((k) => cercle(MARGE + 1 + k * 2.2, 92, 1.3, { fond: t.accent2 })),
      ];
    },
    acier: () =>
      fort
        ? [
            forme('rect', 0, 0, 100, 100, { fond: t.fondFort ?? t.accent }),
            forme('rect', 18, 22, 64, 56, { contour: t.accent2, epaisseur: 3 }),
          ]
        : [forme('rect', 0, 0, 2.2, 100, { fond: t.accent })],
    cadre: () => [
      forme('rect', 2, 2 * RAPPORT, 96, 100 - 4 * RAPPORT, { contour: t.accent, epaisseur: 2.5 }),
      forme('losange', -4, -8, 12, 16, { fond: t.accent }),
      forme('losange', 92, 92, 12, 16, { fond: t.accent }),
    ],
    losanges: () =>
      fort
        ? [
            forme('losange', 66, 8, 28, 28 * RAPPORT, { fond: t.doux }),
            forme('losange', 76, 40, 24, 24 * RAPPORT, { fond: t.accent }),
            forme('losange', 62, 60, 14, 14 * RAPPORT, { fond: t.accent }),
            forme('losange', 90, 2, 10, 10 * RAPPORT, { fond: t.accent2 }),
          ]
        : [
            forme('losange', -6, -10, 14, 14 * RAPPORT, { fond: t.accent }),
            forme('losange', 90, -8, 12, 12 * RAPPORT, { fond: t.doux }),
            forme('losange', 92, 84, 10, 10 * RAPPORT, { fond: t.accent }),
          ],
    bandeau: () =>
      fort && d.type !== 'section'
        ? [
            forme('rect', 0, 62, 100, 38, { fond: t.accent }),
            forme('ligne', MARGE, 56, 30, 0, { contour: t.accent, epaisseur: 1 }),
          ]
        : [
            forme('rect', 0, 96, 100, 4, { fond: t.accent }),
            forme('ligne', 40, 21, 20, 0, { contour: t.accent2, epaisseur: 1 }),
          ],
  };
  return deco[t.decor]();
}

/* ---------- Contenu ---------- */

/** Bord droit (en %) que le texte des diapositives fortes ne dépasse pas : le décor occupe la suite. */
const LIBRE_FORT: Record<Decor, number> = {
  editorial: 94,
  ardoise: 60,
  vague: 60,
  arche: 56,
  blob: 84,
  points: 88,
  acier: 82,
  cadre: 94,
  losanges: 62,
  bandeau: 94,
};

export function poserDiapositive(t: Theme, d: Diapositive, i: number): DiapoPosee {
  const fort = estForte(d);
  const sombre = fort && t.fondFort !== null;
  const fond = sombre ? (t.fondFort as string) : t.fond;
  const encre = sombre ? t.encreFort : t.encre;
  const discret = sombre ? t.encreFort : t.discret;
  const els: Element[] = decor(t, d);
  const texte = (o: Omit<Texte, 'genre' | 'police' | 'couleur'> & Partial<Texte>): Texte => {
    const e: Texte = { genre: 'texte', police: t.policeCorps, couleur: encre, ...o };
    // Impact est déjà très épais : le gras le déforme (faux gras du navigateur et de PowerPoint).
    return e.police === 'Impact' ? { ...e, gras: false } : e;
  };
  const titre = (valeur: string, o: Partial<Texte> = {}) =>
    texte({
      x: MARGE,
      y: 7,
      w: 100 - 2 * MARGE - (t.decor === 'editorial' && !fort ? 26 : 0),
      h: 13,
      texte: valeur,
      taille: 30,
      gras: true,
      police: t.policeTitre,
      majuscules: t.majuscules,
      valign: 'middle',
      ...o,
    });
  // Bandeau bordeaux du thème classique : le titre est centré, souligné par le filet du décor.
  const titreCentre = t.decor === 'bandeau' || t.decor === 'points';
  const enTete = (valeur: string) =>
    titre(valeur, titreCentre ? { align: 'center', x: MARGE, w: 100 - 2 * MARGE } : {});
  const haut = 25; // début de la zone de contenu
  // Diapositive forte : un texte posé de x à x + w s'arrête avant le décor.
  const borne = (x: number, w: number) => Math.min(w, LIBRE_FORT[t.decor] - x);
  const largeur = 100 - 2 * MARGE - (t.decor === 'editorial' ? 26 : 0);

  switch (d.type) {
    case 'titre':
    case 'fin': {
      const centre = t.decor === 'cadre' || t.decor === 'points' || t.decor === 'acier';
      const bas = t.decor === 'bandeau';
      const x0 = centre ? 12 : MARGE + (t.decor === 'ardoise' ? 8 : 0);
      els.push(
        texte({
          x: centre ? 12 : MARGE + (t.decor === 'ardoise' ? 8 : 0),
          y: bas ? 20 : d.type === 'fin' ? 30 : 24,
          w: centre ? 76 : borne(x0, 58),
          h: 30,
          texte: d.titre,
          taille: d.type === 'fin' ? 66 : t.decor === 'editorial' ? 64 : 46,
          gras: true,
          police: t.policeTitre,
          majuscules: t.majuscules,
          couleur: t.decor === 'acier' ? t.encreFort : encre,
          align: centre ? 'center' : 'left',
          valign: 'bottom',
        }),
      );
      const sous = d.sous_titre ?? d.texte;
      if (sous)
        els.push(
          texte({
            x: centre ? 12 : MARGE + (t.decor === 'ardoise' ? 8 : 0),
            y: bas ? 66 : 56,
            w: centre ? 76 : borne(x0, 52),
            h: 12,
            texte: sous,
            taille: 18,
            couleur: bas ? '#FFFFFF' : t.decor === 'acier' ? t.encreFort : discret,
            align: centre ? 'center' : 'left',
          }),
        );
      if (d.auteur)
        els.push(
          texte({
            x: centre ? 12 : MARGE + (t.decor === 'ardoise' ? 8 : 0),
            y: bas ? 80 : 76,
            w: centre ? 76 : borne(x0, 52),
            h: 6,
            texte: d.auteur,
            taille: 12,
            couleur: bas ? '#FFFFFF' : t.decor === 'acier' ? t.encreFort : discret,
            align: centre ? 'center' : 'left',
          }),
        );
      break;
    }
    case 'section': {
      els.push(
        cercle(MARGE + 9, 50, 14, { fond: sombre ? t.encreFort : t.accent }),
        texte({
          x: MARGE + 2,
          y: 38,
          w: 14,
          h: 24,
          texte: d.numero || String(i + 1).padStart(2, '0'),
          taille: 40,
          gras: true,
          police: t.policeTitre,
          couleur: sombre ? (t.fondFort as string) : '#FFFFFF',
          align: 'center',
          valign: 'middle',
        }),
        texte({
          x: MARGE + 22,
          y: 34,
          w: borne(MARGE + 22, 60),
          h: 18,
          texte: d.titre,
          taille: 40,
          gras: true,
          police: t.policeTitre,
          majuscules: t.majuscules,
          valign: 'bottom',
        }),
      );
      if (d.texte)
        els.push(
          texte({
            x: MARGE + 22,
            y: 54,
            w: borne(MARGE + 22, 56),
            h: 14,
            texte: d.texte,
            taille: 16,
            couleur: discret,
          }),
        );
      break;
    }
    case 'sommaire': {
      els.push(enTete(d.titre || 'Sommaire'));
      const points = d.points ?? [];
      const parColonne = Math.ceil(points.length / 2) || 1;
      points.forEach((p, k) => {
        const col = Math.floor(k / parColonne);
        const ligne = k % parColonne;
        const x = MARGE + col * (largeur / 2);
        const y = haut + 4 + ligne * 15;
        els.push(
          cercle(x + 3, y + 5, 4.6, { fond: t.accent }),
          texte({
            x: x,
            y: y,
            w: 6,
            h: 10,
            texte: String(k + 1).padStart(2, '0'),
            taille: 14,
            gras: true,
            couleur: '#FFFFFF',
            align: 'center',
            valign: 'middle',
          }),
          texte({
            x: x + 8,
            y,
            w: largeur / 2 - 10,
            h: 10,
            texte: p,
            taille: 16,
            valign: 'middle',
          }),
        );
      });
      break;
    }
    case 'texte': {
      els.push(enTete(d.titre));
      const deux = Boolean(d.texte && d.points?.length);
      if (d.texte)
        els.push(
          texte({
            x: MARGE,
            y: haut + 2,
            w: deux ? largeur * 0.48 : largeur,
            h: 62,
            texte: d.texte,
            taille: 16,
          }),
        );
      if (d.points?.length) {
        const x = deux ? MARGE + largeur * 0.52 : MARGE;
        if (deux)
          els.push(forme('arrondi', x - 1.5, haut, largeur * 0.48 + 1.5, 66, { fond: t.doux }));
        els.push(
          texte({
            x: x + (deux ? 1 : 0),
            y: haut + 3,
            w: deux ? largeur * 0.48 - 2 : largeur,
            h: 60,
            puces: d.points,
            taille: 16,
          }),
        );
      }
      break;
    }
    case 'colonnes': {
      els.push(enTete(d.titre));
      const cols = d.colonnes ?? [];
      const n = Math.max(1, cols.length);
      const ecart = 2.5;
      const w = (largeur - ecart * (n - 1)) / n;
      cols.forEach((c, k) => {
        const x = MARGE + k * (w + ecart);
        els.push(
          forme('arrondi', x, haut + 2, w, 62, { fond: t.doux }),
          cercle(x + 5, haut + 12, 5, { fond: t.accent }),
          texte({
            x: x + 2.5,
            y: haut + 7.5,
            w: 5,
            h: 9,
            texte: String(k + 1).padStart(2, '0'),
            taille: 13,
            gras: true,
            couleur: '#FFFFFF',
            align: 'center',
            valign: 'middle',
          }),
          texte({
            x: x + 2,
            y: haut + 22,
            w: w - 4,
            h: 10,
            texte: c.titre,
            taille: 16,
            gras: true,
            police: t.policeTitre,
          }),
          texte({
            x: x + 2,
            y: haut + 33,
            w: w - 4,
            h: 30,
            texte: c.texte,
            taille: 13,
            couleur: t.discret,
          }),
        );
      });
      break;
    }
    case 'chiffres': {
      els.push(enTete(d.titre));
      const ch = d.chiffres ?? [];
      const n = Math.max(1, ch.length);
      const w = largeur / n;
      ch.forEach((c, k) => {
        const x = MARGE + k * w;
        if (k > 0)
          els.push(forme('ligne', x, haut + 10, 0, 40, { contour: t.accent2, epaisseur: 1 }));
        els.push(
          texte({
            x: x + 2,
            y: haut + 8,
            w: w - 4,
            h: 20,
            texte: c.valeur,
            taille: 44,
            gras: true,
            police: t.policeTitre,
            couleur: t.accent,
          }),
          texte({
            x: x + 2,
            y: haut + 30,
            w: w - 4,
            h: 22,
            texte: c.libelle,
            taille: 14,
            couleur: t.discret,
          }),
        );
      });
      if (d.texte)
        els.push(
          texte({
            x: MARGE,
            y: 82,
            w: largeur,
            h: 10,
            texte: d.texte,
            taille: 13,
            couleur: t.discret,
          }),
        );
      break;
    }
    case 'etapes': {
      els.push(enTete(d.titre));
      const et = d.etapes ?? [];
      const n = Math.max(1, et.length);
      const w = largeur / n;
      const yLigne = haut + 14;
      els.push(forme('ligne', MARGE, yLigne, largeur, 0, { contour: t.accent2, epaisseur: 2 }));
      et.forEach((e, k) => {
        const cx = MARGE + k * w + w / 2;
        els.push(
          cercle(cx, yLigne, 5.2, { fond: t.accent }),
          texte({
            x: cx - 2.6,
            y: yLigne - 4.6,
            w: 5.2,
            h: 9.2,
            texte: String(k + 1),
            taille: 15,
            gras: true,
            couleur: '#FFFFFF',
            align: 'center',
            valign: 'middle',
          }),
          texte({
            x: cx - w / 2 + 1,
            y: yLigne + 9,
            w: w - 2,
            h: 9,
            texte: e.titre,
            taille: 15,
            gras: true,
            police: t.policeTitre,
            align: 'center',
          }),
          texte({
            x: cx - w / 2 + 1,
            y: yLigne + 19,
            w: w - 2,
            h: 30,
            texte: e.texte,
            taille: 12,
            couleur: t.discret,
            align: 'center',
          }),
        );
      });
      break;
    }
    case 'graphique': {
      els.push(enTete(d.titre));
      const s = d.series ?? [];
      const max = Math.max(1, ...s.map((x) => x.valeur));
      const zoneW = d.texte ? largeur * 0.6 : largeur;
      const bas = 84;
      const hMax = 48;
      const pas = zoneW / Math.max(1, s.length);
      els.push(forme('ligne', MARGE, bas, zoneW, 0, { contour: t.discret, epaisseur: 1 }));
      s.forEach((x, k) => {
        const h = Math.max(0.8, (Math.max(0, x.valeur) / max) * hMax);
        const bx = MARGE + k * pas + pas * 0.2;
        els.push(
          forme('rect', bx, bas - h, pas * 0.6, h, { fond: k % 2 ? t.accent2 : t.accent }),
          texte({
            x: bx - pas * 0.2,
            y: bas - h - 7,
            w: pas,
            h: 6,
            texte: String(x.valeur),
            taille: 11,
            gras: true,
            align: 'center',
            valign: 'bottom',
          }),
          texte({
            x: bx - pas * 0.2,
            y: bas + 1,
            w: pas,
            h: 7,
            texte: x.libelle,
            taille: 11,
            couleur: t.discret,
            align: 'center',
          }),
        );
      });
      if (d.texte)
        els.push(
          texte({
            x: MARGE + zoneW + 4,
            y: haut + 6,
            w: largeur - zoneW - 4,
            h: 56,
            texte: d.texte,
            taille: 14,
          }),
        );
      break;
    }
    case 'tableau': {
      els.push(enTete(d.titre));
      const lignes = d.lignes ?? [];
      const nCol = Math.max(1, ...lignes.map((l) => l.length));
      const hLigne = Math.min(9, 64 / Math.max(1, lignes.length));
      const wCol = largeur / nCol;
      lignes.forEach((l, r) => {
        const y = haut + 2 + r * hLigne;
        if (r === 0) els.push(forme('rect', MARGE, y, largeur, hLigne, { fond: t.accent }));
        else
          els.push(
            forme('ligne', MARGE, y + hLigne, largeur, 0, { contour: t.accent2, epaisseur: 0.75 }),
          );
        for (let c = 0; c < nCol; c++)
          els.push(
            texte({
              x: MARGE + c * wCol + 1,
              y,
              w: wCol - 2,
              h: hLigne,
              texte: l[c] ?? '',
              taille: hLigne < 7 ? 11 : 13,
              gras: r === 0,
              couleur: r === 0 ? '#FFFFFF' : t.encre,
              valign: 'middle',
            }),
          );
      });
      break;
    }
    case 'citation': {
      els.push(
        texte({
          x: MARGE,
          y: 12,
          w: 14,
          h: 26,
          texte: '«',
          taille: 120,
          gras: true,
          police: 'Georgia',
          couleur: t.accent,
          valign: 'top',
        }),
        texte({
          x: 14,
          y: 30,
          w: 72,
          h: 36,
          texte: d.texte || d.titre,
          taille: 28,
          italique: true,
          police: t.policeTitre === 'Impact' ? t.policeCorps : t.policeTitre,
          align: 'center',
          valign: 'middle',
        }),
      );
      if (d.auteur)
        els.push(
          texte({
            x: 14,
            y: 70,
            w: 72,
            h: 8,
            texte: `— ${d.auteur}`,
            taille: 14,
            couleur: t.discret,
            align: 'center',
          }),
        );
      break;
    }
    case 'equipe': {
      els.push(enTete(d.titre || 'Équipe'));
      const m = d.membres ?? [];
      const n = Math.max(1, m.length);
      const w = largeur / n;
      m.forEach((p, k) => {
        const cx = MARGE + k * w + w / 2;
        const initiales = p.nom
          .split(/\s+/)
          .map((x) => x.charAt(0))
          .join('')
          .slice(0, 2)
          .toUpperCase();
        els.push(
          cercle(cx, haut + 18, Math.min(13, w - 4), { fond: t.doux }),
          texte({
            x: cx - 6,
            y: haut + 10,
            w: 12,
            h: 16,
            texte: initiales,
            taille: 26,
            gras: true,
            police: t.policeTitre,
            couleur: t.accent,
            align: 'center',
            valign: 'middle',
          }),
          texte({
            x: cx - w / 2 + 1,
            y: haut + 34,
            w: w - 2,
            h: 8,
            texte: p.nom,
            taille: 15,
            gras: true,
            align: 'center',
          }),
          texte({
            x: cx - w / 2 + 1,
            y: haut + 42,
            w: w - 2,
            h: 14,
            texte: p.role,
            taille: 12,
            couleur: t.discret,
            align: 'center',
          }),
        );
      });
      break;
    }
  }
  return { fond, elements: els };
}
