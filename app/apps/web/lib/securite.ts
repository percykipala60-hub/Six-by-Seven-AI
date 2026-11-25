'use client';

/**
 * Sécurité des connexions, côté app :
 * - chaque appareil a un identifiant (gardé sur l'appareil) et un nom lisible (« Windows · Chrome ») ;
 * - après chaque vraie connexion (nouvelle session), l'app le signale au serveur, qui envoie l'e-mail d'alerte
 *   (« Ce n'était pas moi » bloque cet appareil) ;
 * - l'app vérifie régulièrement que son appareil n'a pas été bloqué ; s'il l'est, elle se déconnecte.
 * La méthode de connexion (mot de passe, Google, Apple, code QR) est notée juste avant de se connecter.
 */

export type MethodeConnexion =
  'Mot de passe' | 'Google' | 'Apple' | 'Code QR' | 'Code e-mail' | 'Connexion';

const CLE_APPAREIL = 'six-appareil';
const CLE_METHODE = 'six-methode-connexion';
const CLE_SIGNALEE = 'six-session-signalee';
export const CLE_BLOQUE = 'six-appareil-bloque';

function lire(stockage: 'local' | 'session', cle: string): string | null {
  try {
    return (stockage === 'local' ? localStorage : sessionStorage).getItem(cle);
  } catch {
    return null;
  }
}
function ecrire(stockage: 'local' | 'session', cle: string, valeur: string | null) {
  try {
    const s = stockage === 'local' ? localStorage : sessionStorage;
    if (valeur === null) s.removeItem(cle);
    else s.setItem(cle, valeur);
  } catch {
    /* stockage bloqué */
  }
}

/** Identifiant de cet appareil (créé une fois, gardé sur l'appareil). */
export function identifiantAppareil(): string {
  let id = lire('local', CLE_APPAREIL);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    ecrire('local', CLE_APPAREIL, id);
  }
  return id;
}

/** Nom lisible d'un appareil d'après son navigateur (« Windows · Chrome », « iPhone · App Six »). */
export function nomAppareil(ua: string, contexte: 'bureau' | 'mobile' | 'web' = 'web'): string {
  const systeme = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Appareil';
  const logiciel =
    contexte === 'bureau'
      ? 'App de bureau Six'
      : contexte === 'mobile'
        ? 'App Six'
        : /Edg\//.test(ua)
          ? 'Edge'
          : /OPR\//.test(ua)
            ? 'Opera'
            : /Firefox\//.test(ua)
              ? 'Firefox'
              : /Chrome\//.test(ua)
                ? 'Chrome'
                : /Safari\//.test(ua)
                  ? 'Safari'
                  : 'Navigateur';
  return `${systeme} · ${logiciel}`;
}

export function nomCetAppareil(): string {
  if (typeof navigator === 'undefined') return 'Appareil';
  const w = window as unknown as {
    sixBureau?: unknown;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  const contexte = w.sixBureau ? 'bureau' : w.Capacitor?.isNativePlatform?.() ? 'mobile' : 'web';
  return nomAppareil(navigator.userAgent, contexte);
}

/** À appeler juste avant de lancer une connexion : l'e-mail d'alerte dira comment on s'est connecté. */
export function noterMethode(m: MethodeConnexion): void {
  ecrire('session', CLE_METHODE, m);
}

/** Identifiant de la session dans un jeton d'accès Supabase (pour ne signaler chaque connexion qu'une fois). */
export function sessionDuJeton(jeton: string): string | null {
  try {
    const base = (jeton.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const charge = JSON.parse(
      atob(base.padEnd(base.length + ((4 - (base.length % 4)) % 4), '=')),
    ) as {
      session_id?: unknown;
    };
    return typeof charge.session_id === 'string' ? charge.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Signale une nouvelle connexion (une seule fois par session). Renvoie « bloque » si cet appareil a été bloqué
 * depuis un e-mail d'alerte : l'app doit alors se déconnecter.
 */
export async function signalerConnexion(jetonAcces: string): Promise<'ok' | 'bloque' | 'deja'> {
  const session = sessionDuJeton(jetonAcces);
  if (!session || lire('local', CLE_SIGNALEE) === session) return 'deja';
  ecrire('local', CLE_SIGNALEE, session);
  const methode = (lire('session', CLE_METHODE) as MethodeConnexion | null) ?? 'Connexion';
  ecrire('session', CLE_METHODE, null);
  try {
    const r = await fetch('/api/compte/connexion', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jetonAcces}` },
      body: JSON.stringify({ appareil: identifiantAppareil(), nom: nomCetAppareil(), methode }),
    });
    const d = (await r.json().catch(() => ({}))) as { bloque?: boolean };
    return d.bloque ? 'bloque' : 'ok';
  } catch {
    return 'ok'; // hors ligne : la connexion reste valable, le serveur n'a simplement pas été prévenu
  }
}

/** Cet appareil a-t-il été bloqué depuis un e-mail d'alerte ? (false en cas de doute : hors ligne, serveur…) */
export async function appareilBloque(jetonAcces: string): Promise<boolean> {
  try {
    const r = await fetch(
      `/api/compte/connexion?appareil=${encodeURIComponent(identifiantAppareil())}`,
      {
        headers: { authorization: `Bearer ${jetonAcces}` },
        cache: 'no-store',
      },
    );
    if (!r.ok) return false;
    return ((await r.json()) as { bloque?: boolean }).bloque === true;
  } catch {
    return false;
  }
}

/** Message montré sur l'écran de connexion après un blocage (puis effacé). */
export function marquerBloque(oui: boolean): void {
  ecrire('local', CLE_BLOQUE, oui ? '1' : null);
}
export function etaitBloque(): boolean {
  return lire('local', CLE_BLOQUE) === '1';
}
