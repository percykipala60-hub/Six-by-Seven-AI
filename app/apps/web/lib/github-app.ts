import { createHmac, createSign, timingSafeEqual } from 'node:crypto';

/**
 * Application GitHub « Six by Seven » (serveur uniquement) : relie le compte Six d'une personne aux dépôts qu'elle a
 * autorisés sur GitHub. Six n'a jamais son mot de passe : GitHub donne des jetons d'une heure, limités aux dépôts
 * choisis à l'installation (droits : contenu, pull requests, métadonnées).
 * Réglages : GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET,
 * GITHUB_APP_PRIVATE_KEY_B64 (clé privée .pem en base64). Ils ne quittent jamais le serveur.
 */

const env = (nom: string) => (process.env[nom] ?? '').trim();
const API = 'https://api.github.com';
const ENTETES = {
  accept: 'application/vnd.github+json',
  'user-agent': 'Six-by-Seven',
  'x-github-api-version': '2022-11-28',
};

export class ErreurGithub extends Error {}

export function githubDisponible(): boolean {
  return Boolean(
    env('GITHUB_APP_ID') &&
    env('GITHUB_APP_CLIENT_ID') &&
    env('GITHUB_APP_CLIENT_SECRET') &&
    env('GITHUB_APP_PRIVATE_KEY_B64'),
  );
}

/** Adresse où la personne installe l'application et choisit ses dépôts. */
export function adresseInstallation(etat: string): string {
  const slug = env('GITHUB_APP_SLUG') || 'six-by-seven';
  return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(etat)}`;
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Jeton de l'application elle-même (JWT signé avec sa clé privée, valable 9 minutes). */
export function jetonApplication(maintenant = Math.floor(Date.now() / 1000)): string {
  const cle = Buffer.from(env('GITHUB_APP_PRIVATE_KEY_B64'), 'base64').toString('utf8');
  if (!cle.includes('PRIVATE KEY')) throw new ErreurGithub('Clé de l’application GitHub absente.');
  const entete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const charge = b64url(
    JSON.stringify({ iat: maintenant - 60, exp: maintenant + 540, iss: env('GITHUB_APP_ID') }),
  );
  const signature = createSign('RSA-SHA256').update(`${entete}.${charge}`).sign(cle);
  return `${entete}.${charge}.${b64url(signature)}`;
}

async function appel<T>(chemin: string, init: RequestInit & { jeton: string }): Promise<T> {
  const { jeton, ...reste } = init;
  const res = await fetch(chemin.startsWith('http') ? chemin : `${API}${chemin}`, {
    ...reste,
    headers: { ...ENTETES, authorization: `Bearer ${jeton}`, ...(reste.headers ?? {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ErreurGithub(`GitHub ${res.status}`);
  return (await res.json()) as T;
}

/** Jeton d'une installation (1 heure), limité aux dépôts que la personne a choisis. */
export async function jetonInstallation(installation: number): Promise<string> {
  const d = await appel<{ token: string }>(`/app/installations/${installation}/access_tokens`, {
    method: 'POST',
    jeton: jetonApplication(),
  });
  return d.token;
}

/**
 * Retour de GitHub après l'installation : échange le code contre un jeton de la personne, puis vérifie que
 * l'installation annoncée lui appartient bien (sinon n'importe qui pourrait relier l'installation d'un autre).
 */
export async function verifierInstallation(
  code: string,
  installation: number,
): Promise<{ login: string }> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env('GITHUB_APP_CLIENT_ID'),
      client_secret: env('GITHUB_APP_CLIENT_SECRET'),
      code,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const d = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !d.access_token) throw new ErreurGithub('Autorisation GitHub refusée ou expirée.');
  const jeton = d.access_token;
  const [moi, liste] = await Promise.all([
    appel<{ login: string }>('/user', { jeton }),
    appel<{ installations: { id: number }[] }>('/user/installations?per_page=100', { jeton }),
  ]);
  if (!liste.installations.some((i) => i.id === installation))
    throw new ErreurGithub('Cette installation GitHub n’appartient pas à ce compte.');
  return { login: moi.login };
}

export type DepotGithub = { nom: string; prive: boolean; branche: string; maj: string };

/** Dépôts autorisés pour l'installation (les plus récents d'abord). */
export async function depotsInstallation(installation: number): Promise<DepotGithub[]> {
  const jeton = await jetonInstallation(installation);
  const d = await appel<{
    repositories: {
      full_name: string;
      private: boolean;
      default_branch: string;
      pushed_at: string;
    }[];
  }>('/installation/repositories?per_page=100', { jeton });
  return d.repositories
    .map((r) => ({
      nom: r.full_name,
      prive: r.private,
      branche: r.default_branch,
      maj: r.pushed_at,
    }))
    .sort((a, b) => Date.parse(b.maj) - Date.parse(a.maj));
}

const ETAT_DUREE_MS = 30 * 60_000;

/** État du retour GitHub : lié au compte Six et daté, signé par le serveur (valable 30 minutes). */
export function etatSigne(userId: string, maintenant = Date.now()): string {
  const corps = `${userId}.${maintenant}`;
  const sig = createHmac('sha256', env('GITHUB_APP_CLIENT_SECRET'))
    .update(corps)
    .digest('base64url');
  return `${corps}.${sig}`;
}

export function etatValide(etat: string, userId: string, maintenant = Date.now()): boolean {
  const [id, quand, sig] = etat.split('.');
  if (!id || !quand || !sig || id !== userId) return false;
  const age = maintenant - Number(quand);
  if (!Number.isFinite(age) || age < 0 || age > ETAT_DUREE_MS) return false;
  const attendu = etatSigne(userId, Number(quand)).split('.')[2] ?? '';
  const a = Buffer.from(sig);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}
