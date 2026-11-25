import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Espace de travail de Cosinus : un dossier précis sur l'ordinateur, où Six prend des fichiers et range ses
 * résultats. Pour l'instant, seulement en local :
 * - SIXTOUCH_DOSSIER (chemin absolu) choisit le dossier ;
 * - sans réglage, en développement (`pnpm dev`), c'est `ia/espace-sixtouch/` à la racine du projet ;
 * - en production sans réglage, l'espace n'existe pas.
 * Rien ne peut sortir du dossier : chemins relatifs vérifiés, liens symboliques et fichiers cachés ignorés.
 */

export const ESPACE_FICHIERS_MAX = 500;
export const ESPACE_PROFONDEUR_MAX = 4;
export const ESPACE_LECTURE_MAX = 25 * 1024 * 1024;
export const ESPACE_ECRITURE_MAX = 2 * 1024 * 1024;
export const DOSSIER_RESULTATS = 'resultats';
const EXT_ECRITURE = /\.(md|txt|csv|json|html)$/i;

export type FichierEspace = { chemin: string; taille: number; maj: number };

export function dossierEspace(): string {
  const v = (process.env.SIXTOUCH_DOSSIER ?? '').trim();
  if (v) return path.resolve(/*turbopackIgnore: true*/ v);
  if (process.env.NODE_ENV === 'development')
    return path.resolve(
      /*turbopackIgnore: true*/ process.cwd(),
      '..',
      '..',
      '..',
      'ia',
      'espace-sixtouch',
    );
  return '';
}

/** Chemin relatif (séparateur « / ») → chemin absolu dans l'espace, ou null s'il en sortirait. */
export function cheminSur(racine: string, relatif: unknown): string | null {
  if (typeof relatif !== 'string' || !relatif || relatif.length > 400 || relatif.includes('\0'))
    return null;
  if (path.isAbsolute(relatif) || /^[a-z]:/i.test(relatif)) return null;
  const abs = path.resolve(racine, relatif);
  const rel = path.relative(racine, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (rel.split(path.sep).some((s) => s.startsWith('.'))) return null; // fichiers et dossiers cachés
  return abs;
}

/** Vérifie, liens résolus, que le fichier est bien dans l'espace (un lien symbolique ne doit pas en sortir). */
async function vraimentDedans(racine: string, abs: string): Promise<boolean> {
  const [r, a] = await Promise.all([
    fs.realpath(/*turbopackIgnore: true*/ racine),
    fs.realpath(/*turbopackIgnore: true*/ abs),
  ]);
  const rel = path.relative(r, a);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export async function preparerEspace(racine: string): Promise<void> {
  await fs.mkdir(/*turbopackIgnore: true*/ path.join(racine, DOSSIER_RESULTATS), {
    recursive: true,
  });
}

/** Liste les fichiers (sous-dossiers compris, 4 niveaux et 500 fichiers au plus), les plus récents d'abord. */
export async function listerEspace(racine: string): Promise<FichierEspace[]> {
  const fichiers: FichierEspace[] = [];
  const parcourir = async (dossier: string, profondeur: number) => {
    if (profondeur > ESPACE_PROFONDEUR_MAX || fichiers.length >= ESPACE_FICHIERS_MAX) return;
    const entrees = await fs.readdir(/*turbopackIgnore: true*/ dossier, { withFileTypes: true });
    for (const e of entrees) {
      if (fichiers.length >= ESPACE_FICHIERS_MAX) return;
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const abs = path.join(dossier, e.name);
      if (e.isDirectory()) await parcourir(abs, profondeur + 1);
      else if (e.isFile()) {
        const s = await fs.stat(/*turbopackIgnore: true*/ abs);
        fichiers.push({
          chemin: path.relative(racine, abs).split(path.sep).join('/'),
          taille: s.size,
          maj: s.mtimeMs,
        });
      }
    }
  };
  await parcourir(racine, 0);
  return fichiers.sort((a, b) => b.maj - a.maj);
}

/** Lit un fichier de l'espace (25 Mo au plus). Null s'il n'existe pas, sort de l'espace ou est trop gros. */
export async function lireEspace(racine: string, relatif: unknown): Promise<Buffer | null> {
  const abs = cheminSur(racine, relatif);
  if (!abs) return null;
  try {
    const s = await fs.lstat(/*turbopackIgnore: true*/ abs);
    if (!s.isFile() || s.size > ESPACE_LECTURE_MAX) return null;
    if (!(await vraimentDedans(racine, abs))) return null;
    return await fs.readFile(/*turbopackIgnore: true*/ abs);
  } catch {
    return null;
  }
}

/** Nom de fichier sûr (sans dossier ni caractère interdit), avec une extension de texte. */
export function nomSur(nom: unknown): string {
  const base = (typeof nom === 'string' ? nom : '')
    .normalize('NFC')
    // Caractères interdits dans un nom de fichier, puis caractères de contrôle (codes 0 à 31).
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[^\P{Cc}]+/gu, '-')
    .replace(/^[.\s-]+/, '')
    .trim()
    .slice(0, 80);
  const propre = base || 'resultat-six';
  return EXT_ECRITURE.test(propre) ? propre : `${propre}.md`;
}

/** Enregistre un résultat de Six dans `resultats/` (jamais par-dessus un fichier existant). */
/**
 * Écrit un fichier de l'espace en remplaçant la version existante (modification d'un rapport, régénération de son
 * Word et de son PDF). Même protections que la lecture : chemin vérifié, pas de lien qui sortirait de l'espace.
 */
export async function ecrireEnPlace(
  racine: string,
  relatif: string,
  donnees: string | Buffer,
): Promise<string> {
  const abs = cheminSur(racine, relatif);
  if (!abs) throw new Error('Chemin refusé.');
  if (Buffer.byteLength(donnees) > ESPACE_LECTURE_MAX) throw new Error('Document trop volumineux.');
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(abs), { recursive: true });
  const existe = await fs.lstat(/*turbopackIgnore: true*/ abs).catch(() => null);
  if (existe && (!existe.isFile() || !(await vraimentDedans(racine, abs))))
    throw new Error('Chemin refusé.');
  // Jamais de perte : l'ancienne version est gardée avant d'être remplacée (restaurable depuis le volet Fichiers).
  if (existe) await sauverVersion(racine, abs);
  await fs.writeFile(/*turbopackIgnore: true*/ abs, donnees);
  return path.relative(racine, abs).split(path.sep).join('/');
}

