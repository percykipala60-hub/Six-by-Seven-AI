/**
 * Compteurs du jour pour la version gratuite (analyses dans Six, messages dans Seven AI).
 * Partagés par Upstash Redis s'il est configuré, sinon gardés en mémoire du serveur (remis à zéro au redémarrage).
 * La clé est hachée : ni l'identifiant du compte ni l'adresse ne sont stockés en clair.
 */

export type TypeQuota = 'analyses' | 'messages' | 'synthese';

const memoire = new Map<string, number>();
const SCRIPT =
  'local n = redis.call("INCR", KEYS[1]); if n == 1 then redis.call("EXPIRE", KEYS[1], 172800); end; return n';

const env = (nom: string): string => (process.env[nom] ?? '').trim();

async function hacher(texte: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(d), (o) => o.toString(16).padStart(2, '0')).join('');
}

async function incrementer(cle: string): Promise<number> {
  const url = env('UPSTASH_REDIS_REST_URL');
  const jeton = env('UPSTASH_REDIS_REST_TOKEN');
  if (url && jeton) {
    const res = await fetch(`${new URL(url).origin}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify([['EVAL', SCRIPT, '1', cle]]),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error('Compteur partagé indisponible');
    const r = (await res.json()) as { result?: unknown }[];
    if (typeof r?.[0]?.result !== 'number') throw new Error('Compteur partagé illisible');
    return r[0].result;
  }
  const jour = cle.split(':')[3];
  if (memoire.size > 50_000) {
    for (const k of memoire.keys()) if (k.split(':')[3] !== jour) memoire.delete(k);
    if (memoire.size > 50_000) memoire.clear();
  }
  const n = (memoire.get(cle) ?? 0) + 1;
  memoire.set(cle, n);
  return n;
}

/**
 * Compte une utilisation et dit si la limite du jour est dépassée. Une limite à 0 veut dire « sans limite ».
 * Si le compteur partagé est en panne, on laisse passer (le plafond AI_DAILY_LIMIT protège le budget).
 */
export async function depasse(
  type: TypeQuota,
  cleAppelant: string,
  limite: number,
): Promise<boolean> {
  if (!limite) return false;
  const jour = new Date().toISOString().slice(0, 10);
  const sel = env('RATE_LIMIT_HASH_SECRET') || 'six-quotas';
  try {
    const n = await incrementer(
      `six:quota:${type}:${jour}:${await hacher(`${sel}:${cleAppelant}`)}`,
    );
    return n > limite;
  } catch {
    console.error('[quotas] compteur indisponible, demande acceptée');
    return false;
  }
}

/** Vide les compteurs en mémoire (tests). */
export function viderQuotas(): void {
  memoire.clear();
}
