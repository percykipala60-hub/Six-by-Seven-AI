/**
 * Plan de travail de Cosinus : avant d'agir, Six écrit la liste des tâches (outil « planifier »), visible dans
 * l'interface, puis les coche une à une, dans l'ordre (outil « tache_faite » : coche toujours la première tâche
 * pas encore faite, jamais une autre).
 */

export type Tache = { texte: string; faite: boolean };

export const TACHES_MAX = 8;

/** Liste de tâches à partir du texte du modèle : une tâche par ligne, puces et numéros retirés. */
export function creerPlan(texte: unknown): Tache[] {
  const brut = typeof texte === 'string' ? texte : Array.isArray(texte) ? texte.join('\n') : '';
  // Une tâche par ligne ; un petit modèle les met parfois sur une seule ligne, séparées par « ; » ou par des
  // virgules suivies d'une majuscule (« Lister les fichiers, Lire chaque fichier, Calculer… »).
  const lignes = (
    /\n/.test(brut)
      ? brut.split(/\r?\n/)
      : brut.includes(';')
        ? brut.split(/;\s*/)
        : brut.split(/,\s+(?=[A-ZÀ-Ý])/)
  )
    .map((l) =>
      l
        .replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?\]|étape\s*\d+\s*:)\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120),
    )
    .filter(Boolean);
  return lignes.slice(0, TACHES_MAX).map((texte) => ({ texte, faite: false }));
}

/** Index de la tâche en cours (la première pas faite), ou -1 si tout est fait. */
export function tacheEnCours(plan: Tache[]): number {
  return plan.findIndex((t) => !t.faite);
}

/** Coche la tâche en cours. */
export function cocherSuivante(plan: Tache[]): Tache[] {
  const i = tacheEnCours(plan);
  return i < 0 ? plan : plan.map((t, j) => (j === i ? { ...t, faite: true } : t));
}

/** Résumé pour le modèle après une mise à jour du plan. */
export function resumePlan(plan: Tache[]): string {
  const i = tacheEnCours(plan);
  const liste = plan.map((t, j) => `${t.faite ? '[x]' : '[ ]'} ${j + 1}. ${t.texte}`).join('\n');
  return i < 0
    ? `${liste}\nToutes les tâches sont faites : donne maintenant le résultat final.`
    : `${liste}\nTâche en cours : ${i + 1}. ${plan[i].texte}. Fais-la, puis appelle tache_faite.`;
}
