/**
 * Compte de l'utilisateur. Par défaut : invité, tout reste sur le téléphone.
 * Connecté : par un code reçu par e-mail (Supabase).
 * Le compte garde le prénom. La mémoire de Six reste sur le téléphone ; elle n'est copiée sur le compte (table
 * `memoires`) que si la personne l'autorise elle-même (syncAutorisee), et elle peut retirer cette autorisation.
 * Jamais de conversation sur le compte : celles que la mémoire garde restent sur le téléphone.
 * L'interface (avatar, menu, écran Compte) lit `lireCompte()`, synchrone, et s'abonne avec `ecouterCompte()`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { effacerMemoire, fusionner, lireMemoire, memoireActive, remplacerMemoire } from './memoire';
import { CONNEXION_DISPONIBLE, supabase } from './supabase';

export { CONNEXION_DISPONIBLE };

const KEY = 'six-compte'; // { prenom }
const SESSION = 'six-session'; // { id, identifiant } : copie locale de la session, pour un affichage immédiat
const EVT = 'six-compte';
const SYNC = 'six-memoire-sync'; // '1' : la personne a autorisé la copie de sa mémoire sur son compte

export type Compte =
  | { statut: 'invite'; prenom: string }
  | { statut: 'connecte'; prenom: string; identifiant: string };

function lireJson(k: string): Record<string, unknown> {
  try {
    const o = JSON.parse(localStorage.getItem(k) ?? '{}');
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function annoncer() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT));
}

export function lireCompte(): Compte {
  const p = lireJson(KEY).prenom;
  const prenom = typeof p === 'string' ? p.trim().slice(0, 30) : '';
  const s = lireJson(SESSION);
  if (CONNEXION_DISPONIBLE && typeof s.identifiant === 'string' && s.identifiant)
    return { statut: 'connecte', prenom, identifiant: s.identifiant };
  return { statut: 'invite', prenom };
}

function garderPrenom(prenom: string) {
  try {
    const p = prenom.trim().slice(0, 30);
    if (p) localStorage.setItem(KEY, JSON.stringify({ prenom: p }));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage bloqué : le prénom vaut pour cette visite */
  }
}

export function ecrirePrenom(prenom: string): void {
  garderPrenom(prenom);
  annoncer();
  // Connecté : le prénom suit le compte sur les autres appareils.
  if (lireCompte().statut === 'connecte') {
    void supabase().then((sb) =>
      sb?.auth.updateUser({ data: { prenom: prenom.trim().slice(0, 30) } }),
    );
  }
}

/** S'abonne aux changements de compte (autre écran, autre onglet). */
export function ecouterCompte(f: () => void): () => void {
  const onStorage = (e: StorageEvent) =>
    (e.key === KEY || e.key === SESSION || e.key === SYNC) && f();
  window.addEventListener(EVT, f);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVT, f);
    window.removeEventListener('storage', onStorage);
  };
}

export function initiale(c: Compte): string {
  return c.prenom ? c.prenom.charAt(0).toLocaleUpperCase('fr-FR') : '';
}

/** Moment de la journée, selon l'heure du téléphone. */
export type Moment = 'matin' | 'apres-midi' | 'soir' | 'nuit';

export function moment(d = new Date()): Moment {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'matin';
  if (h >= 12 && h < 18) return 'apres-midi';
  if (h >= 18 && h < 23) return 'soir';
  return 'nuit';
}

const ACCUEIL: Record<Moment, { mot: string; phrase: string }> = {
  matin: { mot: 'Bonjour', phrase: 'Par quel message commence-t-on aujourd’hui ?' },
  'apres-midi': {
    mot: 'Bon après-midi',
    phrase: 'Un message attend ta réponse ? Six t’aide à trouver les mots.',
  },
  soir: {
    mot: 'Bonsoir',
    phrase: 'Une conversation à reprendre ? Colle-la, Six s’occupe du reste.',
  },
  nuit: {
    mot: 'Bonne nuit',
    phrase: 'Rien ne presse : prépare ta réponse maintenant, envoie-la quand tu veux.',
  },
};

/** Salutation selon l'heure du téléphone. */
export function salutation(d = new Date()): string {
  return ACCUEIL[moment(d)].mot;
}

/** Phrase d'accueil qui accompagne la salutation, selon le moment de la journée. */
export function phraseAccueil(d = new Date()): string {
  return ACCUEIL[moment(d)].phrase;
}

/* ---------- Connexion par code ---------- */

export type Identifiant = { type: 'email'; valeur: string };
export type FournisseurSocial = 'google' | 'apple';

