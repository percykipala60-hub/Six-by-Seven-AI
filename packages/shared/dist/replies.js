import * as z from 'zod/mini';
/** « naturel » : le ton habituel de l'utilisateur avec cette personne (choix par défaut). */
export const TONES = [
    'naturel',
    'amical',
    'professionnel',
    'ferme',
    'chaleureux',
    'court',
];
export const LANGUAGES = ['fr', 'en', 'ln'];
export const ToneSchema = z.enum(TONES);
export const LanguageSchema = z.enum(LANGUAGES);
/** Ce que l'IA doit renvoyer : un résumé, puis exactement 3 propositions. L'humain choisit. */
export const ReplySuggestionsSchema = z.object({
    resume: z.string().check(z.minLength(1), z.maxLength(600)),
    reponses: z
        .array(z.object({
        style: z.string().check(z.minLength(1), z.maxLength(40)),
        texte: z.string().check(z.minLength(1), z.maxLength(1200)),
    }))
        .check(z.length(3)),
});
//# sourceMappingURL=replies.js.map