export type SensitiveKind = 'nom' | 'tel' | 'email' | 'num';
export interface SensitiveSpan {
    start: number;
    end: number;
    kind: SensitiveKind;
    value: string;
    /** D'où vient la détection, pour l'expliquer à l'utilisateur. */
    source: 'participant' | 'dictionnaire' | 'ajout' | 'motif';
}
export interface MaskResult {
    masked: string;
    /** « [NOM 1] » → « Mariane ». Reste sur le téléphone. */
    table: Record<string, string>;
}
/**
 * Prénoms et noms fréquents à Kinshasa et en RDC. Les prénoms qui sont aussi des mots courants
 * (Grâce, Divine, Prince, Patient, Gloire, Trésor, Merveille, Espoir…) sont volontairement
 * absents : les masquer casserait des phrases comme « Grâce à toi ».
 */
export declare const CONGOLESE_NAMES: readonly string[];
export interface FindOptions {
    /** Noms que l'utilisateur ajoute lui-même. */
    extraNames?: string[];
    /**
     * 2e passe serveur : seulement les motifs objectifs (numéros, e-mails). Les noms ont déjà été
     * vérifiés par l'utilisateur sur son téléphone ; on ne revient pas sur ses choix.
     */
    patternsOnly?: boolean;
}
/** Tout ce qui semble sensible, dans l'ordre du texte, sans chevauchement. */
export declare function findSensitive(text: string, options?: FindOptions): SensitiveSpan[];
/**
 * Remplace les éléments retenus. `ignored` : index des éléments que l'utilisateur a décochés.
 * La numérotation continue après les remplaçants déjà présents (2e passe sans collision).
 */
export declare function applyMask(text: string, spans: SensitiveSpan[], ignored?: ReadonlySet<number>): MaskResult;
export declare function maskConversation(text: string, options?: FindOptions): MaskResult;
/** Sur le téléphone : remet les vrais noms dans un brouillon. */
export declare function unmask(text: string, table: Readonly<Record<string, string>>): string;
/** Vrai si le texte est un remplaçant posé par le masquage (« [TEL 1] »). */
export declare function isMaskTag(text: string | undefined): boolean;
/**
 * Sur le téléphone : l'utilisateur a modifié un brouillon (avec les vrais noms) et demande une
 * retouche. On remet les remplaçants avant l'envoi : le serveur ne voit toujours pas les noms.
 */
export declare function remask(text: string, table: Readonly<Record<string, string>>): string;
