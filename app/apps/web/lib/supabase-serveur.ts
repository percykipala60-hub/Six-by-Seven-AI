import { CLE, URL_SUPABASE } from './supabase';

/**
 * Accès à Supabase depuis le serveur uniquement (routes /api) : vérifier le compte qui appelle, lire le premium,
 * enregistrer les paiements. La clé SUPABASE_SERVICE_ROLE_KEY contourne les règles d'accès : elle ne doit
 * JAMAIS arriver dans le navigateur (pas de NEXT_PUBLIC_) ni dans les logs.
 */

const env = (nom: string): string => (process.env[nom] ?? '').trim();

export type Utilisateur = { id: string; email: string; prenom: string; nom: string };

const cache = new Map<string, { u: Utilisateur | null; expire: number }>();
const CACHE_MS = 60_000;

/** Compte connecté qui fait la requête (en-tête Authorization: Bearer <jeton Supabase>), ou null. */
export async function utilisateurDeRequete(req: Request): Promise<Utilisateur | null> {
  const entete = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(entete.trim());
  if (!m || !URL_SUPABASE || !CLE) return null;
  const jeton = m[1];
  const maintenant = Date.now();
  const connu = cache.get(jeton);
  if (connu && connu.expire > maintenant) return connu.u;

  let u: Utilisateur | null = null;
  try {
    const res = await fetch(`${URL_SUPABASE}/auth/v1/user`, {
      headers: { apikey: CLE, authorization: `Bearer ${jeton}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const d = (await res.json()) as {
        id?: unknown;
        email?: unknown;
        user_metadata?: Record<string, unknown>;
      };
      if (typeof d.id === 'string') {
        const meta = d.user_metadata ?? {};
        const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
        const complet = texte(meta.full_name) || texte(meta.name);
        u = {
          id: d.id,
          email: texte(d.email),
          prenom: texte(meta.prenom) || texte(meta.given_name) || complet.split(/\s+/)[0] || '',
          nom: texte(meta.family_name) || complet.split(/\s+/).slice(1).join(' '),
        };
      }
    }
  } catch {
    return null; // Supabase injoignable : on ne garde rien en cache
  }
  if (cache.size > 5_000) cache.clear();
  cache.set(jeton, { u, expire: maintenant + CACHE_MS });
  return u;
}

export function adminDisponible(): boolean {
  return Boolean(URL_SUPABASE && env('SUPABASE_SERVICE_ROLE_KEY'));
}

function entetesAdmin(): Record<string, string> {
  const cle = env('SUPABASE_SERVICE_ROLE_KEY');
  const h: Record<string, string> = { apikey: cle, 'content-type': 'application/json' };
  // Ancienne clé service_role (JWT) : aussi dans Authorization. Nouvelle clé secrète (sb_secret_…) : apikey suffit.
  if (cle.startsWith('eyJ')) h.authorization = `Bearer ${cle}`;
  return h;
}

async function rest(chemin: string, init: RequestInit = {}): Promise<unknown> {
  if (!adminDisponible()) throw new Error('Supabase serveur non configuré');
  const res = await fetch(`${URL_SUPABASE}/rest/v1/${chemin}`, {
    ...init,
    headers: { ...entetesAdmin(), ...(init.headers as Record<string, string> | undefined) },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const texte = await res.text();
  return texte ? (JSON.parse(texte) as unknown) : null;
}

/** Date de fin du premium du compte, ou null s'il n'en a jamais eu. */
export async function finPremium(userId: string): Promise<Date | null> {
  const lignes = await rest(`premium?select=jusqu_a&user_id=eq.${encodeURIComponent(userId)}`);
  const fin = Array.isArray(lignes) ? (lignes[0] as { jusqu_a?: unknown } | undefined) : undefined;
  return typeof fin?.jusqu_a === 'string' ? new Date(fin.jusqu_a) : null;
}

export type StatutPaiement = 'EN_ATTENTE' | 'REUSSI' | 'ECHOUE';

export type Paiement = {
  reference: string;
  user_id: string;
  offre: string;
  jours: number;
  montant: number;
  devise: string;
  canal: 'apple';
  operateur: string | null;
  statut: StatutPaiement;
  cree: string;
};

export async function creerPaiement(p: Omit<Paiement, 'statut' | 'cree'>): Promise<void> {
  await rest('paiements', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(p),
  });
}

export async function lirePaiement(reference: string): Promise<Paiement | null> {
  const lignes = await rest(`paiements?select=*&reference=eq.${encodeURIComponent(reference)}`);
  return Array.isArray(lignes) && lignes[0] ? (lignes[0] as Paiement) : null;
}

/** Passe le paiement à REUSSI et prolonge le premium, une seule fois (fonction SQL activer_paiement). */
export async function activerPaiement(reference: string): Promise<void> {
  await rest('rpc/activer_paiement', {
    method: 'POST',
    body: JSON.stringify({ p_reference: reference }),
  });
}

// ---------- Sécurité des connexions (voir app/setup_securite_connexion_supabase.sql) ----------

const sha256 = async (texte: string): Promise<string> =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))),
    (o) => o.toString(16).padStart(2, '0'),
  ).join('');

/** Identifiant de la session Supabase contenu dans un jeton (déjà vérifié par utilisateurDeRequete). */
export function sessionDuJeton(jeton: string): string | null {
  try {
    const charge = JSON.parse(
      Buffer.from(jeton.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { session_id?: unknown };
    return typeof charge.session_id === 'string' ? charge.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Enregistre une connexion (appareil, méthode, session) et renvoie le jeton du lien de l'e-mail d'alerte.
 * « bloque » : cet appareil a déjà été bloqué depuis un e-mail d'alerte (la connexion doit être refusée).
 */
export async function enregistrerConnexion(c: {
  userId: string;
  appareil: string;
  nom: string;
  methode: string;
  sessionId: string | null;
}): Promise<{ jeton: string; bloque: boolean }> {
  const existant = (await rest(
    `six_appareils?select=bloque&user_id=eq.${encodeURIComponent(c.userId)}&appareil=eq.${encodeURIComponent(c.appareil)}`,
  )) as { bloque: boolean }[];
  if (existant?.[0]?.bloque) return { jeton: '', bloque: true };
  const jeton = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await rest('six_appareils?on_conflict=user_id,appareil', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: c.userId,
      appareil: c.appareil,
      nom: c.nom.slice(0, 120),
      methode: c.methode.slice(0, 30),
      session_id: c.sessionId,
      jeton_hash: await sha256(jeton),
      confirme: false,
      derniere_connexion: new Date().toISOString(),
    }),
  });
  return { jeton, bloque: false };
}

/** Cet appareil a-t-il été bloqué depuis un e-mail d'alerte ? */
export async function appareilBloque(userId: string, appareil: string): Promise<boolean> {
  const lignes = (await rest(
    `six_appareils?select=bloque&user_id=eq.${encodeURIComponent(userId)}&appareil=eq.${encodeURIComponent(appareil)}`,
  )) as { bloque: boolean }[];
  return Boolean(lignes?.[0]?.bloque);
}

/** Réponse au lien de l'e-mail d'alerte : bloquer l'appareil (et couper sa session) ou confirmer. */
export async function repondreAlerte(
  jeton: string,
  bloquer: boolean,
): Promise<{ nom: string; methode: string; bloque: boolean } | null> {
  const lignes = (await rest('rpc/six_reponse_alerte', {
    method: 'POST',
    body: JSON.stringify({ p_jeton: jeton, p_bloquer: bloquer }),
  })) as { nom: string; methode: string; bloque: boolean }[];
  return lignes?.[0] ?? null;
}

/**
 * Connexion par code QR : l'appareil déjà connecté approuve la demande. Le serveur fabrique un jeton de connexion
 * à usage unique (lien magique, sans e-mail envoyé) que l'autre appareil récupère une seule fois.
 */
export async function approuverQr(
  demande: { id: string; secret: string },
  utilisateur: { id: string; email: string },
): Promise<'ok' | 'introuvable'> {
  if (!utilisateur.email) throw new Error('Compte sans adresse e-mail');
  const lien = await fetch(`${URL_SUPABASE}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: entetesAdmin(),
    body: JSON.stringify({ type: 'magiclink', email: utilisateur.email }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!lien.ok) throw new Error(`Supabase ${lien.status}`);
  const d = (await lien.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const tokenHash = d.properties?.hashed_token ?? d.hashed_token;
  if (!tokenHash) throw new Error('Jeton de connexion absent');
  const maj = (await rest(
    `six_connexions_qr?id=eq.${encodeURIComponent(demande.id)}&secret_hash=eq.${await sha256(demande.secret)}` +
      `&statut=eq.attente&expire_le=gt.${encodeURIComponent(new Date().toISOString())}`,
    {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ statut: 'approuve', user_id: utilisateur.id, token_hash: tokenHash }),
    },
  )) as unknown[];
  return Array.isArray(maj) && maj.length ? 'ok' : 'introuvable';
}

// ---------- Appareils connectés (Réglages) ----------

export type AppareilCompte = {
  appareil: string;
  nom: string;
  methode: string;
  cree_le: string;
  derniere_connexion: string;
  connecte: boolean;
};

/** Appareils du compte (les plus récents d'abord), avec « connecte » : leur session existe encore. */
export async function listerAppareils(userId: string): Promise<AppareilCompte[]> {
  const lignes = await rest('rpc/six_appareils_lister', {
    method: 'POST',
    body: JSON.stringify({ p_user: userId }),
  });
  return Array.isArray(lignes) ? (lignes as AppareilCompte[]) : [];
}

/** Déconnecte un appareil du compte (sa session est supprimée ; il n'est pas bloqué). */
export async function deconnecterAppareil(userId: string, appareil: string): Promise<boolean> {
  return (
    (await rest('rpc/six_appareil_deconnecter', {
      method: 'POST',
      body: JSON.stringify({ p_user: userId, p_appareil: appareil }),
    })) === true
  );
}

/**
 * La session d'un jeton existe-t-elle encore ? « fermee » : elle a été supprimée (déconnexion depuis un autre
 * appareil, « Déconnecter tous les autres », blocage) ; « inconnue » : Supabase injoignable (on ne déconnecte pas).
 */
export async function etatSession(jeton: string): Promise<'active' | 'fermee' | 'inconnue'> {
  if (!URL_SUPABASE || !CLE) return 'inconnue';
  try {
    const res = await fetch(`${URL_SUPABASE}/auth/v1/user`, {
      headers: { apikey: CLE, authorization: `Bearer ${jeton}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) return 'active';
    // Seule une session supprimée compte : un jeton expiré ou invalide (« bad_jwt ») se renouvelle tout seul.
    const d = (await res.json().catch(() => ({}))) as { error_code?: string };
    return d.error_code === 'session_not_found' ? 'fermee' : 'inconnue';
  } catch {
    return 'inconnue';
  }
}

/** Session enregistrée pour chaque appareil du compte (pour reconnaître l'appareil qui fait une demande). */
export async function sessionsDesAppareils(userId: string): Promise<Map<string, string | null>> {
  const lignes = (await rest(
    `six_appareils?select=appareil,session_id&user_id=eq.${encodeURIComponent(userId)}`,
  )) as { appareil: string; session_id: string | null }[];
  return new Map((lignes ?? []).map((l) => [l.appareil, l.session_id]));
}
