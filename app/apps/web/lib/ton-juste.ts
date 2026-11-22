// Le jeu du ton juste dans Six : niveaux, consigne et validation viennent du jeu lui-même (une seule source),
// l'appel à l'IA passe par callAI, donc par la clé, les fournisseurs et le plafond quotidien de Six.
import { ALL_LEVELS } from '../../../jeu-du-ton-juste/client/src/data/levels.js';
import { SYSTEM_PROMPT, buildUserPrompt } from '../../../jeu-du-ton-juste/server/prompts.js';
import { lireRequete } from '../../../jeu-du-ton-juste/server/validation.js';
import { ProviderError, callAI } from './ai';

export type Niveau = (typeof ALL_LEVELS)[number];

export interface Evaluation {
  score: number;
  feedback: string;
  points_forts: string[];
  axes_amelioration: string[];
}

// Le serveur autonome du jeu impose ce format par les sorties structurées ; callAI renvoie du texte, on le demande donc ici.
const FORMAT = `

Réponds uniquement par un objet JSON, sans texte autour :
{"score": <entier de 0 à 100>, "feedback": "<2 à 4 phrases>", "points_forts": ["<1 à 3 éléments>"], "axes_amelioration": ["<1 à 3 éléments>"]}`;

/** Ce que le navigateur peut envoyer : un numéro de niveau connu et une réponse de 1 à 4000 caractères. */
export function lireDemande(
  body: unknown,
): { level: Niveau; playerAnswer: string } | { erreur: string } {
  return lireRequete(body, ALL_LEVELS);
}

const liste = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, 5)
    : [];

/** Lit la note rendue par l'IA. Refuse une réponse sans note ni avis, pour qu'elle soit redemandée une fois. */
export function lireEvaluation(text: string): Evaluation {
  const debut = text.indexOf('{');
  const fin = text.lastIndexOf('}');
  if (debut === -1 || fin <= debut) throw new Error('Réponse IA sans JSON');
  const d = JSON.parse(text.slice(debut, fin + 1)) as Record<string, unknown>;
  const score = Number(d.score);
  if (!Number.isFinite(score) || typeof d.feedback !== 'string' || !d.feedback.trim())
    throw new Error('Évaluation incomplète');
  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    feedback: d.feedback.trim(),
    points_forts: liste(d.points_forts),
    axes_amelioration: liste(d.axes_amelioration),
  };
}

export async function evaluer(level: Niveau, playerAnswer: string): Promise<Evaluation> {
  const user = buildUserPrompt({
    scenario: level.scenario,
    playerAnswer,
    criteria: level.criteria,
  });
  // Une nouvelle demande si le JSON est illisible ; une panne du fournisseur n'est pas relancée (callAI gère le repli).
  for (let essai = 0; essai < 2; essai++) {
    const texte = await callAI('redaction', SYSTEM_PROMPT + FORMAT, user, 4000);
    try {
      return lireEvaluation(texte);
    } catch {
      /* JSON invalide : on redemande une fois */
    }
  }
  throw new ProviderError("L'évaluation de Six était illisible. Réessaie.");
}
