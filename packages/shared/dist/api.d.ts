/**
 * Contrat entre l'application Six et l'API pour « répondre à une conversation ».
 * Validé des deux côtés : l'app ne peut pas envoyer n'importe quoi, et n'affiche que des
 * réponses conformes.
 */
import * as z from 'zod/mini';
/** Plafond d'une conversation masquée envoyée au serveur (~les 40 derniers messages). */
export declare const MAX_CONVERSATION_SENT = 6000;
/** Longueur voulue des brouillons. « moyen » suit la façon d'écrire de l'utilisateur. */
export declare const LONGUEURS: readonly ["court", "moyen", "detaille"];
export declare const LongueurSchema: z.ZodMiniEnum<{
    court: "court";
    moyen: "moyen";
    detaille: "detaille";
}>;
export type Longueur = z.infer<typeof LongueurSchema>;
/**
 * Moteur choisi par l'utilisateur (écran « Moteur de Six »). Les clés restent sur le serveur.
 * - auto : le meilleur équilibre (Claude Haiku, ou le serveur local si pas de clé) ;
 * - qualite : le modèle le plus fin (Claude Sonnet) ;
 * - rapide : le plus léger ;
 * - confidentiel : uniquement le serveur de Seven.AI (Ollama), rien ne part chez un tiers.
 */
