/**
 * Contrat entre l'application Six et l'API pour « répondre à une conversation ».
 * Validé des deux côtés : l'app ne peut pas envoyer n'importe quoi, et n'affiche que des
 * réponses conformes.
 */
import * as z from 'zod/mini';
import { LanguageSchema, ReplySuggestionsSchema, ToneSchema } from './replies.js';

/** Plafond d'une conversation masquée envoyée au serveur (~les 40 derniers messages). */
export const MAX_CONVERSATION_SENT = 6000;

/** Longueur voulue des brouillons. « moyen » suit la façon d'écrire de l'utilisateur. */
export const LONGUEURS = ['court', 'moyen', 'detaille'] as const;
export const LongueurSchema = z.enum(LONGUEURS);
export type Longueur = z.infer<typeof LongueurSchema>;

/**
 * Moteur choisi par l'utilisateur (écran « Moteur de Six »). Les clés restent sur le serveur.
 * - auto : le meilleur équilibre (Claude Haiku, ou le serveur local si pas de clé) ;
 * - qualite : le modèle le plus fin (Claude Sonnet) ;
 * - rapide : le plus léger ;
 * - confidentiel : uniquement le serveur de Seven.AI (Ollama), rien ne part chez un tiers.
 */
export const MOTEURS = ['auto', 'qualite', 'rapide', 'confidentiel'] as const;
export const MoteurSchema = z.enum(MOTEURS);
export type Moteur = z.infer<typeof MoteurSchema>;

const count = z.number().check(z.int(), z.minimum(0), z.maximum(10_000_000));

/** Fiche de style : uniquement des nombres et des marqueurs d'une liste fermée. */
export const StyleProfileSchema = z.object({
  version: z.literal(1),
  messages: count,
  mots: count,
  tutoiement: count,
  vouvoiement: count,
  avecEmoji: count,
  motsLingala: count,
  sansMajuscule: count,
  marqueurs: z.record(z.string().check(z.maxLength(12)), count),
  choix: z.record(z.string().check(z.maxLength(30)), count),
});

export const ReplyApiRequestSchema = z.object({
  /** Conversation DÉJÀ masquée sur le téléphone. */
  conversation: z.string().check(z.minLength(1), z.maxLength(MAX_CONVERSATION_SENT)),
  ton: z._default(ToneSchema, 'naturel'),
  langue: z._default(LanguageSchema, 'fr'),
  /** Nom (ou remplaçant) de l'utilisateur dans le fil. */
  moi: z.optional(z.string().check(z.maxLength(80))),
  objectif: z.optional(z.string().check(z.maxLength(300))),
  /** Réponse à la question posée pendant l'analyse (« Le dossier est-il prêt ? » → « Non »). */
  precision: z.optional(z.string().check(z.maxLength(200))),
  longueur: z._default(LongueurSchema, 'moyen'),
  moteur: z._default(MoteurSchema, 'auto'),
  style: z.optional(StyleProfileSchema),
});
export type ReplyApiRequest = z.input<typeof ReplyApiRequestSchema>;

export const ScamLevelSchema = z.enum(['aucun', 'faible', 'moyen', 'eleve']);

export const ReplyApiResponseSchema = z.object({
  resume: ReplySuggestionsSchema.shape.resume,
  reponses: ReplySuggestionsSchema.shape.reponses,
  reflexion: z.optional(
    z.object({
      relation: z.optional(z.string()),
      ressenti: z.optional(z.string()),
      demande: z.optional(z.string()),
      non_dit: z.optional(z.string()),
      enjeu: z.optional(z.string()),
      registre: z.optional(z.enum(['tu', 'vous'])),
    }),
  ),
  arnaque: z.object({ niveau: ScamLevelSchema, raisons: z.array(z.string()) }),
  interlocuteur: z.optional(z.string()),
  /** Arnaque certaine : réponses sûres écrites par l'agent, sans IA. */
  bouclier: z.boolean(),
  /** Le modèle a échoué : réponses de secours. */
  secours: z.boolean(),
  /** Défauts que l'agent n'a pas pu corriger (à montrer à l'utilisateur, pas à cacher). */
  avertissements: z.array(z.object({ brouillon: z.number(), message: z.string() })),
  version: z.string(),
  modele: z.string(),
  ms: z.number(),
});
export type ReplyApiResponse = z.infer<typeof ReplyApiResponseSchema>;

/** « Utile oui/non » : jamais de texte de conversation, jamais de brouillon. */
export const FeedbackSchema = z.object({
  utile: z.boolean(),
  /** Quel brouillon (0, 1, 2) a été copié, s'il y en a un. */
  brouillon: z.optional(z.number().check(z.int(), z.minimum(0), z.maximum(2))),
  version: z.string().check(z.maxLength(40)),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

// ————— Six 1.0 : parcours en 11 étapes et outils —————

const masked = z.string().check(z.minLength(1), z.maxLength(MAX_CONVERSATION_SENT));
const shortText = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));
const arnaqueSchema = z.object({ niveau: ScamLevelSchema, raisons: z.array(z.string()) });

export const TENSIONS = ['calme', 'pressant', 'tendu'] as const;

