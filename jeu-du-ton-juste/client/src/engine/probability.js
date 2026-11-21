// engine/probability.js — Tirage : une bonne réponse ne suffit pas toujours, comme dans la vraie vie.

/**
 * Score sous le minimum : échec automatique. Sinon, tirage d'un entier de 1 à 100 :
 * réussite si le tirage est inférieur ou égal au taux de réussite du niveau.
 * Le nombre affiché est exactement celui qui décide.
 */
export function computeOutcome({ score, minScore, successRate, randomFn = Math.random }) {
  if (score < minScore)
    return { success: false, reason: 'score_insuffisant', roll: null, autoFail: true, successRate };
  if (successRate >= 100)
    return { success: true, reason: 'succes_garanti', roll: null, autoFail: false, successRate };
  const roll = Math.min(100, Math.floor(randomFn() * 100) + 1);
  const success = roll <= successRate;
  return {
    success,
    reason: success ? 'reussi' : 'echec_malgre_bonne_reponse',
    roll,
    autoFail: false,
    successRate,
  };
}
