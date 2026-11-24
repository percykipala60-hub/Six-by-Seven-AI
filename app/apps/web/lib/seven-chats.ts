import { effacerArtefactsDuChat, effacerTousLesArtefacts, rangerArtefacts } from './artefacts';
import { memoireActive } from './memoire';
import type { ChatMessage } from './types';

/**
 * Discussions avec Seven AI, gardées sur l'appareil (jamais envoyées sur le compte).
 * Comme avant, rien n'est gardé quand la mémoire de Six est coupée.
 * Le menu latéral les liste (« Nouvelle discussion », puis les plus récentes) et l'écran
 * Seven AI ouvre celle demandée par l'adresse (`/chat?c=<id>`).
 */
/** Espace de la discussion : « chat » (discussion libre) ou « sixtouch » (travail avec l'agent). */
export type ModeChat = 'chat' | 'sixtouch';
export type ChatSeven = {
  id: string;
  titre: string;
  maj: number;
  messages: ChatMessage[];
  /** Absent pour les discussions d'avant Cosinus : ce sont des discussions du Chat. */
  mode?: ModeChat;
  /** Projet où la discussion est rangée (lib/projets.ts). */
  projet?: string;
};

const CLE = 'seven-ai-chats';
const ANCIENNE_CLE = 'seven-ai-chat'; // une seule discussion, avant la liste
const EVT = 'seven-chats';
const MAX_CHATS = 30;
export const MAX_MSG = 200;

function messagesValides(liste: unknown): ChatMessage[] {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === 'object' &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
        typeof (m as ChatMessage).content === 'string',
    )
    .slice(-MAX_MSG);
}

/** Titre d'une discussion : le début de la première question (sans l'icône de document). */
export function titreDe(messages: ChatMessage[]): string {
  const premiere = messages.find((m) => m.role === 'user')?.content ?? '';
  const t = premiere
    .replace(/^📄\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return 'Nouvelle discussion';
  return t.length > 42 ? `${t.slice(0, 41).trimEnd()}…` : t;
}

function ecrire(chats: ChatSeven[]) {
  try {
    localStorage.setItem(CLE, JSON.stringify(chats.slice(0, MAX_CHATS)));
  } catch {
    /* stockage plein ou bloqué : la discussion vaut pour cette visite */
  }
  window.dispatchEvent(new Event(EVT));
}

/** Les discussions, les plus récentes d'abord (vide si la mémoire est coupée). */
export function lireChats(): ChatSeven[] {
  if (typeof window === 'undefined' || !memoireActive()) return [];
  try {
    // Ancienne version : une seule discussion. On la reprend comme première de la liste.
    const ancienne = localStorage.getItem(ANCIENNE_CLE);
    if (ancienne !== null && localStorage.getItem(CLE) === null) {
      const messages = messagesValides(JSON.parse(ancienne));
      localStorage.setItem(
        CLE,
        JSON.stringify(
          messages.length
            ? [{ id: nouvelId(), titre: titreDe(messages), maj: Date.now(), messages }]
            : [],
        ),
      );
      localStorage.removeItem(ANCIENNE_CLE);
    }
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '[]') as unknown;
    if (!Array.isArray(brut)) return [];
    return brut
      .filter(
        (c): c is ChatSeven =>
          !!c && typeof c.id === 'string' && typeof c.maj === 'number' && Array.isArray(c.messages),
      )
      .map((c) => ({
        ...c,
        titre: typeof c.titre === 'string' ? c.titre : titreDe(c.messages),
        messages: messagesValides(c.messages),
        projet: typeof c.projet === 'string' && c.projet ? c.projet : undefined,
      }))
      .sort((a, b) => b.maj - a.maj)
      .slice(0, MAX_CHATS);
  } catch {
    return [];
  }
}

export function lireChat(id: string): ChatSeven | undefined {
  return lireChats().find((c) => c.id === id);
}

/**
 * Enregistre (ou met à jour) une discussion et la remonte en tête de liste. Sans `projet`, la discussion garde le
 * projet où elle était rangée.
 */
export function garderChat(
  id: string,
  messages: ChatMessage[],
  mode: ModeChat = 'chat',
  projet?: string,
): void {
  if (!memoireActive() || messages.length === 0) return;
  const chats = lireChats();
  const range = projet ?? chats.find((c) => c.id === id)?.projet;
  const chat: ChatSeven = {
    id,
    titre: titreDe(messages),
    maj: Date.now(),
    messages: messages.slice(-MAX_MSG),
    ...(mode === 'sixtouch' ? { mode } : {}),
    ...(range ? { projet: range } : {}),
  };
  ecrire([chat, ...chats.filter((c) => c.id !== id)]);
}

export function effacerChat(id: string): void {
  ecrire(lireChats().filter((c) => c.id !== id));
  effacerArtefactsDuChat(id);
}

/** Discussions rangées dans un projet, les plus récentes d'abord. */
export function chatsDuProjet(projet: string, chats = lireChats()): ChatSeven[] {
  return chats.filter((c) => c.projet === projet);
}

/** Range une discussion dans un projet, ou l'en sort (projet vide). Sa place dans la liste ne change pas. */
export function rangerChat(id: string, projet: string): void {
  const chats = lireChats();
  if (!chats.some((c) => c.id === id)) return;
  ecrire(
    chats.map((c) => {
      if (c.id !== id) return c;
      const reste = { ...c };
      delete reste.projet;
      return projet ? { ...reste, projet } : reste;
    }),
  );
  rangerArtefacts(id, projet || undefined);
}

/** Le projet est supprimé : ses discussions restent, hors projet. */
export function sortirDuProjet(projet: string): void {
  const chats = lireChats();
  if (!chats.some((c) => c.projet === projet)) return;
  ecrire(
    chats.map((c) => {
      if (c.projet !== projet) return c;
      const reste = { ...c };
      delete reste.projet;
      return reste;
    }),
  );
}

export function effacerTousLesChats(): void {
  try {
    localStorage.removeItem(CLE);
    localStorage.removeItem(ANCIENNE_CLE);
  } catch {
    /* rien à effacer */
  }
  effacerTousLesArtefacts();
  window.dispatchEvent(new Event(EVT));
}

export function ecouterChats(fn: () => void): () => void {
  window.addEventListener(EVT, fn);
  window.addEventListener('six-memoire', fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVT, fn);
    window.removeEventListener('six-memoire', fn);
    window.removeEventListener('storage', fn);
  };
}

export function nouvelId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
