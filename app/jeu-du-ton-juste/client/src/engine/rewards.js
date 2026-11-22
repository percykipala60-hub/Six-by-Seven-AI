// engine/rewards.js — Étoiles, rangs et déblocage.

// Seuils de note pour 1, 2 et 3 étoiles (affichés aussi dans les règles de chaque niveau).
// Volontairement exigeants (cahier des charges) : les étoiles récompensent l'excellence, pas la
// simple réussite. 3 étoiles = 95/100, une réponse rare ; un niveau réussi à 65 ne rapporte rien.
export const SEUILS_ETOILES = [70, 85, 95];

// Une réponse plus courte ne peut pas être notée sérieusement : on la refuse avant d'appeler l'IA.
export const MIN_CHARS = 15;

export function reponseAssezLongue(texte) {
  return String(texte ?? '').trim().length >= MIN_CHARS;
}

/** Écart avec le meilleur score précédent : 'premier', 'record' (+points) ou null. */
export function comparerRecord(scoreAvant, scoreActuel, premierEssai) {
  if (premierEssai) return { type: 'premier' };
  if (scoreActuel > scoreAvant) return { type: 'record', gain: scoreActuel - scoreAvant };
  return null;
}

export function computeStars(score) {
  return SEUILS_ETOILES.filter((s) => score >= s).length;
}

export function computeRank(score) {
  if (score >= 98) return 'diamant';
  if (score >= 95) return 'platine';
  if (score >= 90) return 'or';
  if (score >= 80) return 'argent';
  if (score >= 70) return 'bronze';
  return null;
}

export function getRankLabel(rank) {
  const labels = {
    diamant: 'Diamant',
    platine: 'Platine',
    or: 'Or',
    argent: 'Argent',
    bronze: 'Bronze',
  };
  return labels[rank] ?? '—';
}

const ORDRE = { diamant: 5, platine: 4, or: 3, argent: 2, bronze: 1 };

export function getBetterRank(rankA, rankB) {
  return (ORDRE[rankA] ?? 0) >= (ORDRE[rankB] ?? 0) ? rankA : rankB;
}

/** Étoiles des niveaux (meilleur résultat + bonus du niveau) et bonus de série. */
export function computeTotalStars(completedLevels = {}, serieBonus = 0) {
  const niveaux = Object.values(completedLevels).reduce(
    (sum, l) => sum + (l.stars || 0) + (l.bonusStars || 0),
    0,
  );
  return niveaux + serieBonus;
}

/** Niveau précédent réussi au moins une fois (le premier niveau n'en a pas). */
export function previousLevelPassed(levelId, levels, completedLevels = {}) {
  const i = levels.findIndex((l) => l.id === levelId);
  if (i <= 0) return i === 0;
  // Les quêtes sont des défis parallèles : leurs étoiles requises suffisent à les débloquer.
  if (levels[i].kind === 'quest') return true;
  const prev = completedLevels[levels[i - 1].id];
  return Boolean(prev && (prev.reussi || prev.lastOutcome === 'success'));
}

/** Un niveau s'ouvre quand le niveau précédent est réussi ET que le joueur a assez d'étoiles. */
export function isLevelUnlocked(levelId, totalStars, levels, completedLevels = {}) {
  const level = levels.find((l) => l.id === levelId);
  return (
    Boolean(level) &&
    previousLevelPassed(levelId, levels, completedLevels) &&
    totalStars >= level.unlockStars
  );
}

export function starsNeededToUnlock(levelId, totalStars, levels) {
  const level = levels.find((l) => l.id === levelId);
  return level ? Math.max(0, level.unlockStars - totalStars) : 0;
}

// Rangs du joueur selon ses étoiles, du plus bas au plus haut.
export const RANGS_JOUEUR = [
  { nom: 'Débutant', min: 0 },
  { nom: 'Apprenti', min: 8 },
  { nom: 'Compétent', min: 16 },
  { nom: 'Pro', min: 24 },
  { nom: 'Expert', min: 32 },
  { nom: 'Maître', min: 40 },
];

export function getPlayerRank(totalStars) {
  return RANGS_JOUEUR.filter((r) => totalStars >= r.min).at(-1).nom;
}

/** Rang suivant et étoiles qui manquent ; null au rang le plus haut. */
export function nextPlayerRank(totalStars) {
  const r = RANGS_JOUEUR.find((x) => x.min > totalStars);
  return r ? { nom: r.nom, manque: r.min - totalStars } : null;
}
