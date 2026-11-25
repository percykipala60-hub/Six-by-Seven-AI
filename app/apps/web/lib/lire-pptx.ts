import { lireEntreeZip } from './zip';

/**
 * Lecture d'une présentation PowerPoint (.pptx) sur l'appareil, sans dépendance : le texte de chaque diapositive
 * (titre et lignes), dans l'ordre. Sert à l'afficheur interne de Six. Les images, formes et animations ne sont pas
 * reproduites.
 */

export type Diapo = { numero: number; titre: string; lignes: string[] };

const DIAPOS_MAX = 200;
const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoder = (t: string) =>
  t.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : ENTITES[e.toLowerCase()],
  );

/** Texte d'une diapositive (XML de « ppt/slides/slideN.xml ») : le titre, puis les autres paragraphes. */
export function diapoDeXml(xml: string, numero: number): Diapo {
  let titre = '';
  const lignes: string[] = [];
  // Chaque forme (<p:sp>) : on repère celle du titre par son espace réservé (type="title" ou "ctrTitle").
  for (const forme of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    const estTitre = /<p:ph[^>]*type="(?:title|ctrTitle)"/.test(forme[0]);
    const paragraphes = [...forme[0].matchAll(/<a:p>[\s\S]*?<\/a:p>/g)]
      .map((p) =>
        [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
          .map((t) => decoder(t[1]))
          .join('')
          .trim(),
      )
      .filter(Boolean);
    if (estTitre && !titre) titre = paragraphes.join(' ');
    else lignes.push(...paragraphes);
  }
  if (!titre && lignes.length) titre = lignes.shift() ?? '';
  return { numero, titre, lignes };
}

export async function lirePptx(octets: ArrayBuffer): Promise<Diapo[]> {
  const diapos: Diapo[] = [];
  for (let n = 1; n <= DIAPOS_MAX; n++) {
    const xml = await lireEntreeZip(octets, `ppt/slides/slide${n}.xml`).catch(() => null);
    if (xml === null) break;
    diapos.push(diapoDeXml(xml, n));
  }
  if (!diapos.length)
    throw new Error("ce fichier n'est pas une présentation PowerPoint (.pptx) lisible.");
  return diapos;
}
