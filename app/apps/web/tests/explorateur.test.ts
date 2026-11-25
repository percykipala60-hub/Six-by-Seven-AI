import { describe, expect, it } from 'vitest';
import { construireArbre, filtrerArbre, genreApercu, lireCsv } from '@/lib/arbre';
import { diapoDeXml } from '@/lib/lire-pptx';

const f = (chemin: string) => ({ chemin, taille: 1, maj: 0 });

describe("explorateur de fichiers de l'espace", () => {
  it('range les dossiers avant les fichiers, par ordre alphabétique', () => {
    const arbre = construireArbre([
      f('b.txt'),
      f('resultats/rapport.md'),
      f('A.pdf'),
      f('resultats/2/x.md'),
    ]);
    expect(arbre.map((n) => n.nom)).toEqual(['resultats', 'A.pdf', 'b.txt']);
    const resultats = arbre[0];
    expect(resultats.type === 'dossier' && resultats.enfants.map((n) => n.nom)).toEqual([
      '2',
      'rapport.md',
    ]);
  });

  it('filtre en gardant les dossiers des fichiers trouvés', () => {
    const arbre = construireArbre([f('resultats/Rapport-énergie.md'), f('notes.txt')]);
    const r = filtrerArbre(arbre, 'energie');
    expect(r).toHaveLength(1);
    expect(r[0].type === 'dossier' && r[0].enfants[0].chemin).toBe('resultats/Rapport-énergie.md');
    expect(filtrerArbre(arbre, '')).toBe(arbre);
  });

  it('choisit le bon aperçu selon le type de fichier', () => {
    expect(
      ['a.PNG', 'b.pdf', 'c.docx', 'd.pptx', 'e.md', 'f.csv', 'g.json', 'h.zip'].map(genreApercu),
    ).toEqual(['image', 'pdf', 'docx', 'pptx', 'markdown', 'tableau', 'texte', 'archive']);
  });

  it('lit un CSV avec guillemets et point-virgule', () => {
    expect(lireCsv('Nom;Ville\n"Mbala; Jean";Kinshasa\r\nAmi;"Dit ""oui"""')).toEqual([
      ['Nom', 'Ville'],
      ['Mbala; Jean', 'Kinshasa'],
      ['Ami', 'Dit "oui"'],
    ]);
  });

  it('lit le titre et le texte d’une diapositive PowerPoint', () => {
    const xml = `<p:sld><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Énergie &amp; RDC</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:txBody><a:p><a:r><a:t>Premier point</a:t></a:r></a:p><a:p><a:r><a:t>Second </a:t></a:r><a:r><a:t>point</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`;
    expect(diapoDeXml(xml, 1)).toEqual({
      numero: 1,
      titre: 'Énergie & RDC',
      lignes: ['Premier point', 'Second point'],
    });
  });
});
