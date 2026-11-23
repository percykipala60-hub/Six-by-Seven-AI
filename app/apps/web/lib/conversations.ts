/**
 * Conversations gardées par la mémoire de Six.
 *
 * Quand la mémoire est activée, chaque conversation terminée est gardée sur l'appareil,
 * dans l'ordre inverse de la date, jusqu'à ce que la personne les efface une par une ou
 * toutes d'un coup. Contrairement à ce que Six apprend (oublié après 90 jours par le
 * curateur), elles ne sont jamais curées : elles restent tant qu'on les garde.
 *
 * Elles ne sont PAS synchronisées vers Supabase : elles restent sur le téléphone.
 * Quand la mémoire est coupée (Réglages → Mémoire), tout est effacé.
 *
 * Le gate (mémoire active ou non) est volontairement laissé aux appelants, pour ne pas
 * créer de dépendance circulaire avec `memoire.ts`.
 */
export interface ConversationGardee {
  id: string;
  quand: number; // date de fin, en millisecondes
  canal: string; // où partait la réponse (étiquette du réseau), pour se souvenir du contexte
  extrait: string; // fin du texte envoyé (déjà masqué), pour reconnaître la conversation
  reponse: string; // la réponse de Six, prête à recopier
  masque?: true; // extrait tiré du texte masqué (les anciennes versions gardaient le texte d'origine)
}

const KEY = 'six-conversations';
const EVT = 'six-conversations';

/** Prévient le menu latéral (liste « Réponses ») qu'une conversation a été gardée ou effacée. */
function annoncer(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT));
}

export function ecouterConversations(fn: () => void): () => void {
  window.addEventListener(EVT, fn);
  window.addEventListener('six-memoire', fn);
  return () => {
    window.removeEventListener(EVT, fn);
    window.removeEventListener('six-memoire', fn);
  };
}
const MAX = 50; // garde-fou : au-delà, les plus anciennes sortent

function valide(x: unknown): x is ConversationGardee {
  if (typeof x !== 'object' || x === null) return false;
  const c = x as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.quand === 'number' &&
    typeof c.canal === 'string' &&
    typeof c.extrait === 'string' &&
    typeof c.reponse === 'string'
  );
}

/** Les conversations gardées, les plus récentes d'abord. */
export function lireConversations(): ConversationGardee[] {
  try {
    const brut = localStorage.getItem(KEY);
    if (!brut) return [];
    const liste = JSON.parse(brut) as unknown;
    if (!Array.isArray(liste)) return [];
    return (
      liste
        .filter(valide)
        // Anciennes versions : l'extrait venait du texte d'origine, avec les vrais noms. On ne le montre plus.
        .map((c) => (c.masque ? c : { ...c, extrait: '' }))
        .sort((a, b) => b.quand - a.quand)
        .slice(0, MAX)
    );
  } catch {
    return [];
  }
}

/** Ajoute une conversation terminée en tête de liste. */
export function garderConversation(c: ConversationGardee): void {
  try {
    const nouvelle: ConversationGardee = { ...c, masque: true };
    localStorage.setItem(KEY, JSON.stringify([nouvelle, ...lireConversations()].slice(0, MAX)));
  } catch {
    /* stockage plein ou bloqué : Six marche, sans garder la conversation */
  }
  annoncer();
}

/** Efface une conversation gardée précise. */
export function effacerConversationGardee(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lireConversations().filter((c) => c.id !== id)));
  } catch {
    /* rien à effacer */
  }
  annoncer();
}

/** Efface toutes les conversations gardées (mémoire coupée ou bouton d'effacement). */
export function effacerConversations(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien à effacer */
  }
  annoncer();
}
