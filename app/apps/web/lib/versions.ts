import { sans } from './objet';
import type { ChatMessage } from './types';

/**
 * Versions d'une discussion, comme dans Claude : modifier une question ou relancer une réponse ne fait rien perdre.
 * L'ancienne suite de la discussion (la question et tout ce qui suivait) est gardée sur la nouvelle question, et des
 * flèches « < 2/3 > » permettent de revenir à n'importe quelle version.
 *
 * Sur un message de la personne : « precedentes » et « suivantes » sont les autres versions de la suite, chacune
 * commençant par sa propre version de la question. La version affichée est entre les deux.
 */

type Suite = ChatMessage[];

export function sansVersions(m: ChatMessage): ChatMessage {
  return sans(m, 'precedentes', 'suivantes');
}

/**
 * Nouvelle version de la question n° i (modifiée ou relancée telle quelle). Renvoie ce qui précède et la nouvelle
 * question, qui garde toutes les anciennes suites ; la réponse s'ajoutera après.
 */
export function nouvelleVersion(
  messages: ChatMessage[],
  i: number,
  question: ChatMessage,
): { avant: ChatMessage[]; question: ChatMessage } {
  const ancienne = messages[i];
  if (!ancienne || ancienne.role !== 'user') return { avant: messages, question };
  const suiteActuelle: Suite = [sansVersions(ancienne), ...messages.slice(i + 1)];
  return {
    avant: messages.slice(0, i),
    question: {
      ...sansVersions(question),
      // La nouvelle version vient en dernier : toutes les autres sont « précédentes ».
      precedentes: [...(ancienne.precedentes ?? []), suiteActuelle, ...(ancienne.suivantes ?? [])],
    },
  };
}

/** Affiche la version précédente (-1) ou suivante (+1) de la question n° i. */
export function changerVersion(messages: ChatMessage[], i: number, sens: -1 | 1): ChatMessage[] {
  const m = messages[i];
  if (!m || m.role !== 'user') return messages;
  const precedentes = m.precedentes ?? [];
  const suivantes = m.suivantes ?? [];
  const actuelle: Suite = [sansVersions(m), ...messages.slice(i + 1)];
  const cible = sens < 0 ? precedentes.at(-1) : suivantes[0];
  if (!cible?.length) return messages;
  const [question, ...reste] = cible;
  return [
    ...messages.slice(0, i),
    {
      ...question,
      precedentes: sens < 0 ? precedentes.slice(0, -1) : [...precedentes, actuelle],
      suivantes: sens < 0 ? [actuelle, ...suivantes] : suivantes.slice(1),
    },
    ...reste,
  ];
}

/** « 2/3 » : numéro de la version affichée et nombre de versions (1/1 sans autre version). */
export function numeroVersion(m: ChatMessage): { n: number; total: number } {
  const p = m.precedentes?.length ?? 0;
  return { n: p + 1, total: p + 1 + (m.suivantes?.length ?? 0) };
}

/**
 * Bifurcation (« partir d'ici ») : la discussion jusqu'à ce message compris, et la réponse qui le suit s'il s'agit
 * d'une question. Les autres versions ne sont pas reprises dans la nouvelle discussion.
 */
export function jusquA(messages: ChatMessage[], i: number): ChatMessage[] {
  const fin = messages[i]?.role === 'user' && messages[i + 1]?.role === 'assistant' ? i + 2 : i + 1;
  return messages.slice(0, fin).map(sansVersions);
}

/** « il y a 52 minutes » : moment d'un message, en français, sans dépendance. */
export function depuis(date: number, maintenant = Date.now()): string {
  const s = Math.max(0, Math.round((maintenant - date) / 1000));
  if (s < 60) return "à l'instant";
  const min = Math.round(s / 60);
  if (min < 60) return `il y a ${min} minute${min > 1 ? 's' : ''}`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} heure${h > 1 ? 's' : ''}`;
  const j = Math.round(h / 24);
  if (j < 30) return `il y a ${j} jour${j > 1 ? 's' : ''}`;
  return new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