/** Longueur minimale d'un nouveau mot de passe. La connexion accepte encore les anciens comptes à 6 caractères. */
export const MDP_MIN_INSCRIPTION = 8;

/** Message d'erreur d'un nouveau mot de passe, ou null s'il convient. */
export function erreurMotDePasse(motDePasse: string): string | null {
  if (!motDePasse) return 'Choisis un mot de passe.';
  if (motDePasse.length < MDP_MIN_INSCRIPTION)
    return `Choisis un mot de passe d’au moins ${MDP_MIN_INSCRIPTION} caractères.`;
  return null;
}

/**
 * Reconnaît une adresse e-mail.
 * Renvoie null si ce n'est pas une adresse e-mail valide.
 */
export function lireIdentifiant(saisie: string): Identifiant | null {
  const s = saisie.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return { type: 'email', valeur: s.toLowerCase() };
  return null;
}

function obtenirRedirectUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin && origin.startsWith('http') && !origin.includes('localhost')
    ? origin
    : 'https://effulgent-jelly-177a12.netlify.app';
}

function obtenirOrigineOAuth(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin.startsWith('http') ? origin : 'https://effulgent-jelly-177a12.netlify.app';
}

function messageErreur(
  e: { message?: string; status?: number } | null | undefined,
  _id?: Identifiant,
): string {
  const m = (e?.message ?? '').toLowerCase();
  if (m.includes('rate') || e?.status === 429)
    return 'Trop de tentatives. Attends quelques minutes, puis réessaie.';
  if (m.includes('expired') || m.includes('invalid') || m.includes('token'))
    return "Ce code n'est pas bon ou a expiré. Vérifie-le, ou demande un nouveau code.";
  if (m.includes('fetch') || m.includes('network'))
    return 'Pas de réseau. Réessaie dans un instant.';
  return "Une erreur est survenue. Vérifie l'adresse e-mail et réessaie.";
}

/** Connexion classique par e-mail et mot de passe. */
export async function connecterParMotDePasse(
  email: string,
  motDePasse: string,
): Promise<string | null> {
  const id = lireIdentifiant(email);
  if (!id) return 'Écris une adresse e-mail valide.';
  if (!motDePasse || motDePasse.length < 6)
    return 'Le mot de passe doit comporter au moins 6 caractères.';

  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";

  const { error } = await sb.auth.signInWithPassword({
    email: id.valeur,
    password: motDePasse,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('invalid login credentials') || m.includes('invalid_grant')) {
      return 'Adresse e-mail ou mot de passe incorrect.';
    }
    if (m.includes('email not confirmed')) {
      return "Cette adresse e-mail n'a pas encore été confirmée. Vérifie ta boîte de réception.";
    }
    return messageErreur(error, id);
  }
  return null;
}

/** Inscription d'un nouveau compte avec prénom, e-mail et mot de passe. */
export async function inscrire(
  email: string,
  motDePasse: string,
  prenom: string,
  accepteConditions = false,
): Promise<{ error: string | null; confirmationRequise: boolean }> {
  const p = prenom.trim().slice(0, 30);
  if (!p)
    return {
      error: 'Indique ton prénom pour que Six te reconnaisse.',
      confirmationRequise: false,
    };
  const id = lireIdentifiant(email);
  if (!id) return { error: 'Écris une adresse e-mail valide.', confirmationRequise: false };
  if (!accepteConditions) {
    return {
      error:
        'Pour créer un compte, accepte les conditions d’utilisation et la politique de confidentialité.',
      confirmationRequise: false,
    };
  }
  const mdpErreur = erreurMotDePasse(motDePasse);
  if (mdpErreur) return { error: mdpErreur, confirmationRequise: false };

  const sb = await supabase();
  if (!sb)
    return {
      error: "La connexion n'est pas disponible pour le moment.",
      confirmationRequise: false,
    };

  const { data, error } = await sb.auth.signUp({
    email: id.valeur,
    password: motDePasse,
    options: {
      data: {
        prenom: p,
        conditions_acceptees_le: new Date().toISOString(),
      },
      emailRedirectTo: obtenirRedirectUrl(),
    },
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('already registered') || m.includes('unique')) {
      return {
        error: 'Un compte existe déjà avec cette adresse e-mail. Connecte-toi directement.',
        confirmationRequise: false,
      };
    }
    return { error: messageErreur(error, id), confirmationRequise: false };
  }

  garderPrenom(p);
  annoncer();

  const confirmationRequise = !data.session && !!data.user;
  return { error: null, confirmationRequise };
}

