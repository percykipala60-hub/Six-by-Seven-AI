import { ProviderError, callAI, callChat, hasAI } from './ai';
import {
  analysisPrompt,
  adjustPrompt,
  parseAdjust,
  parseAnalysis,
  parseReplies,
  parseTopics,
  repliesPrompt,
  sevenAiSystem,
  topicsPrompt,
} from './prompt';
import { heuristicScam, mergeScam } from './scam';
import type {
  AdjustResult,
  Analysis,
  ChatMessage,
  ChatResult,
  RepliesInput,
  RepliesResult,
  Situation,
  Ton,
  TopicsResult,
} from './types';

export { ProviderError };

// Une nouvelle tentative si l'IA renvoie un JSON invalide (les modèles dérapent parfois).
async function withRetry<T>(call: () => Promise<string>, parse: (t: string) => T): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      return parse(await call());
    } catch (e) {
      // Une nouvelle tentative n'aide que si le modèle a renvoyé un JSON invalide ;
      // une panne fournisseur doit rester une seule tentative (avec le repli déjà géré par callAI).
      if (e instanceof ProviderError) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof ProviderError
    ? lastError
    : new ProviderError("La réponse de l'IA était invalide. Réessaie.");
}

export async function analyze(conversation: string): Promise<Analysis> {
  const local = heuristicScam(conversation);
  if (!hasAI()) return demoAnalysis(conversation, local);
  const { system, user } = analysisPrompt(conversation);
  const r = await withRetry(() => callAI('analyse', system, user, 1000), parseAnalysis);
  return { ...r, arnaque: mergeScam(local, r.arnaque), demo: false };
}

export async function replies(input: RepliesInput): Promise<RepliesResult> {
  if (!hasAI()) return { reponses: demoReplies(input.ton), demo: true };
  const { system, user } = repliesPrompt(input);
  const reponses = await withRetry(() => callAI('redaction', system, user, 4000), parseReplies);
  return { reponses, demo: false };
}

export async function adjust(reponse: string, consigne: string): Promise<AdjustResult> {
  if (!hasAI()) return { reponse: demoAdjust(reponse, consigne), demo: true };
  const { system, user } = adjustPrompt(reponse, consigne);
  const out = await withRetry(() => callAI('analyse', system, user, 400), parseAdjust);
  return { reponse: out, demo: false };
}

export async function topics(situation: Situation, contexte: string): Promise<TopicsResult> {
  if (!hasAI()) return { sujets: DEMO_TOPICS[situation], demo: true };
  const { system, user } = topicsPrompt(situation, contexte);
  const sujets = await withRetry(() => callAI('analyse', system, user, 400), parseTopics);
  return { sujets, demo: false };
}

/** Seven AI : le chatbot intégré. Conversation libre, multi-tours, identité connue du prompt système. */
export async function chat(messages: ChatMessage[]): Promise<ChatResult> {
  const user = messages[messages.length - 1]?.content ?? '';
  const history = messages.slice(0, -1);
  if (!hasAI()) return { reponse: demoChat(user), demo: true };
  const reponse = (await callChat(sevenAiSystem(), user, history, 1500)).trim();
  if (!reponse) throw new ProviderError('La réponse de Seven AI était vide. Réessaie.');
  return { reponse, demo: false };
}

function demoChat(question: string): string {
  const q = question.toLowerCase();
  const identite =
    /qui es-tu|qui es tu|t'appelles|t appelles|ton nom|c'est quoi six|c est quoi six|presente-toi|présente-toi/.test(
      q,
    );
  if (identite)
    return "Je suis Seven AI, l'assistant intégré de Six 😊 Six est l'app de la startup Seven.AI : tu y colles une conversation, elle est analysée (noms masqués, arnaques détectées, vrai sens expliqué) et Six te propose trois réponses. Il y a aussi des jeux : Kin Rush, Le jeu du ton juste et Coupe l'arnaque. (Mode démonstration : aucune IA connectée, ajoute une clé dans .env pour une vraie discussion.)";
  return "Mode démonstration : aucune IA n'est connectée, donc je ne peux pas vraiment discuter pour l'instant. Je suis Seven AI, l'assistant intégré de Six. Ajoute une clé API dans le fichier .env du serveur (Claude ou OpenAI) et je pourrai répondre à toutes tes questions, comme ChatGPT ou Claude.";
}

