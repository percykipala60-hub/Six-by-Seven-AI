import { describe, expect, it } from 'vitest';
import { controlerRapport, rolePartie } from '@/lib/agent/qualite-rapport';
import { lireMarkdown, versWord, versPdf } from '@/lib/agent/documents';
import { definitionsOutils, executerOutil } from '@/lib/agent/outils';

describe('rapports et habilitation navigateur', () => {
  it('expose le navigateur seulement lorsque le contexte local le permet', () => {
    expect(definitionsOutils({ espace: '' }).some((o) => o.nom === 'naviguer')).toBe(false);
    expect(
      definitionsOutils({ espace: 'local', navigateur: {} }).some((o) => o.nom === 'naviguer'),
    ).toBe(true);
  });
  it('refuse aussi une invocation directe sans contexte navigateur', async () => {
    expect(
      (await executerOutil('naviguer', { action: 'observer' }, { espace: '' })).resultat,
    ).toContain('indisponible');
  });
  it('détecte les sources non vérifiées et la structure incomplète', () => {
    const problemes = controlerRapport(
      '# Étude\n## Résultats\nSelon Dupont (2024), le rendement est de 80 %.\n## Références\n- Dupont (2024). Étude solaire. https://invente.example/paper',
      '',
    );
    expect(problemes.some((p) => p.texte.includes('non vérifiées'))).toBe(true);
    expect(problemes.some((p) => p.texte.includes("manque l'Introduction"))).toBe(true);
    expect(rolePartie('III. Conclusion générale')).toBe('conclusion');
  });
  it('produit de vrais tableaux Word et un PDF à partir du même contenu', async () => {
    const texte =
      '# Essai\n\n## Introduction\nMesures du laboratoire.\n\n## Résultats\nTableau 1 : Mesures\n\n| Essai | Puissance |\n| --- | --- |\n| A | 42 W |\n| B | 38 W |\n\n## Conclusion\nA dépasse B de 4 W.';
    expect(lireMarkdown(texte).some((b) => b.type === 'tableau')).toBe(true);
    expect(versWord(texte).toString('utf8')).toContain('<w:tbl>');
    expect((await versPdf(texte)).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