/** Écrit dans `resultats/` sous un nom libre (jamais par-dessus un fichier existant : nom-2, nom-3…). */
async function ecrireUnique(
  racine: string,
  sur: string,
  donnees: string | Buffer,
): Promise<string> {
  await preparerEspace(racine);
  const ext = path.extname(sur);
  const radical = sur.slice(0, -ext.length);
  for (let i = 1; i < 1000; i++) {
    const nomFinal = i === 1 ? sur : `${radical}-${i}${ext}`;
    const rel = `${DOSSIER_RESULTATS}/${nomFinal}`;
    const abs = cheminSur(racine, rel);
    if (!abs) break;
    try {
      // wx : échoue si le fichier existe
      await fs.writeFile(
        /*turbopackIgnore: true*/ abs,
        donnees,
        typeof donnees === 'string' ? { encoding: 'utf8', flag: 'wx' } : { flag: 'wx' },
      );
      return rel;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error('Nom de fichier indisponible.');
}

/** Enregistre un résultat de Six (texte) dans `resultats/`. */
export async function ecrireResultat(
  racine: string,
  nom: unknown,
  contenu: string,
): Promise<string> {
  if (Buffer.byteLength(contenu, 'utf8') > ESPACE_ECRITURE_MAX)
    throw new Error('Contenu trop volumineux.');
  return ecrireUnique(racine, nomSur(nom), contenu);
}

/** Enregistre la version Word ou PDF d'un rapport, sous le même nom que lui. */
export async function ecrireDocument(
  racine: string,
  nomRapport: string,
  ext: 'docx' | 'pdf',
  octets: Buffer,
): Promise<string> {
  if (octets.length > ESPACE_LECTURE_MAX) throw new Error('Document trop volumineux.');
  const base = nomSur(nomRapport.split('/').pop() ?? nomRapport).replace(/\.[^.]+$/, '');
  return ecrireUnique(racine, `${base}.${ext}`, octets);
}

const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8',
  '.json': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export function typeDe(chemin: string): string {
  return TYPES[path.extname(chemin).toLowerCase()] ?? 'application/octet-stream';
}

// ---------- Environnements : un dossier choisi par la personne ----------

const HOTES_LOCAUX = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** La demande vient de cet ordinateur (ou l'accès distant est permis par SIXTOUCH_DISTANT=1). */
export function demandeLocale(req: Request): boolean {
  return HOTES_LOCAUX.includes(new URL(req.url).hostname) || process.env.SIXTOUCH_DISTANT === '1';
}

/**
 * Dossier d'un environnement choisi par la personne (chemin absolu) → chemin vérifié, ou '' s'il est refusé :
 * chemin relatif, racine d'un disque (« C:\ », « / »), dossier inexistant ou qui n'est pas un dossier.
 */
export async function dossierChoisi(dossier: unknown): Promise<string> {
  if (typeof dossier !== 'string' || !dossier || dossier.length > 400 || dossier.includes('\0'))
    return '';
  if (!path.isAbsolute(dossier)) return '';
  const abs = path.resolve(/*turbopackIgnore: true*/ dossier);
  if (path.parse(abs).root === abs) return '';
  try {
    const s = await fs.stat(/*turbopackIgnore: true*/ abs);
    return s.isDirectory() ? abs : '';
  } catch {
    return '';
  }
}

/**
 * Espace de travail d'une demande : le dossier de l'environnement s'il est donné, sinon le dossier par défaut.
 * Local seulement (voir demandeLocale) : un site distant ne doit jamais lire les fichiers de l'ordinateur.
 */
export async function espaceAutorise(req: Request, dossier?: unknown): Promise<string> {
  if (!demandeLocale(req)) return '';
  if (dossier !== undefined && dossier !== null && dossier !== '') return dossierChoisi(dossier);
  return dossierEspace();
}

// ---------- Versions précédentes des fichiers (en cas de bourde, on revient en arrière) ----------

/** Dossier caché des anciennes versions : ignoré par la liste des fichiers, les outils de Six et la lecture. */
export const DOSSIER_VERSIONS = '.versions';
const VERSIONS_MAX = 20;
const ID_VERSION = /^(\d{13})(\.[a-z0-9]{1,6})?$/i;

export type VersionFichier = { id: string; date: number; taille: number };

function dossierVersions(racine: string, abs: string): string {
  return path.join(racine, DOSSIER_VERSIONS, path.relative(racine, abs));
}

/** Copie le fichier actuel dans .versions/<chemin>/<horodatage><ext> (20 versions au plus par fichier). */
async function sauverVersion(racine: string, abs: string): Promise<void> {
  const dossier = dossierVersions(racine, abs);
  await fs.mkdir(/*turbopackIgnore: true*/ dossier, { recursive: true });
  let date = Date.now();
  // Deux sauvegardes dans la même milliseconde : la seconde prend la suivante.
  while (
    await fs
      .stat(/*turbopackIgnore: true*/ path.join(dossier, `${date}${path.extname(abs)}`))
      .then(() => true)
      .catch(() => false)
  )
    date++;
  await fs.copyFile(
    /*turbopackIgnore: true*/ abs,
    path.join(dossier, `${date}${path.extname(abs)}`),
  );
  const anciennes = (await fs.readdir(/*turbopackIgnore: true*/ dossier))
    .filter((n) => ID_VERSION.test(n))
    .sort();
  for (const n of anciennes.slice(0, Math.max(0, anciennes.length - VERSIONS_MAX)))
    await fs.rm(/*turbopackIgnore: true*/ path.join(dossier, n), { force: true });
}

/** Versions gardées d'un fichier de l'espace, la plus récente d'abord. */
export async function listerVersions(racine: string, relatif: unknown): Promise<VersionFichier[]> {
  const abs = cheminSur(racine, relatif);
  if (!abs) return [];
  const dossier = dossierVersions(racine, abs);
  const noms = await fs.readdir(/*turbopackIgnore: true*/ dossier).catch(() => [] as string[]);
  const versions: VersionFichier[] = [];
  for (const id of noms) {
    const m = ID_VERSION.exec(id);
    if (!m) continue;
    const st = await fs.lstat(/*turbopackIgnore: true*/ path.join(dossier, id)).catch(() => null);
    if (st?.isFile()) versions.push({ id, date: Number(m[1]), taille: st.size });
  }
  return versions.sort((a, b) => b.date - a.date);
}

/** Nombre de versions gardées pour chaque fichier de l'espace (pour afficher « Versions » dans la liste). */
export async function nombresDeVersions(racine: string): Promise<Record<string, number>> {
  const base = path.join(racine, DOSSIER_VERSIONS);
  const resultat: Record<string, number> = {};
  const parcourir = async (dossier: string, profondeur: number) => {
    if (profondeur > ESPACE_PROFONDEUR_MAX + 1) return;
    const entrees = await fs
      .readdir(/*turbopackIgnore: true*/ dossier, { withFileTypes: true })
      .catch(() => []);
    const versions = entrees.filter((e) => e.isFile() && ID_VERSION.test(e.name)).length;
    if (versions) resultat[path.relative(base, dossier).split(path.sep).join('/')] = versions;
    for (const e of entrees)
      if (e.isDirectory() && !e.isSymbolicLink())
        await parcourir(path.join(dossier, e.name), profondeur + 1);
  };
  await parcourir(base, 0);
  return resultat;
}

/**
 * Remet une version précédente d'un fichier. La version actuelle est gardée d'abord : restaurer se défait aussi.
 * Pour un rapport, son texte, son Word et son PDF (même nom) reviennent ensemble à la même époque.
 */
export async function restaurerVersion(
  racine: string,
  relatif: unknown,
  id: unknown,
): Promise<string[]> {
  const abs = cheminSur(racine, relatif);
  const m = typeof id === 'string' ? ID_VERSION.exec(id) : null;
  if (!abs || !m) throw new Error('Version introuvable.');
  const date = Number(m[1]);
  const rel = path.relative(racine, abs).split(path.sep).join('/');
  const base = rel.replace(/\.[^./]+$/, '');
  const famille = /\.(md|docx|pdf)$/i.test(rel)
    ? ['md', 'docx', 'pdf'].map((e) => `${base}.${e}`)
    : [rel];
  const restaures: string[] = [];
  for (const membre of famille) {
    const versions = await listerVersions(racine, membre);
    // La version choisie pour ce fichier ; pour les autres de la famille, celle sauvée au même moment (±15 s).
    const v =
      membre === rel
        ? versions.find((x) => x.id === id)
        : versions.find((x) => Math.abs(x.date - date) <= 15_000);
    if (!v) continue;
    const cible = cheminSur(racine, membre);
    if (!cible) continue;
    const contenu = await fs.readFile(
      /*turbopackIgnore: true*/ path.join(dossierVersions(racine, cible), v.id),
    );
    await ecrireEnPlace(racine, membre, contenu);
    restaures.push(membre);
  }
  if (!restaures.includes(rel)) throw new Error('Version introuvable.');
  return restaures;
}

// ---------- Premier niveau d'un dossier (explorateur : on voit toujours le contenu direct du dossier choisi) ----------

export type EntreeNiveau = {
  nom: string;
  chemin: string;
  type: 'dossier' | 'fichier';
  taille: number;
  maj: number;
};
const NIVEAU_MAX = 1000;

/**
 * Contenu direct d'un dossier de l'espace (relatif vide : la racine), dossiers d'abord. Fichiers et dossiers
 * cachés, liens symboliques et tout ce qui sortirait de l'espace sont ignorés. Null si ce n'est pas un dossier.
 */
export async function listerNiveau(
  racine: string,
  relatif: unknown = '',
): Promise<EntreeNiveau[] | null> {
  const abs = relatif === '' ? racine : cheminSur(racine, relatif);
  if (!abs) return null;
  try {
    const st = await fs.lstat(/*turbopackIgnore: true*/ abs);
    if (!st.isDirectory()) return null;
    if (abs !== racine && !(await vraimentDedans(racine, abs))) return null;
    const entrees = await fs.readdir(/*turbopackIgnore: true*/ abs, { withFileTypes: true });
    const sortie: EntreeNiveau[] = [];
    for (const e of entrees) {
      if (sortie.length >= NIVEAU_MAX) break;
      if (e.name.startsWith('.') || e.isSymbolicLink() || (!e.isDirectory() && !e.isFile()))
        continue;
      const chemin = path.relative(racine, path.join(abs, e.name)).split(path.sep).join('/');
      const s = await fs.stat(/*turbopackIgnore: true*/ path.join(abs, e.name)).catch(() => null);
      if (!s) continue;
      sortie.push({
        nom: e.name,
        chemin,
        type: e.isDirectory() ? 'dossier' : 'fichier',
        taille: e.isDirectory() ? 0 : s.size,
        maj: s.mtimeMs,
      });
    }
    return sortie.sort((a, b) =>
      a.type !== b.type
        ? a.type === 'dossier'
          ? -1
          : 1
        : a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base', numeric: true }),
    );
  } catch {
    return null;
  }
}
