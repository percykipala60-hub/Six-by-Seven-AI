/**
 * Arbre de fichiers de l'explorateur (volet Fichiers de Cosinus), comme le panneau de Claude : dossiers d'abord,
 * puis fichiers, par ordre alphabétique ; un filtre garde les fichiers dont le chemin correspond, et leurs dossiers.
 */

export type FichierListe = { chemin: string; taille: number; maj: number };
export type Dossier = { type: 'dossier'; nom: string; chemin: string; enfants: Noeud[] };
export type Noeud =
  Dossier | { type: 'fichier'; nom: string; chemin: string; taille: number; maj: number };

const comparer = (a: Noeud, b: Noeud) =>
  a.type !== b.type
    ? a.type === 'dossier'
      ? -1
      : 1
    : a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base', numeric: true });

export function construireArbre(fichiers: FichierListe[]): Noeud[] {
  const racine: Noeud[] = [];
  for (const f of fichiers) {
    const morceaux = f.chemin.split('/').filter(Boolean);
    let niveau = racine;
    let chemin = '';
    morceaux.forEach((nom, i) => {
      chemin = chemin ? `${chemin}/${nom}` : nom;
      if (i === morceaux.length - 1) {
        niveau.push({ type: 'fichier', nom, chemin, taille: f.taille, maj: f.maj });
        return;
      }
      let dossier = niveau.find((n): n is Dossier => n.type === 'dossier' && n.nom === nom);
      if (!dossier) {
        dossier = { type: 'dossier', nom, chemin, enfants: [] };
        niveau.push(dossier);
      }
      niveau = dossier.enfants;
    });
  }
  const trier = (noeuds: Noeud[]): Noeud[] =>
    noeuds
      .map((n) => (n.type === 'dossier' ? { ...n, enfants: trier(n.enfants) } : n))
      .sort(comparer);
  return trier(racine);
}

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Garde les fichiers dont le chemin contient le texte (sans accents ni majuscules), avec leurs dossiers. */
export function filtrerArbre(arbre: Noeud[], texte: string): Noeud[] {
  const t = normaliser(texte.trim());
  if (!t) return arbre;
  const garder = (noeuds: Noeud[]): Noeud[] =>
    noeuds.flatMap((n): Noeud[] => {
      if (n.type === 'fichier') return normaliser(n.chemin).includes(t) ? [n] : [];
      const enfants = garder(n.enfants);
      return enfants.length ? [{ ...n, enfants }] : [];
    });
  return garder(arbre);
}

/** Genre d'aperçu d'un fichier selon son extension (les formats courants, comme le panneau de Claude). */
export type GenreApercu =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'tableur'
  | 'archive'
  | 'markdown'
  | 'tableau'
  | 'texte'
  | 'autre';

const IMAGES = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'avif'];
const VIDEOS = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];
const AUDIOS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'];
const TEXTE = [
  'txt',
  'json',
  'log',
  'html',
  'htm',
  'xml',
  'yml',
  'yaml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'properties',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'css',
  'scss',
  'less',
  'vue',
  'svelte',
  'py',
  'r',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'go',
  'rs',
  'php',
  'rb',
  'dart',
  'lua',
  'sh',
  'bash',
  'bat',
  'ps1',
  'sql',
  'gradle',
  'tex',
  'bib',
  'srt',
  'vtt',
  'rtf',
  'tsv',
  'env',
  'gitignore',
];

export function genreApercu(chemin: string): GenreApercu {
  const ext = /\.([a-z0-9]+)$/i.exec(chemin)?.[1]?.toLowerCase() ?? '';
  if (IMAGES.includes(ext)) return 'image';
  if (VIDEOS.includes(ext)) return 'video';
  if (AUDIOS.includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'xlsx') return 'tableur';
  if (ext === 'zip') return 'archive';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'csv') return 'tableau';
  if (TEXTE.includes(ext)) return 'texte';
  return 'autre';
}

/** Les octets ressemblent à du texte (pas d'octet nul, UTF-8 valide) : un fichier inconnu peut s'afficher. */
export function ressembleATexte(octets: Uint8Array): boolean {
  const debut = octets.subarray(0, 8192);
  if (debut.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(
      debut.subarray(0, Math.max(0, debut.length - 4)),
    );
    return true;
  } catch {
    return false;
  }
}

/** Lignes d'un CSV simple (séparateur « , » ou « ; », guillemets gérés). */
export function lireCsv(texte: string, lignesMax = 500): string[][] {
  const premiere = texte.split(/\r?\n/, 1)[0] ?? '';
  const sep = (premiere.match(/;/g)?.length ?? 0) > (premiere.match(/,/g)?.length ?? 0) ? ';' : ',';
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < texte.length && lignes.length < lignesMax; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if ((champ || ligne.length) && lignes.length < lignesMax) lignes.push([...ligne, champ]);
  return lignes;
}
