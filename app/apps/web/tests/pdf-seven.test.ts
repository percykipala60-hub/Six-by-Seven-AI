import { describe, expect, it } from 'vitest';
import { construirePdfSeven, nettoyerTextePdf } from '@/lib/pdf-seven';

describe('export PDF des discussions avec Six', () => {
  it('nettoie ce que les polices PDF ne supportent pas (œ, emoji, tirets longs)', () => {
    expect(nettoyerTextePdf('cœur et Œuvre 🎉 — « test »')).toBe('coeur et Oeuvre - « test »');
    expect(nettoyerTextePdf('Réponse  avec   espaces')).toBe('Réponse avec espaces');
  });

  // Le premier chargement de jsPDF prend quelques secondes : avec toute la suite en parallèle,
  // la limite par défaut (5 s) était parfois dépassée sans que le PDF soit en cause.
  it(
    'construit un PDF valide qui contient la marque et les messages',
    { timeout: 20_000 },
    async () => {
      const doc = await construirePdfSeven(
        [
          { role: 'user', content: 'Présente-moi Six en une phrase.' },
          {
            role: 'assistant',
            content:
              'Six est l’application de Seven.AI qui t’aide à répondre juste à tes conversations.',
          },
        ],
        'Conversation de test',
      );
      const buf = doc.output('arraybuffer');
      expect(buf.byteLength).toBeGreaterThan(500);
      const octets = new Uint8Array(buf);
      expect(String.fromCharCode(...octets.slice(0, 5))).toBe('%PDF-');

      // Round-trip : on relit le texte du PDF généré pour vérifier la mise en page réelle.
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      expect(pdf.numPages).toBeGreaterThanOrEqual(1);
      let texte = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const contenu = await page.getTextContent();
        texte += contenu.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
      }
      expect(texte).toContain('Document généré par Six');
      expect(texte).toContain('SIX');
      expect(texte).toContain('répondre juste');
      expect(texte).toContain('Page 1 /');
    },
  );

  it('ne déborde pas vers le pied de page, même avec un long message', async () => {
    const long =
      'Voici un message volontairement long pour forcer plusieurs lignes à l’intérieur de la bulle. '.repeat(
        12,
      );
    const doc = await construirePdfSeven(
      [
        { role: 'user', content: long },
        { role: 'assistant', content: long },
      ],
      'Test pagination',
    );
    const buf = doc.output('arraybuffer');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const ptParMm = 72 / 25.4;
    // pdfjs mesure y depuis le BAS de la page : le pied de page est à 15 mm du bas.
    const yPied = 15 * ptParMm;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const contenu = await page.getTextContent();
      for (const it of contenu.items) {
        if (!('str' in it) || !it.str.trim()) continue;
        if (it.str.startsWith('Document généré') || /^Page \d+ \//.test(it.str)) continue;
        const y = it.transform[5];
        expect(y).toBeGreaterThanOrEqual(yPied - 1);
      }
    }
  });
});
