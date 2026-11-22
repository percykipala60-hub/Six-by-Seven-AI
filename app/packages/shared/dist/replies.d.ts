import * as z from 'zod/mini';
/** « naturel » : le ton habituel de l'utilisateur avec cette personne (choix par défaut). */
export declare const TONES: readonly ["naturel", "amical", "professionnel", "ferme", "chaleureux", "court"];
export declare const LANGUAGES: readonly ["fr", "en", "ln"];
export declare const ToneSchema: z.ZodMiniEnum<{
    naturel: "naturel";
    amical: "amical";
    professionnel: "professionnel";
    ferme: "ferme";
    chaleureux: "chaleureux";
    court: "court";
}>;
export declare const LanguageSchema: z.ZodMiniEnum<{
    fr: "fr";
    en: "en";
    ln: "ln";
}>;
/** Ce que l'IA doit renvoyer : un résumé, puis exactement 3 propositions. L'humain choisit. */
export declare const ReplySuggestionsSchema: z.ZodMiniObject<{
    resume: z.ZodMiniString<string>;
    reponses: z.ZodMiniArray<z.ZodMiniObject<{
        style: z.ZodMiniString<string>;
        texte: z.ZodMiniString<string>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Tone = z.infer<typeof ToneSchema>;
export type Language = z.infer<typeof LanguageSchema>;
export type ReplySuggestions = z.infer<typeof ReplySuggestionsSchema>;
