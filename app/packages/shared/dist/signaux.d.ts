export type TonPercu = 'chaleureux' | 'neutre' | 'sec' | 'agressif';
/** Signaux de tension lisibles par du code : ils fixent un minimum, l'IA ne peut pas les ignorer. */
export declare function tensionSignals(texts: string[]): 'calme' | 'pressant' | 'tendu';
export declare const INSULTES: RegExp;
/** Signaux de ton lisibles par du code, montrés à l'utilisateur. */
export declare function toneSignals(texte: string): {
    signaux: string[];
    minimum: TonPercu;
};
