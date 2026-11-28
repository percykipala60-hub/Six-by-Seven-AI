import type { ActionAgent } from './actions-agent';
import type { LieuCarte } from './carte-rdc';
export const MAX_CHARS = 2000;

export const TONS = ['amical', 'professionnel', 'ferme', 'court', 'chaleureux'] as const;
export type Ton = (typeof TONS)[number];

export const LONGUEURS = ['courte', 'moyenne', 'detaillee'] as const;
export type Longueur = (typeof LONGUEURS)[number];

/** Réseau où la réponse sera envoyée : il change la forme (longueur, emojis, formules), pas le ton demandé. */
export const CANAUX = [
  'whatsapp',
  'sms',
  'messenger',
  'facebook',
  'instagram',
  'tiktok',
  'telegram',
  'linkedin',
  'email',
  'x',
] as const;
export type Canal = (typeof CANAUX)[number];

export interface Arnaque {
  score: number; // 0 à 100
  raisons: string[];
}

/** Passage à ne pas prendre au premier degré (humour, formule de politesse, code culturel, emoji…). */
export interface Nuance {
  expression: string; // citation courte de la conversation
  premier_degre: string; // ce qu'on comprendrait au pied de la lettre
  sens_probable: string; // ce que la personne veut sans doute dire
}

export interface Analysis {
  resume: string;
  intention: string;
  ton_detecte: string;
  tension: number; // 0 à 100
  arnaque: Arnaque;
  objectifs: string[];
  question: string | null;
  nuances: Nuance[];
  demo: boolean; // vrai quand le faux modèle de démonstration a répondu
}

export interface RepliesResult {
  reponses: [string, string, string];
  demo: boolean;
}

export interface AdjustResult {
  reponse: string;
  demo: boolean;
}

/** Style d'écriture réglé par l'utilisateur, gardé sur son téléphone et envoyé seulement comme consigne. */
export interface UserStyle {
  decontracte: number; // 0 = très formel, 100 = très décontracté
  detaille: number; // 0 = très court, 100 = très détaillé
  emojis: boolean;
  expressions: string[];
}

export const SITUATIONS = [
  'Briser la glace',
  'Reprendre contact',
  'Relancer',
  'Souhaiter',
  'Professionnel',
] as const;
export type Situation = (typeof SITUATIONS)[number];

export interface TopicsResult {
  sujets: string[];
  demo: boolean;
}

export interface RepliesInput {
  conversation: string;
  objectif: string;
  ton: Ton;
  longueur: Longueur;
  precision?: string;
  style?: UserStyle;
  canal?: Canal;
}

/** Pièce jointe montrée dans le Chat (carré d'aperçu) : jamais envoyée telle quelle au serveur. */
export interface PieceAffichee {
  genre: 'capture' | 'image' | 'video' | 'document';
  nom: string;
  /** Petite image JPEG (data URL) : la capture, l'image, la première image de la vidéo. */
  apercu?: string;
  /** Chemin complet du fichier sur l'ordinateur (app de bureau), montré sur la carte à la place du nom. */
  chemin?: string;
  /** Début d'un texte collé, montré sur la carte. */
  extrait?: string;
}

export interface UsageJetons {
  entree: number;
  sortie: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  usage?: UsageJetons;
  modele?: string;
  /** Pièces jointes du message, pour l'affichage seulement (retirées avant l'envoi au serveur). */
  pieces?: PieceAffichee[];
  /** Cosinus : ce que l'agent a fait (« Six lit … ») et les fichiers qu'il a enregistrés. Affichage seulement. */
  etapes?: string[];
  /** Les mêmes étapes au format commun (lib/actions-agent.ts) : lignes compactes, réussite ou échec. */
  actions?: ActionAgent[];
  fichiers?: string[];
  /** Chat : lieux trouvés dans OpenStreetMap, montrés sur une carte sous la réponse. Affichage seulement. */
  lieux?: LieuCarte[];
  /** Cosinus : la liste de tâches de l'agent, cochées une à une (lib/agent/plan.ts). */
  plan?: { texte: string; faite: boolean }[];
  /** Moment de l'envoi (ms). */
  date?: number;
  /** Question modifiée ou relancée : les autres versions de la suite de la discussion (lib/versions.ts). */
  precedentes?: ChatMessage[][];
  suivantes?: ChatMessage[][];
}

export interface ChatResult {
  reponse: string;
  demo: boolean;
  usage?: UsageJetons;
  modele?: string;
  lieux?: LieuCarte[];
}