/** Réinitialisation du mot de passe par e-mail. */
export async function reinitialiserMotDePasse(email: string): Promise<string | null> {
  const id = lireIdentifiant(email);
  if (!id) return 'Écris une adresse e-mail valide.';

  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";

  const { error } = await sb.auth.resetPasswordForEmail(id.valeur, {
    redirectTo: `${obtenirRedirectUrl()}/reglages?v=compte`,
  });
  if (error) return messageErreur(error, id);
  return null;
}

/**
 * Connexion en un geste avec Google ou Apple (fournisseurs à activer dans Supabase).
 *
 * La fenêtre du fournisseur s'ouvre à part : l'app reste exactement en place (plus
 * d'écran remplacé par la page du fournisseur). Si le fournisseur n'est pas activé
 * côté Supabase, c'est la nouvelle fenêtre qui affiche l'erreur, et on le dit ici.
 */
export async function connecterAvecFournisseur(
  fournisseur: FournisseurSocial,
): Promise<{ erreur: string | null; info: string | null }> {
  const sb = await supabase();
  if (!sb) return { erreur: "La connexion n'est pas disponible pour le moment.", info: null };
  const nom = fournisseur === 'google' ? 'Google' : 'Apple';
  try {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: fournisseur,
      options: {
        redirectTo: `${obtenirOrigineOAuth()}/reglages?v=compte`,
        skipBrowserRedirect: true, // on garde la main : la fenêtre s'ouvre via window.open
      },
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('not enabled') || m.includes('provider') || m.includes('unsupported')) {
        return {
          erreur: `La connexion avec ${nom} n’est pas encore activée. Utilise ton adresse e-mail en attendant.`,
          info: null,
        };
      }
      return { erreur: messageErreur(error), info: null };
    }
    if (!data.url) {
      return {
        erreur: `La connexion avec ${nom} n’a pas pu s’ouvrir. Vérifie ta connexion, puis réessaie.`,
        info: null,
      };
    }
    const fenetre = window.open(data.url, '_blank', 'noopener');
    if (!fenetre) {
      return {
        erreur: `La fenêtre ${nom} a été bloquée par le navigateur. Autorise les fenêtres pop-up pour Six, ou utilise ton adresse e-mail.`,
        info: null,
      };
    }
    // L'app est restée en place ; le fournisseur se termine dans la nouvelle fenêtre.
    return {
      erreur: null,
      info: `Une fenêtre ${nom} s’est ouverte pour continuer. Si elle affiche une erreur, la connexion avec ${nom} n’est pas encore activée : utilise ton adresse e-mail en attendant.`,
    };
  } catch {
    return {
      erreur: `La connexion avec ${nom} n’a pas pu s’ouvrir. Vérifie ta connexion, puis réessaie.`,
      info: null,
    };
  }
}

/** Renvoie l'e-mail de confirmation d'inscription (lien reçu après la création du compte). */
export async function renvoyerConfirmation(email: string): Promise<string | null> {
  const id = lireIdentifiant(email);
  if (!id) return 'Écris une adresse e-mail valide.';
  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";
  const { error } = await sb.auth.resend({
    type: 'signup',
    email: id.valeur,
    options: { emailRedirectTo: obtenirRedirectUrl() },
  });
  return error ? messageErreur(error, id) : null;
}

/** Définit ou remplace le mot de passe du compte connecté (utile après un lien de réinitialisation). */
export async function changerMotDePasse(motDePasse: string): Promise<string | null> {
  const err = erreurMotDePasse(motDePasse);
  if (err) return err;
  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";
  const { error } = await sb.auth.updateUser({ password: motDePasse });
  if (error) return messageErreur(error);
  return null;
}

/** Envoie un code à usage unique par e-mail. Le compte est créé à la première connexion. */
export async function envoyerCode(id: Identifiant): Promise<string | null> {
  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";
  const { error } = await sb.auth.signInWithOtp({
    email: id.valeur,
    options: { shouldCreateUser: true, emailRedirectTo: obtenirRedirectUrl() },
  });
  return error ? messageErreur(error, id) : null;
}

/** Vérifie le code reçu ; la session et la synchronisation démarrent ensuite toutes seules. */
export async function verifierCode(id: Identifiant, code: string): Promise<string | null> {
  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";
  const token = code.replace(/\s/g, '');
  const { error } = await sb.auth.verifyOtp({ email: id.valeur, token, type: 'email' });
  return error ? messageErreur(error, id) : null;
}

/** Déconnexion : la mémoire reste sur ce téléphone, elle n'est simplement plus synchronisée. */
export async function deconnecter(): Promise<void> {
  const sb = await supabase();
  await sb?.auth.signOut();
  try {
    localStorage.removeItem(SESSION);
  } catch {
    /* rien à retirer */
  }
  annoncer();
}

