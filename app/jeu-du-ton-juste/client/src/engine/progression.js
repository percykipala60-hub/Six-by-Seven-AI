// engine/progression.js — Ce que change une tentative dans la progression du joueur (fonction pure, testée).
import { computeStars, getBetterRank } from './rewards.js';
import { TOTAL_DEVINETTES } from '../data/riddles.js';
import { TOTAL_ENIGMES } from '../data/enigmas.js';

export const ETAT_VIDE = {
  completedLevels: {},
  serie: 0,
  serieBonus: 0,
  hintPoints: 0,
  revealedHints: {},
  solvedRiddles: [],
  solvedEnigmas: [],
  questRewards: [],
};
export const SERIE = 3; // niveaux réussis pour la première fois d'affilée
export const SERIE_MAX = 5; // 15 niveaux / 3 : la série ne peut pas rapporter plus

export const BONUS = {
  sans_faute: { label: 'Sans-faute !', stars: 1 },
  coeur_fidele: { label: 'Cœur fidèle !', stars: 2 },
  serie_parfaite: { label: 'Série parfaite !', stars: 1 },
};

/**
 * Applique une tentative et renvoie le nouvel état et les bonus gagnés à cette tentative.
 * Chaque bonus ne se gagne qu'une fois par niveau, et la série ne compte que des niveaux réussis
 * pour la première fois : rejouer un niveau facile ne fabrique pas d'étoiles à l'infini.
 */
export function appliquerTentative(etat, level, { score, success, stars, rank }) {
  const avant = etat.completedLevels[level.id] || {};
  const premierEssai = !avant.attempts;
  const dejaReussi = Boolean(avant.reussi || avant.lastOutcome === 'success');
  const dejaBonus = new Set(avant.bonus || []);
  const gagnes = [];

  if (success) {
    if (score >= 98 && !dejaBonus.has('sans_faute')) gagnes.push('sans_faute');
    if (level.piege && premierEssai && !dejaBonus.has('coeur_fidele')) gagnes.push('coeur_fidele');
  }

  let serie = etat.serie || 0;
  let serieBonus = etat.serieBonus || 0;
  if (!success) serie = 0;
  else if (!dejaReussi) {
    serie += 1;
    if (serie >= SERIE) {
      serie = 0;
      if (serieBonus < SERIE_MAX) {
        serieBonus += 1;
        gagnes.push('serie_parfaite');
      }
    }
  }

  const bonusNiveau = [...dejaBonus, ...gagnes.filter((id) => id !== 'serie_parfaite')];
  const niveau = {
    stars: Math.max(avant.stars || 0, stars),
    bonus: bonusNiveau,
    bonusStars: Math.max(
      avant.bonusStars || 0,
      bonusNiveau.reduce((s, id) => s + BONUS[id].stars, 0),
    ),
    rank: getBetterRank(avant.rank || null, rank),
    bestScore: Math.max(avant.bestScore || 0, score),
    attempts: (avant.attempts || 0) + 1,
    reussi: dejaReussi || success,
    lastOutcome: success ? 'success' : 'fail',
  };

  return {
    etat: {
      ...etat,
      completedLevels: { ...etat.completedLevels, [level.id]: niveau },
      serie,
      serieBonus,
    },
    bonuses: gagnes.map((id) => ({ id, ...BONUS[id] })),
  };
}

/**
 * État d'un niveau sur la carte : jamais joué, tenté sans réussir, ou réussi.
 * Sert à ne plus afficher « Pas encore joué » après un échec (audit du 17/10/2026).
 */
export function etatCarte(niveau) {
  const n = niveau || {};
  const essais = Number(n.attempts) || 0;
  const meilleur = Number(n.bestScore) || 0;
  if (n.reussi || n.lastOutcome === 'success') return { etat: 'reussi', essais, meilleur };
  if (essais > 0) return { etat: 'essais', essais, meilleur };
  return { etat: 'jamais', essais: 0, meilleur: 0 };
}

/** Lit une sauvegarde (y compris l'ancien format) en bornant les bonus déjà comptés. */
export function lireSauvegarde(brut) {
  const o = brut && typeof brut === 'object' ? brut : {};
  const completedLevels = {};
  for (const [id, n] of Object.entries(o.completedLevels || {})) {
    if (!n || typeof n !== 'object') continue;
    const bonus = Array.isArray(n.bonus)
      ? n.bonus.filter((b) => b in BONUS && b !== 'serie_parfaite')
      : [];
    completedLevels[id] = {
      ...n,
      // Les étoiles gardées ne dépassent jamais ce que le meilleur score rapporte avec les seuils
      // actuels : une partie jouée avec les anciens seuils, plus faciles, ne garde pas ses étoiles en trop.
      stars: Math.min(Number(n.stars) || 0, computeStars(Number(n.bestScore) || 0)),
      bonus,
      // Ancien format : les bonus pouvaient s'additionner à chaque partie ; on garde au plus ceux d'un niveau.
      bonusStars: Math.min(Number(n.bonusStars) || 0, 3),
      reussi: Boolean(n.reussi || n.lastOutcome === 'success'),
    };
  }
  const ancienneSerie = Array.isArray(o.bonusHistory)
    ? o.bonusHistory.filter((b) => b?.id === 'serie_parfaite').length
    : 0;
  return {
    completedLevels,
    serie: Number(o.serie) || 0,
    serieBonus: Math.min(SERIE_MAX, Number(o.serieBonus) || ancienneSerie),
    hintPoints: Math.max(0, Math.min(5000, Math.floor(Number(o.hintPoints) || 0))),
    revealedHints: Object.fromEntries(
      Object.entries(o.revealedHints || {}).map(([id, count]) => [
        id,
        Math.max(0, Math.min(10, Math.floor(Number(count) || 0))),
      ]),
    ),
    solvedRiddles: Array.isArray(o.solvedRiddles)
      ? [...new Set(o.solvedRiddles.map(Number).filter((id) => id >= 1 && id <= TOTAL_DEVINETTES))]
      : [],
    solvedEnigmas: Array.isArray(o.solvedEnigmas)
      ? [...new Set(o.solvedEnigmas.map(Number).filter((id) => id >= 1 && id <= TOTAL_ENIGMES))]
      : [],
    questRewards: Array.isArray(o.questRewards)
      ? [...new Set(o.questRewards.map(Number).filter((id) => id >= 46 && id <= 50))]
      : [],
  };
}

/** Étoiles possibles en tout : 3 par niveau, Sans-faute sur chaque niveau, Cœur fidèle et les séries. */
export function maxEtoiles(levels) {
  return (
    levels.length * (3 + BONUS.sans_faute.stars) +
    levels.filter((l) => l.piege).length * BONUS.coeur_fidele.stars +
    SERIE_MAX * BONUS.serie_parfaite.stars
  );
}

/**
 * Étoiles réellement accessibles : le total moins les bonus Sans-faute (98/100), que Six réserve
 * à « environ une fois sur 200 » d'après son propre barème. La carte affiche ce chiffre-là, sinon
 * elle annonce un maximum que personne n'atteindra (audit du 17/10/2026).
 */
export function maxEtoilesAccessibles(levels) {
  return maxEtoiles(levels) - levels.length * BONUS.sans_faute.stars;
}
