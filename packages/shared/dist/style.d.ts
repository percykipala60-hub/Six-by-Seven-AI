/** Marqueurs fréquents à Kinshasa, en français familier et en lingala. Liste fermée. */
declare const MARKERS: readonly ["frere", "soeur", "bro", "stp", "svp", "mdr", "lol", "ok", "okay", "merci", "desole", "pardon", "mbote", "boni", "ndeko", "yaya", "leki", "mama", "papa", "nzambe", "malamu", "sango", "kaka", "tika", "yaka", "nayebi", "eza", "ngai", "yo", "biso", "lobi", "lelo", "mbongo", "mosala"];
export interface StyleProfile {
    version: 1;
    messages: number;
    mots: number;
    tutoiement: number;
    vouvoiement: number;
    avecEmoji: number;
    motsLingala: number;
    sansMajuscule: number;
    marqueurs: Partial<Record<(typeof MARKERS)[number], number>>;
    /** Styles de brouillon choisis par l'utilisateur (« Rassurante », « Directe »…). */
    choix: Record<string, number>;
}
export declare function emptyProfile(): StyleProfile;
/** Ajoute les messages de l'utilisateur à sa fiche (sans rien garder du texte). */
export declare function learnStyle(profile: StyleProfile, ownMessages: string[]): StyleProfile;
/** Retient le type de brouillon choisi (jamais son texte). */
export declare function learnChoice(profile: StyleProfile, style: string): StyleProfile;
export declare function averageWords(profile: StyleProfile): number;
/** Consignes de style pour le modèle, en clair. Vide tant qu'on connaît moins de 5 messages. */
export declare function describeStyle(profile: StyleProfile, name: string): string;
export {};