export declare const MOTEURS: readonly ["auto", "qualite", "rapide", "confidentiel"];
export declare const MoteurSchema: z.ZodMiniEnum<{
    auto: "auto";
    qualite: "qualite";
    rapide: "rapide";
    confidentiel: "confidentiel";
}>;
export type Moteur = z.infer<typeof MoteurSchema>;
/** Fiche de style : uniquement des nombres et des marqueurs d'une liste fermée. */
export declare const StyleProfileSchema: z.ZodMiniObject<{
    version: z.ZodMiniLiteral<1>;
    messages: z.ZodMiniNumber<number>;
    mots: z.ZodMiniNumber<number>;
    tutoiement: z.ZodMiniNumber<number>;
    vouvoiement: z.ZodMiniNumber<number>;
    avecEmoji: z.ZodMiniNumber<number>;
    motsLingala: z.ZodMiniNumber<number>;
    sansMajuscule: z.ZodMiniNumber<number>;
    marqueurs: z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniNumber<number>>;
    choix: z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniNumber<number>>;
}, z.core.$strip>;
export declare const ReplyApiRequestSchema: z.ZodMiniObject<{
    conversation: z.ZodMiniString<string>;
    ton: z.ZodMiniDefault<z.ZodMiniEnum<{
        naturel: "naturel";
        amical: "amical";
        professionnel: "professionnel";
        ferme: "ferme";
        chaleureux: "chaleureux";
        court: "court";
    }>>;
    langue: z.ZodMiniDefault<z.ZodMiniEnum<{
        fr: "fr";
        en: "en";
        ln: "ln";
    }>>;
    moi: z.ZodMiniOptional<z.ZodMiniString<string>>;
    objectif: z.ZodMiniOptional<z.ZodMiniString<string>>;
    precision: z.ZodMiniOptional<z.ZodMiniString<string>>;
    longueur: z.ZodMiniDefault<z.ZodMiniEnum<{
        court: "court";
        moyen: "moyen";
        detaille: "detaille";
    }>>;
    moteur: z.ZodMiniDefault<z.ZodMiniEnum<{
        auto: "auto";
        qualite: "qualite";
        rapide: "rapide";
        confidentiel: "confidentiel";
    }>>;
    style: z.ZodMiniOptional<z.ZodMiniObject<{
        version: z.ZodMiniLiteral<1>;
        messages: z.ZodMiniNumber<number>;
        mots: z.ZodMiniNumber<number>;
        tutoiement: z.ZodMiniNumber<number>;
        vouvoiement: z.ZodMiniNumber<number>;
        avecEmoji: z.ZodMiniNumber<number>;
        motsLingala: z.ZodMiniNumber<number>;
        sansMajuscule: z.ZodMiniNumber<number>;
        marqueurs: z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniNumber<number>>;
        choix: z.ZodMiniRecord<z.ZodMiniString<string>, z.ZodMiniNumber<number>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ReplyApiRequest = z.input<typeof ReplyApiRequestSchema>;
export declare const ScamLevelSchema: z.ZodMiniEnum<{
    moyen: "moyen";
    aucun: "aucun";
    faible: "faible";
    eleve: "eleve";
}>;
export declare const ReplyApiResponseSchema: z.ZodMiniObject<{
    resume: z.ZodMiniString<string>;
    reponses: z.ZodMiniArray<z.ZodMiniObject<{
        style: z.ZodMiniString<string>;
        texte: z.ZodMiniString<string>;
    }, z.core.$strip>>;
    reflexion: z.ZodMiniOptional<z.ZodMiniObject<{
        relation: z.ZodMiniOptional<z.ZodMiniString<string>>;
        ressenti: z.ZodMiniOptional<z.ZodMiniString<string>>;
        demande: z.ZodMiniOptional<z.ZodMiniString<string>>;
        non_dit: z.ZodMiniOptional<z.ZodMiniString<string>>;
        enjeu: z.ZodMiniOptional<z.ZodMiniString<string>>;
        registre: z.ZodMiniOptional<z.ZodMiniEnum<{
            tu: "tu";
            vous: "vous";
        }>>;
    }, z.core.$strip>>;
    arnaque: z.ZodMiniObject<{
        niveau: z.ZodMiniEnum<{
            moyen: "moyen";
            aucun: "aucun";
            faible: "faible";
            eleve: "eleve";
        }>;
        raisons: z.ZodMiniArray<z.ZodMiniString<string>>;
    }, z.core.$strip>;
    interlocuteur: z.ZodMiniOptional<z.ZodMiniString<string>>;
    bouclier: z.ZodMiniBoolean<boolean>;
    secours: z.ZodMiniBoolean<boolean>;
    avertissements: z.ZodMiniArray<z.ZodMiniObject<{
        brouillon: z.ZodMiniNumber<number>;
        message: z.ZodMiniString<string>;
    }, z.core.$strip>>;
    version: z.ZodMiniString<string>;
    modele: z.ZodMiniString<string>;
    ms: z.ZodMiniNumber<number>;
}, z.core.$strip>;
export type ReplyApiResponse = z.infer<typeof ReplyApiResponseSchema>;
/** « Utile oui/non » : jamais de texte de conversation, jamais de brouillon. */
export declare const FeedbackSchema: z.ZodMiniObject<{
    utile: z.ZodMiniBoolean<boolean>;
    brouillon: z.ZodMiniOptional<z.ZodMiniNumber<number>>;
    version: z.ZodMiniString<string>;
}, z.core.$strip>;
export type Feedback = z.infer<typeof FeedbackSchema>;
export declare const TENSIONS: readonly ["calme", "pressant", "tendu"];
export declare const AnalyseRequestSchema: z.ZodMiniObject<{
    conversation: z.ZodMiniString<string>;
    moi: z.ZodMiniOptional<z.ZodMiniString<string>>;
    langue: z.ZodMiniDefault<z.ZodMiniEnum<{
        fr: "fr";
        en: "en";
        ln: "ln";
    }>>;
    moteur: z.ZodMiniDefault<z.ZodMiniEnum<{
        auto: "auto";
        qualite: "qualite";
        rapide: "rapide";
        confidentiel: "confidentiel";
    }>>;
}, z.core.$strip>;
export type AnalyseRequest = z.input<typeof AnalyseRequestSchema>;
export declare const AnalyseResponseSchema: z.ZodMiniObject<{
    resume: z.ZodMiniString<string>;
    tension: z.ZodMiniEnum<{
        calme: "calme";
        pressant: "pressant";
        tendu: "tendu";
    }>;
    intention: z.ZodMiniString<string>;
    ton: z.ZodMiniString<string>;
    objectifs: z.ZodMiniArray<z.ZodMiniString<string>>;
    question: z.ZodMiniOptional<z.ZodMiniObject<{
        texte: z.ZodMiniString<string>;
        options: z.ZodMiniArray<z.ZodMiniString<string>>;
    }, z.core.$strip>>;
    arnaque: z.ZodMiniObject<{
        niveau: z.ZodMiniEnum<{
            moyen: "moyen";
            aucun: "aucun";
            faible: "faible";
            eleve: "eleve";
        }>;
        raisons: z.ZodMiniArray<z.ZodMiniString<string>>;
    }, z.core.$strip>;
    interlocuteur: z.ZodMiniOptional<z.ZodMiniString<string>>;
    bouclier: z.ZodMiniBoolean<boolean>;
    secours: z.ZodMiniBoolean<boolean>;
    version: z.ZodMiniString<string>;
    modele: z.ZodMiniString<string>;
    ms: z.ZodMiniNumber<number>;
}, z.core.$strip>;
export type AnalyseResponse = z.infer<typeof AnalyseResponseSchema>;
/** Retouches rapides de l'écran « Ajuste à ta façon ». */
export declare const AJUSTEMENTS: readonly ["plus-court", "plus-ferme", "plus-doux", "moins-formel", "excuse", "emoji"];
export declare const AjusterRequestSchema: z.ZodMiniObject<{
    conversation: z.ZodMiniString<string>;
    texte: z.ZodMiniString<string>;
    consigne: z.ZodMiniOptional<z.ZodMiniEnum<{
        emoji: "emoji";
        "plus-court": "plus-court";
        "plus-ferme": "plus-ferme";
        "plus-doux": "plus-doux";
        "moins-formel": "moins-formel";
        excuse: "excuse";
    }>>;
    libre: z.ZodMiniOptional<z.ZodMiniString<string>>;
    moi: z.ZodMiniOptional<z.ZodMiniString<string>>;
    langue: z.ZodMiniDefault<z.ZodMiniEnum<{
        fr: "fr";
        en: "en";
        ln: "ln";
    }>>;
    moteur: z.ZodMiniDefault<z.ZodMiniEnum<{
        auto: "auto";
        qualite: "qualite";
        rapide: "rapide";
        confidentiel: "confidentiel";
    }>>;
}, z.core.$strip>;
export type AjusterRequest = z.input<typeof AjusterRequestSchema>;
export declare const TexteResponseSchema: z.ZodMiniObject<{
    texte: z.ZodMiniString<string>;
    avertissements: z.ZodMiniArray<z.ZodMiniString<string>>;
    secours: z.ZodMiniBoolean<boolean>;
    modele: z.ZodMiniString<string>;
    ms: z.ZodMiniNumber<number>;
}, z.core.$strip>;
export type TexteResponse = z.infer<typeof TexteResponseSchema>;
/** Mode Coach : pourquoi ce brouillon marche (ou ce qu'il faut éviter). */
export declare const CoachRequestSchema: z.ZodMiniObject<{
    conversation: z.ZodMiniString<string>;
    texte: z.ZodMiniString<string>;
    moi: z.ZodMiniOptional<z.ZodMiniString<string>>;
    moteur: z.ZodMiniDefault<z.ZodMiniEnum<{
        auto: "auto";
        qualite: "qualite";
        rapide: "rapide";
        confidentiel: "confidentiel";
    }>>;
}, z.core.$strip>;
export type CoachRequest = z.input<typeof CoachRequestSchema>;
export declare const COACH_TYPES: readonly ["assertif", "empathique", "clair", "a-eviter"];
export declare const CoachResponseSchema: z.ZodMiniObject<{
    points: z.ZodMiniArray<z.ZodMiniObject<{
        type: z.ZodMiniEnum<{
            assertif: "assertif";
            empathique: "empathique";
            clair: "clair";
            "a-eviter": "a-eviter";
        }>;
        titre: z.ZodMiniString<string>;
        explication: z.ZodMiniString<string>;
    }, z.core.$strip>>;
    secours: z.ZodMiniBoolean<boolean>;
    modele: z.ZodMiniString<string>;
    ms: z.ZodMiniNumber<number>;
}, z.core.$strip>;
export type CoachResponse = z.infer<typeof CoachResponseSchema>;
/** Vérificateur de ton : l'utilisateur écrit seul, Six dit comment ce sera reçu. */
export declare const TONS_PERCUS: readonly ["chaleureux", "neutre", "sec", "agressif"];
export declare const TonRequestSchema: z.ZodMiniObject<{
    texte: z.ZodMiniString<string>;
    contexte: z.ZodMiniOptional<z.ZodMiniString<string>>;
    langue: z.ZodMiniDefault<z.ZodMiniEnum<{
        fr: "fr";
        en: "en";
        ln: "ln";
    }>>;
    moteur: z.ZodMiniDefault<z.ZodMiniEnum<{
        auto: "auto";
        qualite: "qualite";
        rapide: "rapide";
        confidentiel: "confidentiel";
    }>>;
}, z.core.$strip>;
export type TonRequest = z.input<typeof TonRequestSchema>;
export declare const TonResponseSchema: z.ZodMiniObject<{
    percu: z.ZodMiniEnum<{
        chaleureux: "chaleureux";
        neutre: "neutre";
        sec: "sec";
        agressif: "agressif";
    }>;
    explication: z.ZodMiniString<string>;
    version: z.ZodMiniOptional<z.ZodMiniString<string>>;
    signaux: z.ZodMiniArray<z.ZodMiniString<string>>;
    secours: z.ZodMiniBoolean<boolean>;
    modele: z.ZodMiniString<string>;
    ms: z.ZodMiniNumber<number>;
}, z.core.$strip>;
export type TonResponse = z.infer<typeof TonResponseSchema>;
/** « Quoi dire ? » : lancer ou relancer une conversation. */
export declare const SUJETS: readonly ["briser-la-glace", "reprendre-contact", "relancer", "souhaiter", "pro"];
export declare const SujetsRequestSchema: z.ZodMiniObject<{
    categorie: z.ZodMiniEnum<{
        "briser-la-glace": "briser-la-glace";
        "reprendre-contact": "reprendre-contact";
        relancer: "relancer";
        souhaiter: "souhaiter";
        pro: "pro";
    }>;
    contexte: z.ZodMiniOptional<z.ZodMiniString<string>>;
    langue: z.ZodMiniDefault<z.ZodMiniEnum<{
        fr: "fr";
        en: "en";
        ln: "ln";
    }>>;
    moteur: z.ZodMiniDefault<z.ZodMiniEnum<{
        auto: "auto";
        qualite: "qualite";
        rapide: "rapide";
        confidentiel: "confidentiel";
    }>>;
}, z.core.$strip>;
export type SujetsRequest = z.input<typeof SujetsRequestSchema>;
export declare const SujetsResponseSchema: z.ZodMiniObject<{
    sujets: z.ZodMiniArray<z.ZodMiniObject<{
        titre: z.ZodMiniString<string>;
        message: z.ZodMiniString<string>;
    }, z.core.$strip>>;
    secours: z.ZodMiniBoolean<boolean>;
    modele: z.ZodMiniString<string>;
    ms: z.ZodMiniNumber<number>;
}, z.core.$strip>;
export type SujetsResponse = z.infer<typeof SujetsResponseSchema>;
