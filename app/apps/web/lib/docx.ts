import { lireEntreeZip } from './zip';

/**
 * Lecture d'un document Word (.docx) sur l'appareil, sans dépendance : le texte de « word/document.xml », découpé
 * en blocs (titres, paragraphes, éléments de liste, lignes de tableau). Sert à joindre un .docx au Chat et à
 * l'afficher dans l'afficheur interne de Six. La mise en page fine (images, colonnes) n'est pas reproduite.
 */

export type BlocDocx =
  | { type: 'titre'; niveau: number; texte: string }
  | { type: 'paragraphe'; texte: string }
  | { type: 'liste'; texte: string }
  | { type: 'tableau'; cellules: string[] };

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoder = (t: string) =>
  t.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : ENTITES[e.toLowerCase()],
  );

/** Texte d'un paragraphe Word (<w:p>) : ses <w:t>, tabulations et retours à la ligne. */
function texteParagraphe(xml: string): string {
  let t = '';
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g))
    t += m[1] !== undefined ? decoder(m[1]) : m[0] === '<w:tab/>' ? '\t' : '\n';
  return t.replace(/[ \t]+\n/g, '\n').trim();
}

export function blocsDeDocumentXml(xml: string): BlocDocx[] {
  const blocs: BlocDocx[] = [];
  const corps = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  // Tableaux et paragraphes, dans l'ordre du document.
  for (const m of corps.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    const bloc = m[0];
    if (bloc.startsWith('<w:tbl>')) {
      for (const ligne of bloc.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)) {
        const cellules = [...ligne[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) =>
          [...c[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
            .map((p) => texteParagraphe(p[0]))
            .join('\n'),
        );
        if (cellules.some(Boolean)) blocs.push({ type: 'tableau', cellules });
      }
      continue;
    }
    const texte = texteParagraphe(bloc);
    if (!texte) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(bloc)?.[1] ?? '';
    const niveauTitre = /^(?:Heading|Titre)(\d)$/i.exec(style)?.[1];
    if (/^Title$|^Titre$/i.test(style)) blocs.push({ type: 'titre', niveau: 1, texte });
    else if (niveauTitre)
      blocs.push({ type: 'titre', niveau: Math.min(6, Number(niveauTitre)), texte });
    else if (/<w:numPr>/.test(bloc) || /List/i.test(style)) blocs.push({ type: 'liste', texte });
    else blocs.push({ type: 'paragraphe', texte });
  }
  return blocs;
}

/** Blocs d'un .docx (octets). Erreur lisible si ce n'est pas un document Word. */
export async function lireDocx(octets: ArrayBuffer): Promise<BlocDocx[]> {
  const xml = await lireEntreeZip(octets, 'word/document.xml').catch(() => null);
  if (!xml) throw new Error("ce fichier n'est pas un document Word (.docx) lisible.");
  return blocsDeDocumentXml(xml);
}

/** Texte brut d'un .docx, pour l'envoyer à Six (titres en Markdown, listes en puces). */
export function texteDeBlocs(blocs: BlocDocx[]): string {
  return blocs
    .map((b) =>
      b.type === 'titre'
        ? `${'#'.repeat(b.niveau)} ${b.texte}`
        : b.type === 'liste'
          ? `• ${b.texte}`
          : b.type === 'tableau'
            ? b.cellules.join(' | ')
            : b.texte,
    )
    .join('\n\n');
}
