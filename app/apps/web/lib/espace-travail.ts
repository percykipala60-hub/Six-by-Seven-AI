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
};
export function typeDe(chemin: string): string {
  return TYPES[path.extname(chemin).toLowerCase()] ?? 'application/octet-stream';
}
