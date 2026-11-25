import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Accès de Cosinus hors du dossier de l'environnement. Par défaut, Six ne travaille que dans le dossier de la
 * discussion. Il peut lire ailleurs sur l'ordinateur seulement quand la personne le demande pour CETTE tâche :
 * - elle cite un chemin (« lis C:\Users\…\rapport.docx », « regarde D:\Cours ») : ce fichier ou ce dossier seulement ;
 * - elle l'autorise clairement (« cherche dans tout mon PC ») : tout l'ordinateur, pour cette tâche.
 * Jamais de son propre chef. Hors du dossier, c'est de la lecture seule : les résultats sont toujours enregistrés
 * dans le dossier de l'environnement. Fichiers et dossiers cachés exclus, comme dans l'espace.
 */

export type AccesHorsDossier = { toutLePc: boolean; chemins: string[] };

export const AUCUN_ACCES: AccesHorsDossier = { toutLePc: false, chemins: [] };

/** « tout mon PC », « tout l'ordinateur », « partout sur mon disque », « n'importe où sur le PC ». */
export function autoriseToutLePc(question: string): boolean {
  return /\b(?:dans\s+)?(?:tout|l['’]ensemble\s+de)\s+(?:le|mon|l['’])\s*(?:pc|ordi(?:nateur)?|disque)\b|\bpartout\s+sur\s+(?:le|mon|l['’])\s*(?:pc|ordi(?:nateur)?|disque)\b|\bn['’]importe\s+o[uù]\s+sur\s+(?:le|mon|l['’])\s*(?:pc|ordi(?:nateur)?|disque)\b/i.test(
    question,
  );
}

/** Chemins absolus écrits dans la demande (Windows « C:\… » ou Unix « /home/… »), tels quels, jusqu'à la fin de ligne. */
export function cheminsBruts(question: string): string[] {
  const re =
    /(?:[A-Za-z]:[\\/]|\/(?:home|Users|mnt|media|srv|opt|tmp|var|data)\/)[^\n\r"«»<>|?*]*/g;
  return (question.match(re) ?? []).map((c) => c.trim());
}

async function existe(chemin: string): Promise<boolean> {
  return fs
    .stat(/*turbopackIgnore: true*/ chemin)
    .then(() => true)
    .catch(() => false);
}

/**
 * Un chemin cité peut être suivi du reste de la phrase (« C:\Cours\TP 3 et résume-le ») : on retire des mots à la
 * fin jusqu'à trouver ce qui existe vraiment sur l'ordinateur.
 */
async function cheminReel(brut: string): Promise<string> {
  let c = brut.replace(/[\s.,;:!)»]+$/, '');
  for (let i = 0; i < 12 && c.length > 3; i++) {
    if (await existe(c)) return path.resolve(/*turbopackIgnore: true*/ c);
    const coupe = c.replace(/[\s,;:]+\S*$/, '');
    if (coupe === c) break;
    c = coupe.replace(/[\s.,;:!)»]+$/, '');
  }
  return '';
}

/** Ce que la demande autorise hors du dossier de l'environnement. */
export async function accesDeLaDemande(question: string): Promise<AccesHorsDossier> {
  const chemins = (await Promise.all(cheminsBruts(question).map(cheminReel))).filter(
    (c) => c && path.parse(c).root !== c,
  );
  return { toutLePc: autoriseToutLePc(question), chemins: [...new Set(chemins)] };
}

export function aUnAcces(a: AccesHorsDossier | undefined): boolean {
  return !!a && (a.toutLePc || a.chemins.length > 0);
}

/**
 * Chemin absolu demandé par Six → { racine, relatif } à lire avec les protections de l'espace (pas de fichier caché,
 * pas de lien qui sort), ou null s'il n'est pas couvert par l'autorisation de la personne.
 */
export function racinePour(
  acces: AccesHorsDossier | undefined,
  demande: unknown,
): { racine: string; relatif: string } | null {
  if (!acces || typeof demande !== 'string' || !path.isAbsolute(demande)) return null;
  const abs = path.resolve(/*turbopackIgnore: true*/ demande);
  const dedans = (r: string) => {
    const rel = path.relative(r, abs);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  // Le chemin cité lui-même (fichier) : on le lit depuis son dossier parent.
  const exact = acces.chemins.find((c) => path.relative(c, abs) === '');
  if (exact) return { racine: path.dirname(abs), relatif: path.basename(abs) };
  const racine = acces.chemins.find(dedans) ?? (acces.toutLePc ? path.parse(abs).root : undefined);
  if (!racine) return null;
  const relatif = path.relative(racine, abs);
  return relatif ? { racine, relatif } : { racine: path.dirname(abs), relatif: path.basename(abs) };
}

export const REFUS_HORS_DOSSIER =
  "Ce chemin est hors du dossier de l'environnement et la personne ne l'a pas demandé pour cette tâche : n'y va pas. Si c'est nécessaire, demande-lui d'abord l'autorisation (ou de citer le chemin).";

/** Dossier absolu que Six veut lister, s'il est couvert par l'autorisation de la personne (sinon null). */
export function dossierCouvert(
  acces: AccesHorsDossier | undefined,
  demande: unknown,
): string | null {
  if (!acces || typeof demande !== 'string' || !path.isAbsolute(demande)) return null;
  const abs = path.resolve(/*turbopackIgnore: true*/ demande);
  const dedans = (r: string) => {
    const rel = path.relative(r, abs);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  if (!acces.toutLePc && !acces.chemins.some(dedans)) return null;
  // Pas de dossier caché sur le chemin (au-delà de la racine autorisée).
  const racine = acces.chemins.find(dedans) ?? path.parse(abs).root;
  const rel = path.relative(racine, abs);
  if (rel && rel.split(path.sep).some((s) => s.startsWith('.'))) return null;
  return abs;
}
