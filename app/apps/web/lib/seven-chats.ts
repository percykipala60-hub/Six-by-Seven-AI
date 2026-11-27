import { sans } from './objet';
import { memoireActive } from './memoire';
import type { ChatMessage } from './types';

export const CLE_BROUILLON_PROJET = 'six-brouillon-projet';

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
  projetId?: string;
  /** Cosinus : dossier de l'environnement de la discussion (lib/environnements.ts). */
  dossier?: string;
  /** Cosinus : environnement de la discussion (lib/environnements.ts). */
  environnement?: string;
  /** Titre choisi par la personne (« Renommer ») : il remplace le titre tiré de la première question. */
  titrePerso?: string;
  /** Épinglée : reste en tête de la liste « Récents ». */
  epingle?: boolean;
  /** Archivée : retirée de « Récents », visible dans « Archivées » (rien n'est effacé). */
  archive?: boolean;
};

const CLE = 'seven-ai-chats';
const ANCIENNE_CLE = 'seven-ai-chat'; // une seule discussion, avant la liste
const EVT = 'seven-chats';
const MAX_CHATS = 100;
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
        titre:
          typeof c.titrePerso === 'string' && c.titrePerso.trim()
            ? c.titrePerso
            : typeof c.titre === 'string'
              ? c.titre
              : titreDe(c.messages),
        messages: messagesValides(c.messages),
        dossier: typeof c.dossier === 'string' && c.dossier ? c.dossier : undefined,
        environnement:
          typeof c.environnement === 'string' && c.environnement ? c.environnement : undefined,
        archive: c.archive === true ? true : undefined,
        epingle: c.epingle === true && c.archive !== true ? true : undefined,
      }))
      .sort((a, b) => Number(Boolean(b.epingle)) - Number(Boolean(a.epingle)) || b.maj - a.maj)
      .slice(0, MAX_CHATS);
  } catch {
    return [];
  }
}

export function lireChat(id: string): ChatSeven | undefined {
  return lireChats().find((c) => c.id === id);
}

/**
 * Enregistre (ou met à jour) une discussion et la remonte en tête de liste. Sans `projetId`, la discussion garde le
 * projet où elle était rangée.
 */
export function garderChat(
  id: string,
  messages: ChatMessage[],
  mode: ModeChat = 'chat',
  projetId?: string,
  dossier?: string,
  environnement?: string,
): void {
  if (!memoireActive() || messages.length === 0) return;
  const chats = lireChats();
  const ancien = chats.find((c) => c.id === id);
  const titrePerso = ancien?.titrePerso;
  const projet = projetId ?? ancien?.projetId;
  const chat: ChatSeven = {
    ...(titrePerso ? { titrePerso } : {}),
    ...(ancien?.epingle ? { epingle: true } : {}),
    // Écrire dans une discussion archivée la ramène dans « Récents », comme chez Claude.
    id,
    titre: titreDe(messages),
    maj: Date.now(),
    messages: messages.slice(-MAX_MSG),
    ...(mode === 'sixtouch' ? { mode } : {}),
    ...(projet ? { projetId: projet } : {}),
    ...(mode === 'sixtouch' && dossier ? { dossier } : {}),
    ...(mode === 'sixtouch' && environnement ? { environnement } : {}),
  };
  ecrire([chat, ...chats.filter((c) => c.id !== id)]);
}

/** Renomme une discussion (titre vide : le titre redevient le début de la première question). */
export function renommerChat(id: string, titre: string): void {
  const t = titre.replace(/\s+/g, ' ').trim().slice(0, 80);
  ecrire(
    lireChats().map((c) => {
      if (c.id !== id) return c;
      const reste = sans(c, 'titrePerso');
      return t ? { ...reste, titrePerso: t, titre: t } : { ...reste, titre: titreDe(c.messages) };
    }),
  );
}

/** Épingle ou désépingle une discussion (en tête de « Récents »). */
export function epinglerChat(id: string, epingle: boolean): void {
  ecrire(
    lireChats().map((c) => {
      if (c.id !== id) return c;
      const reste = sans(c, 'epingle');
      return epingle ? { ...reste, epingle: true } : reste;
    }),
  );
}

/** Archive ou désarchive une discussion (une discussion archivée n'est plus épinglée). */
export function archiverChat(id: string, archive: boolean): void {
  ecrire(
    lireChats().map((c) => {
      if (c.id !== id) return c;
      const reste = sans(c, 'archive', 'epingle');
      return archive
        ? { ...reste, archive: true }
        : { ...reste, ...(c.epingle ? { epingle: true } : {}) };
    }),
  );
}

/** Où déplacer une discussion : le Chat (discussion simple), ou un environnement de Cosinus. */
export type Destination =
  { mode: 'chat' } | { mode: 'sixtouch'; environnement: string; dossier?: string };

/** Déplace une discussion vers le Chat ou vers un environnement de Cosinus (ses messages restent les mêmes). */
export function deplacerChat(id: string, vers: Destination): void {
  ecrire(
    lireChats().map((c) => {
      if (c.id !== id) return c;
      const reste = sans(c, 'mode', 'environnement', 'dossier');
      return vers.mode === 'chat'
        ? reste
        : {
            ...reste,
            mode: 'sixtouch' as const,
            environnement: vers.environnement,
            ...(vers.dossier ? { dossier: vers.dossier } : {}),
          };
    }),
  );
}

/** Copie d'une discussion (même environnement), placée en tête ; renvoie son identifiant. */
export function dupliquerChat(id: string): string | null {
  const c = lireChat(id);
  if (!c || !memoireActive()) return null;
  const copie: ChatSeven = {
    ...c,
    id: nouvelId(),
    maj: Date.now(),
    titre: `${c.titre} (copie)`.slice(0, 80),
    titrePerso: `${c.titre} (copie)`.slice(0, 80),
    epingle: undefined,
  };
  ecrire([copie, ...lireChats()]);
  return copie.id;
}

export function effacerChat(id: string): void {
  ecrire(lireChats().filter((c) => c.id !== id));
}

/** Discussions rangées dans un projet (lib/travail.ts), les plus récentes d'abord. */
export function chatsDuProjet(projetId: string, chats = lireChats()): ChatSeven[] {
  return chats.filter((c) => c.projetId === projetId);
}

/** Range une discussion dans un projet, ou l'en sort (projet vide). Sa place dans la liste ne change pas. */
export function rangerChat(id: string, projetId: string): void {
  const chats = lireChats();
  if (!chats.some((c) => c.id === id)) return;
  ecrire(
    chats.map((c) => {
      if (c.id !== id) return c;
      const reste = { ...c };
      delete reste.projetId;
      return projetId ? { ...reste, projetId } : reste;
    }),
  );
}

/** Le projet est supprimé : ses discussions restent, hors projet. */
export function sortirDuProjet(projetId: string): void {
  const chats = lireChats();
  if (!chats.some((c) => c.projetId === projetId)) return;
  ecrire(
    chats.map((c) => {
      if (c.projetId !== projetId) return c;
      const reste = { ...c };
      delete reste.projetId;
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
