import { z } from 'zod';
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

export const ChatBodySchema = z.object({
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
