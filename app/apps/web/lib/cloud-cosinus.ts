import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { CLE, URL_SUPABASE } from './supabase';

/**
 * Cosinus dans le Cloud (voir app/setup_cosinus_cloud_supabase.sql) : des environnements en ligne avec leurs
 * fichiers, liés au compte. Toutes les lectures et écritures passent avec la session de la personne (son jeton) :
 * les règles de Supabase (row level security) garantissent qu'elle n'accède qu'à ses propres données.
 *
 * Pour qu'une tâche de l'agent travaille sur un environnement cloud, ses fichiers sont copiés dans un dossier
 * temporaire du serveur (materialiser), l'agent y travaille comme en local, puis ce qui a changé repart dans le
 * Cloud (synchroniser) et le dossier temporaire est effacé.
 */

export type EnvironnementCloud = {
  id: string;
  nom: string;
  depot_github: string | null;
  branche: string | null;
  par_defaut: boolean;
  maj: string;
};
export type FichierCloud = { chemin: string; taille: number; maj: number };

export const FICHIER_CLOUD_MAX = 10 * 1024 * 1024;
const IMPORT_FICHIER_MAX = 2 * 1024 * 1024;
const IMPORT_TOTAL_MAX = 50 * 1024 * 1024;
const IMPORT_FICHIERS_MAX = 400;
const LOT = 40;

export class ErreurCloud extends Error {}

async function rest(jeton: string, chemin: string, init: RequestInit = {}): Promise<unknown> {
  if (!URL_SUPABASE || !CLE) throw new ErreurCloud('Le Cloud est indisponible pour le moment.');
  const res = await fetch(`${URL_SUPABASE}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: CLE,
      authorization: `Bearer ${jeton}`,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const corps = await res.text().catch(() => '');
    if (
      res.status === 404 ||
      (/cosinus_(environnements|fichiers)/.test(corps) && /does not exist|not find/i.test(corps))
    )
      throw new ErreurCloud(
        'Le Cloud de Cosinus n’est pas encore activé : exécute app/setup_cosinus_cloud_supabase.sql dans Supabase.',
      );
    if (/Place du Cloud épuisée/.test(corps))
      throw new ErreurCloud('Place du Cloud épuisée (200 Mo).');
    throw new ErreurCloud(`Cloud indisponible (${res.status}).`);
  }
  const texte = await res.text();
  return texte ? (JSON.parse(texte) as unknown) : null;
}

const id = (v: string) => encodeURIComponent(v);

/** Chemin d'un fichier cloud valide (relatif, sans « .. », sans barre oblique inverse), ou null. */
export function cheminCloud(chemin: unknown): string | null {
  if (typeof chemin !== 'string') return null;
  const c = chemin.replace(/^\/+/, '');
  if (!c || c.length > 400 || c.includes('\\') || c.includes('\0')) return null;
  if (c.split('/').some((s) => s === '..' || s === '.' || s === '')) return null;
  return c;
}

/** Environnements cloud du compte ; « Mon cloud » est créé s'il manque (compte d'avant le script SQL). */
export async function environnementsCloud(
  jeton: string,
  userId: string,
): Promise<EnvironnementCloud[]> {
  const lire = async () =>
    ((await rest(
      jeton,
      'cosinus_environnements?select=id,nom,depot_github,branche,par_defaut,maj&order=maj.desc',
    )) ?? []) as EnvironnementCloud[];
  let envs = await lire();
  if (!envs.some((e) => e.par_defaut)) {
    await rest(jeton, 'cosinus_environnements', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, nom: 'Mon cloud', par_defaut: true }),
    }).catch(() => {});
    envs = await lire();
  }
  return envs;
}

export async function creerEnvironnementCloud(
  jeton: string,
  userId: string,
  nom: string,
  depot: string | null,
  branche: string | null,
): Promise<EnvironnementCloud> {
  const lignes = (await rest(jeton, 'cosinus_environnements', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: userId,
      nom: nom.trim().slice(0, 60) || (depot ? depot.split('/')[1] : 'Environnement cloud'),
      depot_github: depot,
      branche,
    }),
  })) as EnvironnementCloud[];
  if (!lignes?.[0]) throw new ErreurCloud('Création de l’environnement impossible.');
  return lignes[0];
}

export async function fichiersCloud(jeton: string, env: string): Promise<FichierCloud[]> {
  const lignes = ((await rest(
    jeton,
    `cosinus_fichiers?select=chemin,taille,maj&environnement=eq.${id(env)}&order=chemin.asc&limit=5000`,
  )) ?? []) as { chemin: string; taille: number; maj: string }[];
  return lignes.map((l) => ({ chemin: l.chemin, taille: l.taille, maj: Date.parse(l.maj) || 0 }));
}

export async function lireFichierCloud(
  jeton: string,
  env: string,
  chemin: string,
): Promise<Buffer | null> {
  const c = cheminCloud(chemin);
  if (!c) return null;
  const lignes = (await rest(
    jeton,
    `cosinus_fichiers?select=contenu&environnement=eq.${id(env)}&chemin=eq.${id(c)}`,
  )) as { contenu: string }[];
  return lignes?.[0] ? Buffer.from(lignes[0].contenu, 'base64') : null;
}

/** Écrit des fichiers (création ou remplacement), par lots. */
export async function ecrireFichiersCloud(
  jeton: string,
  userId: string,
  env: string,
  fichiers: { chemin: string; octets: Buffer }[],
): Promise<string[]> {
  const ecrits: string[] = [];
  const valides = fichiers.filter(
    (f) => cheminCloud(f.chemin) && f.octets.length <= FICHIER_CLOUD_MAX,
  );
  for (let i = 0; i < valides.length; i += LOT) {
    const lot = valides.slice(i, i + LOT);
    await rest(jeton, 'cosinus_fichiers?on_conflict=environnement,chemin', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(
        lot.map((f) => ({
          environnement: env,
          user_id: userId,
          chemin: cheminCloud(f.chemin),
          contenu: f.octets.toString('base64'),
          taille: f.octets.length,
        })),
      ),
    });
    ecrits.push(...lot.map((f) => f.chemin));
  }
  await rest(jeton, `cosinus_environnements?id=eq.${id(env)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ maj: new Date().toISOString() }),
  }).catch(() => {});
  return ecrits;
}