/** Supprime le compte et sa mémoire synchronisée (la ligne `memoires`), puis déconnecte. */
export async function oublierMemoireDuCompte(): Promise<string | null> {
  const sb = await supabase();
  const id = lireJson(SESSION).id;
  if (!sb || typeof id !== 'string') return "Tu n'es pas connecté.";
  const { error } = await sb.from('memoires').delete().eq('user_id', id);
  if (error) return "La mémoire du compte n'a pas pu être effacée. Réessaie.";
  effacerMemoire();
  return null;
}

/* ---------- Synchronisation de la mémoire ---------- */

/** Vrai seulement si la personne a autorisé la copie de sa mémoire sur son compte (désactivé par défaut). */
export function syncAutorisee(): boolean {
  try {
    return localStorage.getItem(SYNC) === '1';
  } catch {
    return false;
  }
}

/**
 * Donne ou retire l'autorisation. Donnée : la mémoire du téléphone et celle du compte sont fusionnées.
 * Retirée : la copie du compte est effacée, la mémoire du téléphone reste intacte.
 */
export async function autoriserSync(on: boolean): Promise<string | null> {
  try {
    if (on) localStorage.setItem(SYNC, '1');
    else localStorage.removeItem(SYNC);
  } catch {
    return "Six n'a pas pu enregistrer ton choix sur ce téléphone.";
  }
  annoncer();
  const sb = await supabase();
  const id = lireJson(SESSION).id;
  if (!sb || typeof id !== 'string') return null;
  if (on) {
    await synchroniser(sb, id);
    return null;
  }
  const { error } = await sb.from('memoires').delete().eq('user_id', id);
  return error ? "La copie sur ton compte n'a pas pu être effacée. Réessaie." : null;
}

let demarre = false;
let minuterie: ReturnType<typeof setTimeout> | undefined;

async function envoyerMemoire(sb: SupabaseClient, userId: string) {
  const donnees = lireMemoire();
  if (
    !memoireActive() ||
    (!donnees.choix.length && !donnees.contacts.length && !donnees.suivis.length)
  ) {
    await sb.from('memoires').delete().eq('user_id', userId); // mémoire désactivée : rien ne reste sur le compte
    return;
  }
  await sb.from('memoires').upsert({ user_id: userId, donnees, maj: new Date().toISOString() });
}

async function synchroniser(sb: SupabaseClient, userId: string) {
  if (!syncAutorisee()) return; // sans autorisation, rien ne part vers le compte
  if (!memoireActive()) {
    await envoyerMemoire(sb, userId);
    return;
  }
  const { data, error } = await sb
    .from('memoires')
    .select('donnees')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return; // hors-ligne : on réessaiera à la prochaine ouverture
  remplacerMemoire(fusionner(lireMemoire(), data?.donnees));
  await envoyerMemoire(sb, userId);
}

/**
 * À appeler une fois au chargement de l'app (components/CompteSync.tsx) : suit la session, recopie le prénom,
 * et, si la personne l'a autorisé, fusionne la mémoire à la connexion puis renvoie chaque changement au compte
 * (regroupés sur 1,5 s).
 */
export async function demarrerCompte(): Promise<void> {
  if (demarre) return;
  demarre = true;
  const sb = await supabase();
  if (!sb) return;

  sb.auth.onAuthStateChange((evenement, session) => {
    try {
      if (session?.user) {
        const u = session.user;
        localStorage.setItem(
          SESSION,
          JSON.stringify({
            id: u.id,
            identifiant: u.email || '',
          }),
        );
        const distant =
          typeof u.user_metadata?.prenom === 'string' ? (u.user_metadata.prenom as string) : '';
        const local = lireCompte().prenom;
        if (distant && !local) garderPrenom(distant);
        else if (local && !distant) void sb.auth.updateUser({ data: { prenom: local } });
      } else {
        localStorage.removeItem(SESSION);
      }
    } catch {
      /* stockage bloqué */
    }
    annoncer();
    // Pas d'appel à Supabase directement dans ce rappel (verrou de session) : on laisse la main d'abord.
    if (session?.user && (evenement === 'SIGNED_IN' || evenement === 'INITIAL_SESSION')) {
      const id = session.user.id;
      setTimeout(() => void synchroniser(sb, id), 0);
    }
  });

  window.addEventListener('six-memoire', () => {
    const id = lireJson(SESSION).id;
    if (typeof id !== 'string' || !syncAutorisee()) return;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => void envoyerMemoire(sb, id), 1500);
  });
}
