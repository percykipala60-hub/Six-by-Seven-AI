import { z } from 'zod';
import { CapacitesSchema } from './capacites';
import { parseStyle } from './prompt';
import { CANAUX, LONGUEURS, MAX_CHARS, SITUATIONS, TONS } from './types';

// Les champs libres sont tronqués, pas rejetés : le client assemble parfois des consignes plus longues.
const texte = (max: number) =>
  z
    .string()
    .trim()
    .transform((s) => s.slice(0, max));
const requis = (max: number) => texte(max).pipe(z.string().min(1));

const conversation = z.string().trim().min(1).max(MAX_CHARS);

export const AnalyseBodySchema = z.object({ conversation });

export const RepliesBodySchema = z.object({
  conversation,
  objectif: requis(120),
  ton: z.enum(TONS),
  longueur: z.enum(LONGUEURS),
  precision: texte(300).optional(),
  // Style venu du localStorage : normalisé (bornes, 5 expressions de 40 caractères) plutôt que refusé.
  style: z.unknown().optional().transform(parseStyle),
  // Réseau inconnu : ignoré, Six garde la forme de la conversation.
  canal: z.enum(CANAUX).optional().catch(undefined),
});

export const AdjustBodySchema = z.object({
  reponse: z.string().trim().min(1).max(1500),
  consigne: requis(200),
});

export const TopicsBodySchema = z.object({
  situation: z.enum(SITUATIONS),
  contexte: texte(200).optional(),
});

// Seven AI : historique borné (40 messages) pour rester raisonnable côté coûts. Le contenu d'un
// message monte à 20 000 caractères : un document importé (texte ou PDF) peut être long.
export const CHAT_MAX_MESSAGES = 40;
export const CHAT_MAX_CONTENT = 20_000;
export const CHAT_MAX_BYTES = 20_000;

/**
 * Images jointes au dernier message du Chat (JPEG compressés côté app, en base64) : une capture du navigateur de Six,
 * ou les images extraites d'une vidéo. 8 images au plus, 3 Mo en tout.
 */
export const CHAT_IMAGE_MAX = 1_500_000;
export const CHAT_IMAGES_MAX = 8;
export const CHAT_IMAGES_TOTAL_MAX = 3_000_000;
export const CHAT_MAX_BYTES_AVEC_IMAGE = CHAT_MAX_BYTES + CHAT_IMAGES_TOTAL_MAX + 2_000;
export const ImageJointeSchema = z.object({
  type: z.enum(['image/jpeg', 'image/png']),
  data: z
    .string()
    .min(100)
    .max(CHAT_IMAGE_MAX)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export type ImageJointe = z.infer<typeof ImageJointeSchema>;

export const ChatBodySchema = z.object({
  navigateurSession: z.string().uuid().optional(),
  projetId: z.string().uuid().optional(),
  /** Espace de la discussion : absent = Chat ; « sixtouch » = consignes d'agent de travail. */
  mode: z.enum(['chat', 'sixtouch']).optional(),
  /** Mode vocal : réponse orale courte, sans relecture (elle doublerait l'attente). */
  vocal: z.boolean().optional(),
  /** Chat de l'app de bureau : le navigateur interne est là, Six peut le piloter pour une demande web. */
  navigateur: z.boolean().optional(),
  /** App de bureau : Six peut piloter l'ordinateur (l'app demande l'accord de la personne pour chaque application). */
  ordinateur: z.boolean().optional(),
  skill: z
    .enum(['auto', 'documents', 'code', 'web', 'presentations', 'donnees', 'images'])
    .optional(),
  /** Cosinus : capacités choisies dans Réglages → Capacités (absentes : tout est permis). */
  capacites: CapacitesSchema.optional(),
  /** Cosinus : dossier de l'environnement de la discussion (chemin absolu, vérifié côté serveur). */
  dossier: z.string().max(400).optional(),
  /** Cosinus : autres dossiers de l'environnement (lecture seule, vérifiés côté serveur). */
  dossiersLecture: z.array(z.string().max(400)).max(8).optional(),
  /** Cosinus dans le Cloud : environnement cloud (identifiant, ou « auto » : choisi selon le dépôt cité). */
  cloud: z
    .string()
    .regex(/^(auto|[0-9a-f-]{36})$/)
    .optional(),
  images: z
    .array(ImageJointeSchema)
    .max(CHAT_IMAGES_MAX)
    .refine((l) => l.reduce((n, i) => n + i.data.length, 0) <= CHAT_IMAGES_TOTAL_MAX)
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(CHAT_MAX_CONTENT),
      }),
    )
    .min(1)
    .max(CHAT_MAX_MESSAGES)
    .refine((messages) => messages.at(-1)?.role === 'user'),
});

/** Transaction signée par l'App Store (JWS StoreKit 2), envoyée par l'app iPhone après un achat. */
export const AchatAppleBodySchema = z.object({
  jws: z
    .string()
    .min(100)
    .max(20_000)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
});
