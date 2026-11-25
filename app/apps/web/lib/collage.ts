/**
 * Ce qu'un collage (Ctrl+V) dans la barre de saisie ajoute aux pièces jointes, comme chez Claude :
 * - des fichiers (capture d'écran, image, PDF…) : tels quels ;
 * - un long texte, ou un texte sur plusieurs lignes : un document « Texte collé.txt » (la barre d'une seule ligne
 *   perdrait les retours à la ligne) ;
 * - un texte court : rien, il se colle normalement dans la barre.
 */
export const COLLAGE_LONG = 1000;
const LIGNES_MAX = 4;
export const NOM_TEXTE_COLLE = 'Texte collé.txt';

export function piecesDuCollage(fichiers: File[], texte: string): File[] | null {
  if (fichiers.length) return fichiers;
  if (texte.length > COLLAGE_LONG || texte.split(/\r?\n/).length > LIGNES_MAX)
    return [new File([texte], NOM_TEXTE_COLLE, { type: 'text/plain' })];
  return null;
}

// ---------- Aperçu d'une pièce jointe dans la barre (carte avec nom tronqué et badge de type) ----------

/** Badge de type d'un document : « PDF », « DOCX »… ; « COLLÉ » pour un texte collé. */
export function badgeType(nom: string): string {
  if (nom === NOM_TEXTE_COLLE) return 'COLLÉ';
  const m = /\.([a-z0-9]{1,5})$/i.exec(nom);
  return m ? m[1].toUpperCase() : 'FICHIER';
}

/**
 * Coupe un nom ou un chemin trop long au milieu (le début et l'extension restent lisibles) :
 * « C:\Users\omen\OneDrive\Documents\Diagramme.drawio.pdf » → « C:\Users\omen\OneDr…ramme.drawio.pdf ».
 */
export function abregerMilieu(texte: string, max = 48): string {
  if (texte.length <= max) return texte;
  const fin = Math.min(Math.floor((max - 1) * 0.45), 20);
  const debut = max - 1 - fin;
  return `${texte.slice(0, debut)}…${texte.slice(-fin)}`;
}

/** Les premières lignes d'un texte collé, pour la carte (sans lignes vides ni espaces en trop). */
export function extraitTexte(texte: string, max = 160): string {
  const t = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