export const AnalyseRequestSchema = z.object({
  conversation: masked,
  moi: z.optional(z.string().check(z.maxLength(80))),
  langue: z._default(LanguageSchema, 'fr'),
  moteur: z._default(MoteurSchema, 'auto'),
});
export type AnalyseRequest = z.input<typeof AnalyseRequestSchema>;

export const AnalyseResponseSchema = z.object({
  resume: z.string(),
  /** Jauge Calme / Pressant / Tendu : un niveau, jamais un pourcentage. */
  tension: z.enum(TENSIONS),
  intention: z.string(),
  ton: z.string(),
  /** Ce que l'utilisateur peut vouloir obtenir, le plus probable en premier. */
  objectifs: z.array(z.string()).check(z.minLength(2), z.maxLength(4)),
  /** Une seule question, et seulement si une information manque vraiment. */
  question: z.optional(z.object({ texte: z.string(), options: z.array(z.string()) })),
  arnaque: arnaqueSchema,
  interlocuteur: z.optional(z.string()),
  bouclier: z.boolean(),
  secours: z.boolean(),
  version: z.string(),
  modele: z.string(),
  ms: z.number(),
});
export type AnalyseResponse = z.infer<typeof AnalyseResponseSchema>;

/** Retouches rapides de l'écran « Ajuste à ta façon ». */
export const AJUSTEMENTS = [
  'plus-court',
  'plus-ferme',
  'plus-doux',
  'moins-formel',
  'excuse',
  'emoji',
] as const;

export const AjusterRequestSchema = z.object({
  conversation: masked,
  /** Le brouillon à retoucher, masqué. */
  texte: shortText(1200),
  consigne: z.optional(z.enum(AJUSTEMENTS)),
  /** « Ou dis-le avec tes mots ». */
  libre: z.optional(shortText(200)),
  moi: z.optional(z.string().check(z.maxLength(80))),
  langue: z._default(LanguageSchema, 'fr'),
  moteur: z._default(MoteurSchema, 'auto'),
});
export type AjusterRequest = z.input<typeof AjusterRequestSchema>;

export const TexteResponseSchema = z.object({
  texte: z.string(),
  /** Défauts que l'agent n'a pas pu corriger. */
  avertissements: z.array(z.string()),
  secours: z.boolean(),
  modele: z.string(),
  ms: z.number(),
});
export type TexteResponse = z.infer<typeof TexteResponseSchema>;

/** Mode Coach : pourquoi ce brouillon marche (ou ce qu'il faut éviter). */
export const CoachRequestSchema = z.object({
  conversation: masked,
  texte: shortText(1200),
  moi: z.optional(z.string().check(z.maxLength(80))),
  moteur: z._default(MoteurSchema, 'auto'),
});
export type CoachRequest = z.input<typeof CoachRequestSchema>;

export const COACH_TYPES = ['assertif', 'empathique', 'clair', 'a-eviter'] as const;
export const CoachResponseSchema = z.object({
  points: z
    .array(z.object({ type: z.enum(COACH_TYPES), titre: z.string(), explication: z.string() }))
    .check(z.minLength(1), z.maxLength(4)),
  secours: z.boolean(),
  modele: z.string(),
  ms: z.number(),
});
export type CoachResponse = z.infer<typeof CoachResponseSchema>;

/** Vérificateur de ton : l'utilisateur écrit seul, Six dit comment ce sera reçu. */
export const TONS_PERCUS = ['chaleureux', 'neutre', 'sec', 'agressif'] as const;
export const TonRequestSchema = z.object({
  texte: shortText(1200),
  /** Le message auquel il répond, masqué (facultatif). */
  contexte: z.optional(z.string().check(z.maxLength(1200))),
  langue: z._default(LanguageSchema, 'fr'),
  moteur: z._default(MoteurSchema, 'auto'),
});
export type TonRequest = z.input<typeof TonRequestSchema>;

export const TonResponseSchema = z.object({
  percu: z.enum(TONS_PERCUS),
  explication: z.string(),
  /** Version plus juste, seulement si le ton risque d'être mal reçu. */
  version: z.optional(z.string()),
  signaux: z.array(z.string()),
  secours: z.boolean(),
  modele: z.string(),
  ms: z.number(),
});
export type TonResponse = z.infer<typeof TonResponseSchema>;

/** « Quoi dire ? » : lancer ou relancer une conversation. */
export const SUJETS = [
  'briser-la-glace',
  'reprendre-contact',
  'relancer',
  'souhaiter',
  'pro',
] as const;
export const SujetsRequestSchema = z.object({
  categorie: z.enum(SUJETS),
  /** Une phrase de contexte (masquée), ex. « ancien camarade de classe ». */
  contexte: z.optional(z.string().check(z.maxLength(200))),
  langue: z._default(LanguageSchema, 'fr'),
  moteur: z._default(MoteurSchema, 'auto'),
});
export type SujetsRequest = z.input<typeof SujetsRequestSchema>;

export const SujetsResponseSchema = z.object({
  sujets: z
    .array(z.object({ titre: z.string(), message: z.string() }))
    .check(z.minLength(1), z.maxLength(3)),
  secours: z.boolean(),
  modele: z.string(),
  ms: z.number(),
});
export type SujetsResponse = z.infer<typeof SujetsResponseSchema>;
