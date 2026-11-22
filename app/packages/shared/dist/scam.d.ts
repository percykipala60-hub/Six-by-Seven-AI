/**
 * Détecteur d'arnaques par règles, sans IA : instantané, gratuit, hors ligne, et il ne
 * « hallucine » jamais. Il couvre les schémas connus à Kinshasa (faux agent Mobile Money,
 * code PIN, urgence, secret, faux recrutement, bourse fictive, lien raccourci). L'IA ne
 * vient qu'en complément, pour les cas nouveaux.
 */
export type ScamLevel = 'aucun' | 'faible' | 'moyen' | 'eleve';
export interface ScamReport {
    niveau: ScamLevel;
    /** Raisons lisibles par l'utilisateur, sans pourcentage. */
    raisons: string[];
    score: number;
    /** Identifiants des règles touchées (« code », « gain »…), pour choisir la bonne réponse. */
    regles: string[];
}
/** Minuscules, sans accents, espaces simplifiés : « Bloqué » et « bloque » se lisent pareil. */
export declare function normalize(text: string): string;
/** Un auteur qui s'affiche comme un numéro est inconnu du téléphone. */
export declare function looksLikePhoneNumber(author: string | undefined): boolean;
/**
 * Analyse les messages REÇUS (jamais ceux de l'utilisateur).
 * Combinaisons qui suffisent seules à un risque élevé : code + argent, menace ou urgence ;
 * frais + offre ou gain ; gain + envoi d'argent ; « nouveau numéro » + envoi d'argent.
 */
export declare function detectScam(messages: string[], fromUnknownNumber?: boolean): ScamReport;
