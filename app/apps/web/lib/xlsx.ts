import { lireEntreeZip } from './zip';

/**
 * Lecture d'un classeur Excel (.xlsx) sur l'appareil, sans dépendance : chaque feuille en tableau de valeurs
 * (texte et nombres tels qu'enregistrés ; formules non recalculées, mise en forme non reproduite).
 */

export type Feuille = { nom: string; lignes: string[][] };

const LIGNES_MAX = 300;
const COLONNES_MAX = 40;
const FEUILLES_MAX = 20;
const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoder = (t: string) =>
  t.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : ENTITES[e.toLowerCase()],
  );
const texteDe = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decoder(m[1])).join('');

/** Textes partagés du classeur (xl/sharedStrings.xml). */
export function textesPartages(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texteDe(m[1]));
}

/** « AB12 » → index de colonne (0 pour A). */
function colonne(ref: string): number {
  const lettres = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const l of lettres) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

/** Valeurs d'une feuille (xl/worksheets/sheetN.xml), lignes vides en fin retirées. */
export function feuilleDeXml(xml: string, partages: string[]): string[][] {
  const lignes: string[][] = [];
  for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const numero = Number(/\br="(\d+)"/.exec(r[1])?.[1] ?? lignes.length + 1) - 1;
    if (numero >= LIGNES_MAX) break;
    const ligne: string[] = [];
    for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const corps = c[2] ?? '';
      const col = colonne(/\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? 'A1');
      if (col >= COLONNES_MAX) continue;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(corps)?.[1];
      ligne[col] =
        type === 's'
          ? (partages[Number(v)] ?? '')
          : type === 'inlineStr'
            ? texteDe(corps)
            : type === 'b'
              ? v === '1'
                ? 'VRAI'
                : 'FAUX'
              : decoder(v ?? '');
    }
    lignes[numero] = Array.from(ligne, (x) => x ?? '');
  }
  const pleines = Array.from(lignes, (l) => l ?? []);
  while (pleines.length && pleines.at(-1)?.every((x) => !x)) pleines.pop();
  const largeur = Math.max(0, ...pleines.map((l) => l.length));
  return pleines.map((l) => [...l, ...Array(largeur - l.length).fill('')]);
}

export async function lireXlsx(octets: ArrayBuffer): Promise<Feuille[]> {
  const classeur = await lireEntreeZip(octets, 'xl/workbook.xml').catch(() => null);
  if (!classeur) throw new Error("ce fichier n'est pas un classeur Excel (.xlsx) lisible.");
  const noms = [...classeur.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decoder(m[1]));
  const partages = textesPartages(
    (await lireEntreeZip(octets, 'xl/sharedStrings.xml').catch(() => null)) ?? '',
  );
  const feuilles: Feuille[] = [];
  for (let n = 1; n <= Math.min(FEUILLES_MAX, Math.max(1, noms.length)); n++) {
    const xml = await lireEntreeZip(octets, `xl/worksheets/sheet${n}.xml`).catch(() => null);
    if (xml === null) continue;
    feuilles.push({ nom: noms[n - 1] ?? `Feuille ${n}`, lignes: feuilleDeXml(xml, partages) });
  }
  return feuilles;
}
