// validation.js — Ce que le serveur accepte du navigateur : un numéro de niveau connu et une réponse de joueur.

export const MAX_ANSWER = 4000;

/**
 * Renvoie { level, playerAnswer } ou { erreur }. La situation vient des niveaux du serveur, jamais du navigateur.
 * Les balises du cadre sont retirées : la réponse ne peut pas sortir de <reponse_joueur> et se faire passer pour une consigne.
 */
export function lireRequete(body, levels) {
  const level = levels.find((l) => l.id === Number(body?.levelId));
  if (!level) return { erreur: 'Niveau inconnu.' };
  const brut = typeof body?.playerAnswer === 'string' ? body.playerAnswer : '';
  const playerAnswer = brut.replace(/<\/?\s*reponse_joueur\s*>/gi, '').trim();
  if (!playerAnswer || playerAnswer.length > MAX_ANSWER) {
    return { erreur: `La réponse doit contenir entre 1 et ${MAX_ANSWER} caractères.` };
  }
  return { level, playerAnswer };
}
