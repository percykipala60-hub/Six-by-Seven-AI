/**
 * « Quoi dire ? » hors ligne : des idées prêtes, sans IA, pour lancer ou relancer une
 * conversation. L'IA les personnalise quand le réseau est là ; sinon, ces idées suffisent.
 */
export declare const SUJETS_LABELS: {
    readonly 'briser-la-glace': "Briser la glace";
    readonly 'reprendre-contact': "Reprendre contact";
    readonly relancer: "Relancer";
    readonly souhaiter: "Souhaiter";
    readonly pro: "Pro";
};
export type SujetCategorie = keyof typeof SUJETS_LABELS;
export declare const SUJETS_SECOURS: Record<SujetCategorie, {
    titre: string;
    message: string;
}[]>;
