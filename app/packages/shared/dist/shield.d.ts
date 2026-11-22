/**
 * Bouclier anti-arnaque : quand le risque est élevé, les réponses sont écrites ici, sans IA.
 * Partagé avec l'application : une arnaque certaine se traite sur le téléphone, sans réseau.
 */
import type { ReplySuggestions } from './replies.js';
export declare const SAFE_SCAM_DRAFTS: ReplySuggestions['reponses'];
/** Réponses sûres choisies selon le type d'arnaque, pour qu'elles aient l'air humaines. */
export declare function shieldDrafts(regles: string[]): ReplySuggestions;
