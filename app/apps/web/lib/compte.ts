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
import { CLE, CONNEXION_DISPONIBLE, URL_SUPABASE, supabase } from './supabase';

export { CONNEXION_DISPONIBLE };

const KEY = 'six-compte'; // { prenom }
const SESSION = 'six-session'; // { id, identifiant } : copie locale de la session, pour un affichage immédiat
const EVT = 'six-compte';
const SYNC = 'six-memoire-sync'; // '1' : la personne a autorisé la copie de sa mémoire sur son compte

export type Compte =
  | { statut: 'invite'; prenom: string }
  | { statut: 'connecte'; prenom: string; identifiant: string; photo?: string };

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
  if (CONNEXION_DISPONIBLE && typeof s.identifiant === 'string' && s.identifiant) {
    const photo = photoSure(s.photo);
    return { statut: 'connecte', prenom, identifiant: s.identifiant, ...(photo ? { photo } : {}) };
  }
  return { statut: 'invite', prenom };
}

/** Photo de profil fournie par Google ou Apple : seulement une adresse https, sinon rien. */
function photoSure(v: unknown): string {
  return typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) && v.length < 1000 ? v : '';
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
    : 'https://app.sixbysevenai.com';
}

function obtenirOrigineOAuth(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin.startsWith('http') ? origin : 'https://app.sixbysevenai.com';
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
  if (m.includes('sending') || m.includes('email') || (e?.status ?? 0) >= 500)
    return "L'e-mail n'a pas pu partir. Réessaie dans quelques minutes.";
  return "Une erreur est survenue. Vérifie l'adresse e-mail et réessaie.";
}

/**
 * Type du code à 6 chiffres attendu : « connexion » pour un compte déjà confirmé,
 * « inscription » pour confirmer l'adresse d'un compte qui vient d'être créé.
 */
export type TypeCode = 'connexion' | 'inscription';
export type ResultatEtape = { erreur: string | null; code?: TypeCode };

/**
 * Pendant la vérification du mot de passe, la session ouverte un instant par Supabase est
 * aussitôt refermée : l'écouteur de compte l'ignore (pas de « connecté », pas de synchronisation).
 */
let verificationMdp = false;

/**
 * Connexion en deux étapes : 1. mot de passe vérifié, 2. code à 6 chiffres envoyé par e-mail.
 * Le mot de passe seul n'ouvre jamais la session : il faut aussi le code (verifierCode).
 * Une adresse pas encore confirmée reçoit à la place son code de confirmation d'inscription.
 */
