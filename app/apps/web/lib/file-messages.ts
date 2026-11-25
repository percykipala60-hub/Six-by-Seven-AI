/**
 * File des messages envoyés pendant que Six répond ou travaille (comme dans Claude Code) : la saisie n'est jamais
 * bloquée. Chaque message attend son tour et part dès que la réponse en cours est arrivée, dans l'ordre d'envoi.
 * Si la réponse en cours échoue ou est arrêtée, la file revient dans la barre de saisie (rien n'est perdu ni envoyé
 * sans que la personne le voie).
 */

export type MessageEnFile<P> = { id: string; texte: string; pieces: P[] };

let compteur = 0;
const idFile = () => `f${Date.now().toString(36)}${(compteur++).toString(36)}`;

/** Ajoute un message à la file (ignoré s'il est vide : ni texte ni pièce). */
export function mettreEnFile<P>(
  file: MessageEnFile<P>[],
  texte: string,
  pieces: P[],
): MessageEnFile<P>[] {
  if (!texte.trim() && !pieces.length) return file;
  return [...file, { id: idFile(), texte: texte.trim(), pieces }];
}

export function retirerDeFile<P>(file: MessageEnFile<P>[], id: string): MessageEnFile<P>[] {
  return file.filter((m) => m.id !== id);
}

/** Le prochain message à envoyer et le reste de la file. */
export function prochainMessage<P>(file: MessageEnFile<P>[]): {
  message: MessageEnFile<P> | undefined;
  reste: MessageEnFile<P>[];
} {
  const [message, ...reste] = file;
  return { message, reste };
}

/**
 * La file remise dans la barre (après un échec ou un arrêt) : les textes en attente, puis celui déjà dans la barre,
 * mis bout à bout (la barre tient sur une ligne) ; les pièces sont toutes regroupées, dans l'ordre.
 */
export function rendreALaSaisie<P>(
  file: MessageEnFile<P>[],
  saisie: string,
  pieces: P[],
): { texte: string; pieces: P[] } {
  const textes = [...file.map((m) => m.texte), saisie.trim()].filter(Boolean);
  return { texte: textes.join(' '), pieces: [...file.flatMap((m) => m.pieces), ...pieces] };
}