// ---------- Explorateur : contenu direct d'un dossier, à partir de la liste des fichiers ----------

export type EntreeNiveau = {
  nom: string;
  chemin: string;
  type: 'dossier' | 'fichier';
  taille: number;
  maj: number;
};

export function niveauDepuisListe(fichiers: FichierCloud[], relatif: string): EntreeNiveau[] {
  const prefixe = relatif ? `${relatif.replace(/\/+$/, '')}/` : '';
  const vus = new Map<string, EntreeNiveau>();
  for (const f of fichiers) {
    if (!f.chemin.startsWith(prefixe)) continue;
    const reste = f.chemin.slice(prefixe.length);
    const [nom, ...suite] = reste.split('/');
    if (!nom || nom.startsWith('.')) continue;
    const chemin = `${prefixe}${nom}`;
    if (suite.length) {
      const d = vus.get(chemin);
      if (!d) vus.set(chemin, { nom, chemin, type: 'dossier', taille: 0, maj: f.maj });
      else d.maj = Math.max(d.maj, f.maj);
    } else vus.set(chemin, { nom, chemin, type: 'fichier', taille: f.taille, maj: f.maj });
  }
  return [...vus.values()].sort((a, b) =>
    a.type !== b.type
      ? a.type === 'dossier'
        ? -1
        : 1
      : a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base', numeric: true }),
  );
}

// ---------- « Auto » : l'environnement choisi selon le dépôt cité dans la demande ----------

/** Dépôt GitHub cité dans un texte (« github.com/owner/depot » ou « owner/depot »), ou null. */
export function depotDeTexte(texte: string): string | null {
  const url = /github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})/i.exec(texte);
  if (url) return `${url[1]}/${url[2].replace(/\.git$/i, '')}`;
  const court = /^\s*([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})\s*$/.exec(texte);
  return court ? `${court[1]}/${court[2].replace(/\.git$/i, '')}` : null;
}

/** Auto : l'environnement lié au dépôt cité dans la demande, sinon « Mon cloud ». */
export function choisirAuto(
  envs: EnvironnementCloud[],
  question: string,
): EnvironnementCloud | undefined {
  const cite = depotDeTexte(question)?.toLowerCase();
  if (cite) {
    const lie = envs.find((e) => e.depot_github?.toLowerCase() === cite);
    if (lie) return lie;
  }
  // Un dépôt nommé sans « owner/ » : « travaille sur six-app ».
  const nomme = envs.find(
    (e) =>
      e.depot_github &&
      new RegExp(
        `(^|[^\\w-])${e.depot_github.split('/')[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`,
        'i',
      ).test(question),
  );
  return nomme ?? envs.find((e) => e.par_defaut) ?? envs[0];
}

// ---------- Import d'un dépôt GitHub public ----------

/** Fichiers d'un .zip (sans dossiers), décompressés côté serveur, dans les limites de l'import. */
export function fichiersDuZip(zip: Buffer): { nom: string; octets: Buffer }[] {
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--)
    if (zip.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  if (fin < 0) throw new ErreurCloud('Archive du dépôt illisible.');
  const nombre = zip.readUInt16LE(fin + 10);
  let p = zip.readUInt32LE(fin + 16);
  const sortie: { nom: string; octets: Buffer }[] = [];
  let total = 0;
  for (let i = 0; i < nombre && sortie.length < IMPORT_FICHIERS_MAX; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const methode = zip.readUInt16LE(p + 10);
    const taille = zip.readUInt32LE(p + 20);
    const tailleReelle = zip.readUInt32LE(p + 24);
    const lnom = zip.readUInt16LE(p + 28);
    const lextra = zip.readUInt16LE(p + 30);
    const lcomm = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const nom = zip.toString('utf8', p + 46, p + 46 + lnom);
    p += 46 + lnom + lextra + lcomm;
    if (nom.endsWith('/') || tailleReelle > IMPORT_FICHIER_MAX) continue;
    if (total + tailleReelle > IMPORT_TOTAL_MAX) break;
    const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const brut = zip.subarray(debut, debut + taille);
    const octets = methode === 0 ? Buffer.from(brut) : methode === 8 ? inflateRawSync(brut) : null;
    if (!octets) continue;
    total += octets.length;
    sortie.push({ nom, octets });
  }
  return sortie;
}