export async function connecterParMotDePasse(
  email: string,
  motDePasse: string,
): Promise<ResultatEtape> {
  const id = lireIdentifiant(email);
  if (!id) return { erreur: 'Écris une adresse e-mail valide.' };
  if (!motDePasse || motDePasse.length < 6)
    return { erreur: 'Le mot de passe doit comporter au moins 6 caractères.' };

  const sb = await supabase();
  if (!sb) return { erreur: "La connexion n'est pas disponible pour le moment." };

  verificationMdp = true;
  try {
    const { error } = await sb.auth.signInWithPassword({
      email: id.valeur,
      password: motDePasse,
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('invalid login credentials') || m.includes('invalid_grant')) {
        return { erreur: 'Adresse e-mail ou mot de passe incorrect.' };
      }
      if (m.includes('email not confirmed')) {
        // Compte créé mais jamais confirmé : on renvoie le code de confirmation.
        const err = await renvoyerConfirmation(id.valeur);
        return err ? { erreur: err } : { erreur: null, code: 'inscription' };
      }
      return { erreur: messageErreur(error, id) };
    }
    await sb.auth.signOut({ scope: 'local' });
  } finally {
    verificationMdp = false;
  }

  const { error } = await sb.auth.signInWithOtp({
    email: id.valeur,
    options: { shouldCreateUser: false },
  });
  return error ? { erreur: messageErreur(error, id) } : { erreur: null, code: 'connexion' };
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

  // Adresse déjà confirmée : Supabase répond sans erreur (pour ne rien révéler) mais n'envoie rien.
  if (data.user && data.user.identities?.length === 0) {
    return {
      error: 'Un compte existe déjà avec cette adresse e-mail. Connecte-toi directement.',
      confirmationRequise: false,
    };
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

/** Adresse de retour de la connexion Apple ou Google dans l'app iPhone (à autoriser dans Supabase). */
export const RETOUR_OAUTH_IOS = 'six://auth';

export type RetourOAuth =
  | { type: 'jetons'; access_token: string; refresh_token: string }
  | { type: 'code'; code: string }
  | { type: 'erreur'; message: string }
  | { type: 'vide' };

/**
 * Lit l'adresse six://auth… renvoyée par Supabase : jetons dans le fragment (#access_token=…),
 * code (?code=…) ou erreur (?error_description=… ou #error_description=…).
 */
export function lireRetourOAuth(adresse: string): RetourOAuth {
  const i = adresse.indexOf('#');
  const q = adresse.indexOf('?');
  const fragment = new URLSearchParams(i >= 0 ? adresse.slice(i + 1) : '');
  const requete = new URLSearchParams(q >= 0 ? adresse.slice(q + 1, i > q ? i : undefined) : '');
  const lire = (cle: string) => fragment.get(cle) ?? requete.get(cle);

  const erreur = lire('error_description') ?? lire('error');
  if (erreur) return { type: 'erreur', message: erreur };
  const access_token = lire('access_token');
  const refresh_token = lire('refresh_token');
  if (access_token && refresh_token) return { type: 'jetons', access_token, refresh_token };
  const code = lire('code');
  if (code) return { type: 'code', code };
  return { type: 'vide' };
}

/**
 * Où se fait la connexion Apple ou Google : « web » (navigateur, redirection dans le même onglet),
 * le plugin natif de l'app iPhone (ios/App/App/SceneDelegate.swift, fenêtre de connexion du système),
 * « ancienne-app » (build iPhone sans ce plugin) ou null (app Android : fenêtre à part).
 */
async function connexionNativeIOS(): Promise<
  { ouvrir(o: { url: string }): Promise<{ url: string }> } | 'ancienne-app' | 'web' | null
> {
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return 'web';
    if (Capacitor.getPlatform() !== 'ios') return null;
    if (!Capacitor.isPluginAvailable('SixAuth')) return 'ancienne-app';
    const plugin = registerPlugin<{ ouvrir(o: { url: string }): Promise<{ url: string }> }>(
      'SixAuth',
    );
    // Jamais le plugin lui-même : c'est un Proxy qui répond à toute méthode, y compris « then ».
    // Renvoyé par une fonction async, il passerait pour une promesse qui ne se résout jamais
    // (bouton bloqué sur « Ouverture d'Apple… »).
    return { ouvrir: (o: { url: string }) => plugin.ouvrir(o) };
  } catch {
    return 'web';
  }
}

export type FournisseursActifs = Record<FournisseurSocial, boolean>;

let actifs: Promise<FournisseursActifs> | null = null;

/**
 * Fournisseurs réellement activés dans Supabase (réglages publics du projet). Seuls leurs
 * boutons s'affichent : un fournisseur pas encore configuré n'ouvre jamais de fenêtre d'erreur.
 * En cas de doute (hors ligne, réponse illisible), aucun bouton : l'e-mail reste toujours possible.
 */
export function fournisseursActifs(): Promise<FournisseursActifs> {
  const aucun: FournisseursActifs = { google: false, apple: false };
  if (!CONNEXION_DISPONIBLE || typeof window === 'undefined') return Promise.resolve(aucun);
  actifs ??= fetch(`${URL_SUPABASE}/auth/v1/settings`, { headers: { apikey: CLE } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { external?: Partial<FournisseursActifs> } | null) => ({
      google: j?.external?.google === true,
      apple: j?.external?.apple === true,
    }))
    .catch(() => {
      actifs = null;
      return aucun;
    });
  return actifs;
}

/**
 * Connexion en un geste avec Google ou Apple (fournisseurs à activer dans Supabase).
 *
 * Navigateur : la page du fournisseur remplace Six, puis revient sur l'accueil, connecté.
 * App iPhone : fenêtre de connexion du système, qui revient par six://auth.
 * App Android : fenêtre à part (comportement d'origine).
 */
export async function connecterAvecFournisseur(
  fournisseur: FournisseurSocial,
): Promise<{ erreur: string | null; info: string | null }> {
  const sb = await supabase();
  if (!sb) return { erreur: "La connexion n'est pas disponible pour le moment.", info: null };
  const nom = fournisseur === 'google' ? 'Google' : 'Apple';
  if (!(await fournisseursActifs())[fournisseur]) {
    return {
      erreur: `La connexion avec ${nom} n’est pas encore disponible. Utilise ton adresse e-mail.`,
      info: null,
    };
  }
  const natif = await connexionNativeIOS();
  if (natif === 'ancienne-app') {
    // Build iPhone sans la fenêtre de connexion : Safari ne reviendrait jamais dans l'app.
    return {
      erreur: `La connexion avec ${nom} demande la dernière version de Six. Mets l'app à jour, ou utilise ton adresse e-mail.`,
      info: null,
    };
  }
  try {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: fournisseur,
      options: {
        // Navigateur : retour sur l'accueil, dans le même onglet, déjà connecté. Dans une fenêtre à
        // part, la session s'ouvrait dans cette fenêtre (parfois un autre navigateur) et l'onglet de
        // Six restait sur l'écran de connexion.
        redirectTo:
          natif === 'web'
            ? `${obtenirOrigineOAuth()}/`
            : natif
              ? RETOUR_OAUTH_IOS
              : `${obtenirOrigineOAuth()}/reglages?v=compte`,
        // Navigateur : Supabase change lui-même de page. Apps : on garde la main pour ouvrir la fenêtre.
        skipBrowserRedirect: natif !== 'web',
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
    if (natif === 'web') {
      // La page du fournisseur remplace Six ; le retour se fait sur l'accueil, connecté.
      return { erreur: null, info: `Ouverture de ${nom}…` };
    }
    if (natif) {
      const { url } = await natif.ouvrir({ url: data.url });
      if (!url) return { erreur: null, info: null }; // fenêtre fermée par la personne
      const retour = lireRetourOAuth(url);
      const { error: erreurSession } =
        retour.type === 'jetons'
          ? await sb.auth.setSession({
              access_token: retour.access_token,
              refresh_token: retour.refresh_token,
            })
          : retour.type === 'code'
            ? await sb.auth.exchangeCodeForSession(retour.code)
            : { error: { message: retour.type === 'erreur' ? retour.message : 'vide' } };
      if (erreurSession) {
        return {
          erreur: `La connexion avec ${nom} n’a pas abouti. Réessaie, ou utilise ton adresse e-mail.`,
          info: null,
        };
      }
      return { erreur: null, info: null };
    }
    // Sans « noopener » dans les options : avec lui, window.open renvoie toujours null et la
    // fenêtre passerait pour bloquée. On coupe le lien vers l'app juste après.
    const fenetre = window.open(data.url, '_blank');
    if (fenetre) fenetre.opener = null;
    if (!fenetre) {
      return {
        erreur: `La fenêtre ${nom} a été bloquée par le navigateur. Autorise les fenêtres pop-up pour Six, ou utilise ton adresse e-mail.`,
        info: null,
      };
    }
    // L'app est restée en place ; le fournisseur se termine dans la nouvelle fenêtre.
    return {
      erreur: null,
      info: `Une fenêtre ${nom} s’est ouverte pour continuer.`,
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

const RECUPERATION = 'six-recuperation';

/** Vrai si la session vient d'un lien « Mot de passe oublié » : on choisit alors un nouveau mot de passe sans l'ancien. */
export function enRecuperation(): boolean {
  try {
    return sessionStorage.getItem(RECUPERATION) === '1';
  } catch {
    return false;
  }
}

/** Après un lien « Mot de passe oublié » : nouveau mot de passe (Supabase n'exige pas l'ancien dans ce cas). */
export async function definirMotDePasseOublie(nouveau: string): Promise<string | null> {
  const err = erreurMotDePasse(nouveau);
  if (err) return err;
  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";
  const { error } = await sb.auth.updateUser({ password: nouveau });
  if (error) return messageErreur(error);
  try {
    sessionStorage.removeItem(RECUPERATION);
  } catch {
    /* stockage bloqué */
  }
  return null;
}

/**
 * Changement de mot de passe, étape 1 : envoie un code à 6 chiffres à l'adresse du compte
 * (modèle « Reauthentication » de Supabase). Sans ce code, le mot de passe ne change pas.
 */
export async function demanderCodeChangementMdp(): Promise<string | null> {
  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";
  const { error } = await sb.auth.reauthenticate();
  return error ? messageErreur(error) : null;
}

/**
 * Changement de mot de passe, étape 2 : ancien mot de passe + code reçu par e-mail + nouveau.
 * Supabase vérifie lui-même l'ancien mot de passe et le code (réglages du projet).
 */
export async function changerMotDePasse(
  ancien: string,
  nouveau: string,
  code: string,
): Promise<string | null> {
  if (!ancien) return 'Entre ton mot de passe actuel.';
  const err = erreurMotDePasse(nouveau);
  if (err) return err;
  if (ancien === nouveau) return 'Choisis un mot de passe différent de l’actuel.';
  const nonce = code.replace(/\D/g, '');
  if (nonce.length !== 6) return 'Entre les 6 chiffres du code reçu par e-mail.';
  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";
  const { error } = await sb.auth.updateUser({
    password: nouveau,
    current_password: ancien,
    nonce,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('current password') || m.includes('current_password'))
      return 'Mot de passe actuel incorrect.';
    if (m.includes('same') || m.includes('different'))
      return 'Choisis un mot de passe différent de l’actuel.';
    return messageErreur(error);
  }
  return null;
}

/**
 * Vérifie le code à 6 chiffres reçu par e-mail (connexion ou confirmation d'inscription) ;
 * la session et la synchronisation démarrent ensuite toutes seules.
 */
export async function verifierCode(
  email: string,
  code: string,
  type: TypeCode,
): Promise<string | null> {
  const id = lireIdentifiant(email);
  if (!id) return 'Écris une adresse e-mail valide.';
  const token = code.replace(/\D/g, '');
  if (token.length !== 6) return 'Entre les 6 chiffres du code reçu par e-mail.';
  const sb = await supabase();
  if (!sb) return "La connexion n'est pas disponible pour le moment.";
  const { error } = await sb.auth.verifyOtp({
    email: id.valeur,
    token,
    type: type === 'inscription' ? 'signup' : 'email',
  });
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
    // Session d'un instant pendant la vérification du mot de passe : ni « connecté », ni synchronisation.
    if (verificationMdp) return;
    try {
      if (evenement === 'PASSWORD_RECOVERY') sessionStorage.setItem(RECUPERATION, '1');
      if (evenement === 'SIGNED_OUT') sessionStorage.removeItem(RECUPERATION);
    } catch {
      /* stockage bloqué */
    }
    try {
      if (session?.user) {
        const u = session.user;
        localStorage.setItem(
          SESSION,
          JSON.stringify({
            id: u.id,
            identifiant: u.email || '',
            // Connexion avec Google (ou Apple) : on reprend la photo de profil du compte.
            photo: photoSure(u.user_metadata?.avatar_url ?? u.user_metadata?.picture),
          }),
        );
        const meta = u.user_metadata ?? {};
        const nomComplet = typeof meta.full_name === 'string' ? meta.full_name : meta.name;
        const distant =
          typeof meta.prenom === 'string'
            ? (meta.prenom as string)
            : typeof meta.given_name === 'string'
              ? (meta.given_name as string)
              : typeof nomComplet === 'string'
                ? nomComplet.trim().split(/\s+/)[0] || ''
                : '';
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
