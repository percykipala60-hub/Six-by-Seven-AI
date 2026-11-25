import { describe, expect, it } from 'vitest';
import { blocsDeDocumentXml, texteDeBlocs } from '@/lib/docx';

const xml = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Mesure</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Un texte &amp; </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>gras</w:t></w:r></w:p>
<w:p/>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Point</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

describe('lecture d’un document Word', () => {
  it('garde titres, paragraphes, listes et tableaux dans l’ordre', () => {
    const blocs = blocsDeDocumentXml(xml);
    expect(blocs).toEqual([
      { type: 'titre', niveau: 1, texte: 'Mesure' },
      { type: 'paragraphe', texte: 'Un texte & gras' },
      { type: 'liste', texte: 'Point' },
      { type: 'tableau', cellules: ['A', 'B'] },
    ]);
    expect(texteDeBlocs(blocs)).toBe('# Mesure\n\nUn texte & gras\n\n• Point\n\nA | B');
  });
});
