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
  canal: 'mobile' | 'carte';
  operateur: string | null;
  statut: StatutPaiement;
  maishapay_id: string | null;
  cree: string;
};

export async function creerPaiement(
  p: Omit<Paiement, 'statut' | 'maishapay_id' | 'cree'>,
): Promise<void> {
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

/** Met à jour un paiement encore en attente (un paiement réussi n'est plus jamais modifié ici). */
export async function majPaiement(
  reference: string,
  champs: Partial<Pick<Paiement, 'statut' | 'maishapay_id'>>,
): Promise<void> {
  await rest(`paiements?reference=eq.${encodeURIComponent(reference)}&statut=eq.EN_ATTENTE`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ ...champs, maj: new Date().toISOString() }),
  });
}

/** Passe le paiement à REUSSI et prolonge le premium, une seule fois (fonction SQL activer_paiement). */
export async function activerPaiement(reference: string): Promise<void> {
  await rest('rpc/activer_paiement', {
    method: 'POST',
    body: JSON.stringify({ p_reference: reference }),
  });
}