const GITHUB_UA = { 'user-agent': 'Six-Cosinus', accept: 'application/vnd.github+json' };

/**
 * Importe un dépôt GitHub dans l'environnement (fichiers de 2 Mo au plus, 400 au plus, 50 Mo en tout). Avec le jeton
 * de l'application GitHub de la personne (Réglages → Cloud → GitHub), les dépôts privés qu'elle a autorisés aussi.
 */
export async function importerDepotGithub(
  jeton: string,
  userId: string,
  env: string,
  depot: string,
  branche: string | null,
  jetonGithub?: string,
): Promise<{ importes: number; branche: string }> {
  const auth: Record<string, string> = jetonGithub
    ? { authorization: `Bearer ${jetonGithub}` }
    : {};
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(depot))
    throw new ErreurCloud('Dépôt GitHub invalide : écris-le sous la forme proprietaire/depot.');
  const infos = await fetch(`https://api.github.com/repos/${depot}`, {
    headers: { ...GITHUB_UA, ...auth },
    signal: AbortSignal.timeout(15_000),
  });
  if (infos.status === 404)
    throw new ErreurCloud(
      jetonGithub
        ? 'Dépôt introuvable, ou pas autorisé pour Six : ajoute-le dans Réglages → Cloud → GitHub.'
        : 'Dépôt introuvable ou privé. Pour un dépôt privé, connecte GitHub dans Réglages → Cloud.',
    );
  if (!infos.ok) throw new ErreurCloud('GitHub ne répond pas pour le moment. Réessayez.');
  const d = (await infos.json()) as { default_branch?: string; size?: number };
  if ((d.size ?? 0) > 200_000)
    throw new ErreurCloud('Dépôt trop gros pour le Cloud (200 Mo au plus).');
  const b = branche?.trim() || d.default_branch || 'main';
  // Avec un jeton : l'archive passe par l'API (elle redirige vers un lien temporaire, dépôts privés compris).
  const zip = await fetch(
    jetonGithub
      ? `https://api.github.com/repos/${depot}/zipball/${encodeURIComponent(b)}`
      : `https://codeload.github.com/${depot}/zip/refs/heads/${encodeURIComponent(b)}`,
    {
      headers: { 'user-agent': 'Six-Cosinus', ...auth },
      redirect: 'follow',
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!zip.ok) throw new ErreurCloud(`Branche « ${b} » introuvable dans ${depot}.`);
  const fichiers = fichiersDuZip(Buffer.from(await zip.arrayBuffer()))
    // L'archive met tout dans « depot-branche/ » : on retire ce premier dossier.
    .map((f) => ({ chemin: f.nom.split('/').slice(1).join('/'), octets: f.octets }))
    .filter((f) => cheminCloud(f.chemin));
  const ecrits = await ecrireFichiersCloud(jeton, userId, env, fichiers);
  return { importes: ecrits.length, branche: b };
}

// ---------- Tâche de l'agent sur un environnement cloud ----------

const empreinte = (o: Buffer) => createHash('sha256').update(o).digest('hex');

/** Copie les fichiers de l'environnement dans un dossier temporaire ; renvoie le dossier et l'état de départ. */
export async function materialiser(
  jeton: string,
  env: string,
): Promise<{ dossier: string; avant: Map<string, string> }> {
  const dossier = await fs.mkdtemp(path.join(tmpdir(), 'six-cloud-'));
  const avant = new Map<string, string>();
  for (const f of await fichiersCloud(jeton, env)) {
    const octets = await lireFichierCloud(jeton, env, f.chemin);
    const c = cheminCloud(f.chemin);
    if (!octets || !c) continue;
    const abs = path.resolve(dossier, c);
    if (!abs.startsWith(dossier + path.sep)) continue;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, octets);
    avant.set(c, empreinte(octets));
  }
  return { dossier, avant };
}

/** Renvoie au Cloud les fichiers créés ou modifiés pendant la tâche, puis efface le dossier temporaire. */
export async function synchroniser(
  jeton: string,
  userId: string,
  env: string,
  dossier: string,
  avant: Map<string, string>,
): Promise<string[]> {
  try {
    const changes: { chemin: string; octets: Buffer }[] = [];
    const parcourir = async (d: string) => {
      for (const e of await fs.readdir(d, { withFileTypes: true })) {
        const abs = path.join(d, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) await parcourir(abs);
        else if (e.isFile()) {
          const chemin = path.relative(dossier, abs).split(path.sep).join('/');
          const octets = await fs.readFile(abs);
          if (avant.get(chemin) !== empreinte(octets)) changes.push({ chemin, octets });
        }
      }
    };
    await parcourir(dossier);
    return await ecrireFichiersCloud(jeton, userId, env, changes);
  } finally {
    await fs.rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
