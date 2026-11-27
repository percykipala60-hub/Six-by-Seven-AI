import { randomUUID } from 'node:crypto';

/**
 * Pont entre l'agent de Six (sur le serveur) et l'app de bureau (sur l'ordinateur de la personne), pour l'outil
 * « ordinateur » : l'agent demande une action, la page de Six la transmet à l'app de bureau (qui demande les accords
 * et applique les interdits), puis renvoie le résultat ici (POST /api/chat/ordinateur), et l'agent continue.
 *
 * Chaque demande est liée au compte qui a lancé la tâche, porte un identifiant impossible à deviner et expire au
 * bout de DELAI_MS (la personne a pu refuser, fermer l'app ou s'absenter).
 */
const DELAI_MS = 120_000;

type Attente = { compte: string; resoudre: (resultat: string) => void; minuterie: NodeJS.Timeout };
const attentes = new Map<string, Attente>();

/** Envoie la demande à la page (flux de la réponse) et attend le résultat de l'app de bureau. */
export function demanderAuClient(
  compte: string,
  envoyer: (demande: { type: 'ordinateur'; id: string; args: Record<string, unknown> }) => void,
  args: Record<string, unknown>,
  annulation?: AbortSignal,
): Promise<string> {
  const id = randomUUID();
  return new Promise<string>((resoudre) => {
    const finir = (resultat: string) => {
      const a = attentes.get(id);
      if (!a) return;
      clearTimeout(a.minuterie);
      attentes.delete(id);
      resoudre(resultat);
    };
    attentes.set(id, {
      compte,
      resoudre: finir,
      minuterie: setTimeout(
        () =>
          finir(
            'Pas de réponse de l’ordinateur (délai dépassé) : la personne a pu refuser ou fermer l’app.',
          ),
        DELAI_MS,
      ),
    });
    annulation?.addEventListener('abort', () => finir('Tâche annulée.'), { once: true });
    envoyer({ type: 'ordinateur', id, args });
  });
}

/** Résultat renvoyé par l'app de bureau. Faux si la demande est inconnue, expirée ou d'un autre compte. */
export function recevoirDuClient(compte: string, id: string, resultat: string): boolean {
  const a = attentes.get(id);
  if (!a || a.compte !== compte) return false;
  a.resoudre(resultat);
  return true;
}

/**
 * La demande vise-t-elle l'ordinateur (une application de bureau, une fenêtre, un fichier à ouvrir) ? Le Chat de
 * l'app de bureau confie alors la tâche à l'agent avec l'outil « ordinateur ».
 */
const ORDINATEUR =
  /\b(sur (mon|l['’]|cet) (ordinateur|ordi|pc)|application|appli|logiciel|fenêtre|bureau windows|menu démarrer|bloc[- ]?notes?|note ?pad|word ?pad|explorateur|paint|calculatrice|excel|word|powerpoint|outlook|teams|vlc|spotify|réglages windows|paramètres windows|panneau de configuration|raccourci clavier|dans le dossier|ouvre le fichier)\b/i;

export function demandeOrdinateur(question: string): boolean {
  return ORDINATEUR.test(question);
}