/* ---------- Faux modèle de démonstration (aucune clé) ---------- */

function demoAnalysis(conversation: string, scam: Analysis['arnaque']): Analysis {
  const pressed = /\b(urgent|avant \d+ ?h|vite|tout de suite|sinon|immédiat)/i.test(conversation);
  return {
    resume:
      "Démonstration : aucune IA n'est connectée, ce résumé est générique. Ajoute une clé dans .env pour une vraie analyse.",
    intention: pressed ? 'Obtenir quelque chose rapidement' : 'Échanger des nouvelles',
    ton_detecte: pressed ? 'Pressé' : 'Neutre',
    tension: pressed ? 62 : 0,
    arnaque: scam,
    objectifs: ['Gagner du temps', 'Dire non poliment', 'Calmer la pression'],
    question: null,
    nuances: [],
    demo: true,
  };
}

const DEMO: Record<Ton, [string, string, string]> = {
  amical: [
    "Salut ! Je m'en occupe et je te redis ça très vite 😉",
    'Ça marche, je te reviens vite !',
    'Merci de ta patience, je regarde ça dès que possible.',
  ],
  professionnel: [
    'Bonjour, je prends bien note de votre message et reviens vers vous dans les meilleurs délais.',
    'Bien reçu, je vous réponds rapidement.',
    "Merci pour votre message. Je m'en occupe et vous tiens informé.",
  ],
  ferme: [
    "J'ai bien lu ton message. Je ne pourrai pas le faire dans ce délai, je te propose un autre créneau.",
    'Non, pas dans ces conditions. Voici ce que je peux faire.',
    "Je préfère être clair : ce délai n'est pas tenable pour moi.",
  ],
  court: ['Bien reçu, je reviens vers toi.', "Ok, je m'en occupe.", 'Je te réponds vite.'],
  chaleureux: [
    "Merci beaucoup pour ton message ! Je m'en occupe avec plaisir et je reviens vers toi très vite.",
    'Avec plaisir, je te tiens au courant !',
    "Super, merci d'avoir pensé à moi. Je te réponds bientôt.",
  ],
};

const DEMO_TOPICS: Record<Situation, string[]> = {
  'Briser la glace': [
    'Demande-lui comment se passe sa semaine',
    "Parle d'un cours ou d'un projet que vous avez en commun",
    'Pose une question simple sur ses projets du week-end',
    "Partage quelque chose d'amusant que tu as vu aujourd'hui",
  ],
  'Reprendre contact': [
    'Dis-lui que tu as pensé à elle ou lui récemment',
    'Demande des nouvelles de sa famille ou de ses études',
    'Évoque un souvenir agréable que vous partagez',
    'Propose de vous appeler quand elle ou il aura le temps',
  ],
  Relancer: [
    'Rappelle ta dernière question en une phrase',
    'Propose un nouveau créneau plus simple',
    "Demande si elle ou il a besoin d'une information de ta part",
    'Dis que tu restes disponible sans mettre de pression',
  ],
  Souhaiter: [
    "Un souhait sincère et court pour l'occasion",
    'Rappelle un bon moment passé ensemble',
    'Ajoute une attention personnelle, sans exagérer',
    'Termine par une invitation à se voir bientôt',
  ],
  Professionnel: [
    'Résume ta demande en une phrase claire',
    'Propose une date précise pour le prochain échange',
    'Remercie pour le temps accordé',
    "Demande quelle forme de réponse l'arrangerait",
  ],
};

function demoReplies(ton: Ton): [string, string, string] {
  return DEMO[ton];
}

function demoAdjust(reponse: string, consigne: string): string {
  return `${reponse} (démonstration : consigne « ${consigne} » non appliquée sans IA)`;
}
