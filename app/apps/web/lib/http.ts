import { NextResponse } from 'next/server';
import { ProviderError } from './providers';
import { utilisateurDeRequete } from './supabase-serveur';

const WINDOW_MS = 60_000;
/**
 * Deux compteurs séparés par adresse : « ia » (appels qui coûtent : réponse, analyse, voix…) et « leger »
 * (relais des actions de l'ordinateur, vérifications du compte, fichiers de l'espace). Avant, tout partageait
 * 20 appels par minute : une tâche de Six sur l'ordinateur (un appel par action) se bloquait elle-même.
 */
export type Seau = 'ia' | 'leger';
const MAX_PAR_SEAU: Record<Seau, number> = { ia: 20, leger: 120 };
const hits = new Map<string, number[]>();
const RATE_LIMIT_SCRIPT =
  'local count = redis.call("INCR", KEYS[1]); if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]); end; return count';

/**
 * Adresse du client, pour la limite de débit.
 * L'en-tête X-Forwarded-For peut être inventé par n'importe qui : on ne le lit que si TRUST_PROXY indique
 * combien de relais de confiance (l'hébergeur) le complètent, et on prend l'adresse ajoutée par le dernier relais
 * de confiance, jamais celle fournie par le client. Sans TRUST_PROXY, toutes les requêtes partagent une même limite.
 */
export function clientKey(req: Request): string {
  const hops = Number(process.env.TRUST_PROXY || 0);
  if (Number.isInteger(hops) && hops > 0) {
    const list = (req.headers.get('x-forwarded-for') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = list[list.length - hops];
    if (ip) return ip;
  }
  return 'direct';
}

/** Limite de 20 requêtes par minute et par adresse. Production utilise un compteur Redis partagé. */
function localRateLimited(req: Request, seau: Seau = 'ia'): boolean {
  const key = `${seau}:${clientKey(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    // Nettoyage des adresses inactives (on ne vide jamais tout : ce serait une remise à zéro pour tous).
    for (const [k, times] of hits) if (now - times[times.length - 1] >= WINDOW_MS) hits.delete(k);
  }
  return recent.length > MAX_PAR_SEAU[seau];
}

async function sharedRateLimited(req: Request, seau: Seau = 'ia'): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  const production = process.env.NODE_ENV === 'production';

  if (!url || !token || !secret) {
    return localRateLimited(req, seau);
  }

  const endpoint = new URL(url);
  if (production && endpoint.protocol !== 'https:')
    throw new Error('Shared rate-limit store must use HTTPS');
  if (production && secret.length < 32)
    throw new Error('Rate-limit hash secret must be at least 32 characters');

  const hops = Number(process.env.TRUST_PROXY || 0);
  if (production && (!Number.isInteger(hops) || hops < 1)) return localRateLimited(req, seau);
  const address = clientKey(req);
  if (production && address === 'direct') return localRateLimited(req, seau);

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${secret}:${address}`),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const response = await fetch(`${endpoint.origin}/pipeline`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify([
      ['EVAL', RATE_LIMIT_SCRIPT, '1', `six:rate-limit:${seau}:${hash}`, String(WINDOW_MS)],
    ]),
    cache: 'no-store',
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error('Shared rate-limit store request failed');

  const result: unknown = await response.json();
  if (
    !Array.isArray(result) ||
    !result[0] ||
    typeof result[0] !== 'object' ||
    !('result' in result[0]) ||
    typeof result[0].result !== 'number'
  ) {
    throw new Error('Shared rate-limit store returned an invalid response');
  }
  return result[0].result > MAX_PAR_SEAU[seau];
}

export async function rateLimited(req: Request, seau: Seau = 'ia'): Promise<boolean> {
  return sharedRateLimited(req, seau);
}

/**
 * Adresses du site lui-même. Derrière un relais (Caddy sur le serveur), l'adresse vue par Next.js est interne
 * (http://localhost:3000) : l'adresse publique vient alors des en-têtes Host / X-Forwarded-Host, et le
 * protocole de X-Forwarded-Proto, lu seulement si TRUST_PROXY déclare un relais de confiance.
 */
function ownOrigins(req: Request): string[] {
  const url = new URL(req.url);
  const origines = [url.origin];
  const relais = Number(process.env.TRUST_PROXY || 0) > 0;
  const hote = (relais && req.headers.get('x-forwarded-host')) || req.headers.get('host');
  if (hote) {
    const proto =
      (relais && req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()) ||
      url.protocol.replace(':', '');
    origines.push(`${proto}://${hote.split(',')[0].trim()}`);
  }
  return origines;
}

/** Sites autorisés à appeler l'API : le site lui-même, plus ALLOWED_ORIGINS (séparés par des virgules). */
function allowedOrigin(req: Request, origin: string): boolean {
  const own = ownOrigins(req);
  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return own.includes(origin) || extra.includes(origin);
}

/**
 * Refuse les appels venant d'un autre site. Un navigateur envoie toujours l'en-tête Origin ou Sec-Fetch-Site
 * sur ces requêtes : une requête sans aucun des deux ne vient pas de l'app.
 * Limite : un script peut imiter ces en-têtes. La vraie protection de la clé reste les comptes et quotas,
 * plus le plafond quotidien (AI_DAILY_LIMIT) et la limite de dépense chez le fournisseur.
 */
export function foreignOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin) return !allowedOrigin(req, origin);
  const site = req.headers.get('sec-fetch-site');
  if (site) return site !== 'same-origin' && site !== 'none';
  return process.env.ALLOW_NO_ORIGIN !== '1';
}

/** Contrôles communs à toutes les routes d'IA. Renvoie une réponse d'erreur, ou null si la requête peut continuer. */
export async function guard(
  req: Request,
  compteRequis = false,
  seau: Seau = 'ia',
): Promise<NextResponse | null> {
  if (foreignOrigin(req)) return fail(403, 'Requête non autorisée.');
  if (compteRequis && !(await utilisateurDeRequete(req)))
    return fail(401, 'Connectez-vous pour utiliser Six.');
  try {
    if (await rateLimited(req, seau)) return fail(429, 'Trop de demandes. Attendez une minute.');
  } catch (error) {
    console.error(
      '[rate-limit] protection distribuée indisponible',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return fail(503, 'La protection est temporairement indisponible. Réessayez dans un instant.');
  }
  return null;
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Lit un JSON de petite taille. Refuse d'abord selon la taille annoncée. Ne journalise jamais le contenu. */
export async function readJson(
  req: Request,
  maxBytes = 20_000,
): Promise<Record<string, unknown> | null> {
  const announced = Number(req.headers.get('content-length') ?? 0);
  if (announced > maxBytes) return null;
  try {
    if (!req.body) return null;
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function providerFail(e: unknown): NextResponse {
  if (e instanceof ProviderError) return fail(502, e.message);
  return fail(500, 'Erreur inattendue. Réessayez.');
}
