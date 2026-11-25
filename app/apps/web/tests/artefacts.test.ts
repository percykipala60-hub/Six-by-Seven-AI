import { expect, it } from 'vitest';
import { extraireArtefacts, documentApercu } from '../lib/artefacts';
import { sansMarkdown } from '../lib/agent/boucle';
it('extrait plusieurs fichiers complets sans altérer leur contenu', () => {
  const texte =
    'Voici.\n```html filename="index.html"\n<h1>Bonjour</h1>\n```\n```python filename="../test.py"\nprint("你好")\n```';
  const resultat = extraireArtefacts(texte);
  expect(resultat.texte).toBe('Voici.');
  expect(resultat.artefacts.map((f) => f.nom)).toEqual(['index.html', 'test.py']);
  expect(resultat.artefacts[1].contenu).toBe('print("你好")\n');
  expect(sansMarkdown(texte)).toContain('print("你好")');
});
it('laisse les blocs incomplets dans le message sans créer de fichier', () => {
  expect(extraireArtefacts('```html\n<p>Test').artefacts).toEqual([]);
  expect(() => sansMarkdown('```html\n<p>Test')).not.toThrow();
});
it('impose une politique sans réseau ni scripts avant le contenu généré', () => {
  const doc = documentApercu('<script>alert(1)</script>');
  expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script>'));
  expect(doc).toContain("default-src 'none'");
  expect(doc).toContain("form-action 'none'");
});
