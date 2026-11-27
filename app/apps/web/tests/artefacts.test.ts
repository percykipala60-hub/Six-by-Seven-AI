import { expect, it } from 'vitest';
import {
  blocsDocument,
  documentApercu,
  extraireArtefacts,
  genreArtefact,
  lireTableau,
  typeMime,
  versionsDe,
} from '../lib/artefacts';
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
it('récupère une page HTML brute et laisse le commentaire dans la discussion', () => {
  const page =
    '<!DOCTYPE html>\n<html lang="fr"><head><style>body { color: navy; }</style></head>\n<body><h1>Horizons</h1></body>\n</html>';
  expect(extraireArtefacts(`Voici la page.\n\n${page}\n\nTu peux la télécharger.`)).toEqual({
    texte: 'Voici la page.\n\n\n\nTu peux la télécharger.',
    artefacts: [{ nom: 'creation-1.html', langage: 'html', contenu: page }],
  });
  expect(extraireArtefacts(page.slice(0, -7)).artefacts).toEqual([]);
  expect(extraireArtefacts(`\x60\x60\x60html\n${page}`).artefacts).toEqual([]);
});
it('impose une politique sans réseau ni scripts avant le contenu généré', () => {
  const doc = documentApercu('<script>alert(1)</script>');
  expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script>'));
  expect(doc).toContain("default-src 'none'");
  expect(doc).toContain("form-action 'none'");
});

it('convertit le code brut identifiable et conserve son indentation et son introduction', () => {
  const python = 'def doubler(n):\r\n    return n * 2\r\n\r\nprint(doubler(3))';
  expect(extraireArtefacts(`Voici le script.\r\n\r\n${python}`)).toEqual({
    texte: 'Voici le script.',
    artefacts: [{ nom: 'creation-1.py', langage: 'python', contenu: python }],
  });
  expect(extraireArtefacts('const total: number = 2;').artefacts[0]?.nom).toBe('creation-1.ts');
  expect(extraireArtefacts('SELECT nom FROM produits;').artefacts[0]?.nom).toBe('creation-1.sql');
  expect(extraireArtefacts('Une explication ordinaire du code.').artefacts).toEqual([]);
  expect(
    extraireArtefacts('\x60\x60\x60js\nconsole.log("Salut");\n\x60\x60\x60').artefacts[0]?.nom,
  ).toBe('creation-1.js');
});

it('reconnaît le genre d’un artefact par son nom', () => {
  expect(genreArtefact({ nom: 'expose.pptx', langage: 'presentation' })).toBe('presentation');
  expect(genreArtefact({ nom: 'page.html', langage: 'html' })).toBe('page');
  expect(genreArtefact({ nom: 'logo.svg', langage: 'svg' })).toBe('page');
  expect(genreArtefact({ nom: 'budget.csv', langage: 'csv' })).toBe('tableau');
  expect(genreArtefact({ nom: 'plan.md', langage: 'markdown' })).toBe('document');
  expect(genreArtefact({ nom: 'calcul.py', langage: 'python' })).toBe('code');
  expect(typeMime({ nom: 'expose.pptx', langage: 'presentation' })).toContain('presentationml');
});

it('fait une nouvelle version quand un même fichier revient avec un autre contenu', () => {
  const bloc = (contenu: string) => `Voici.\n\`\`\`markdown filename="plan.md"\n${contenu}\n\`\`\``;
  const v = versionsDe([bloc('v1'), 'Une réponse sans fichier.', bloc('v1'), bloc('v2')]);
  expect(v.get('plan.md')?.map((a) => a.contenu)).toEqual(['v1\n', 'v2\n']);
});

it('lit un tableau CSV ou Markdown', () => {
  expect(lireTableau('Nom;Prix\n"Pain; frais";500')).toEqual([
    ['Nom', 'Prix'],
    ['Pain; frais', '500'],
  ]);
  expect(lireTableau('| A | B |\n|---|---|\n| 1 | 2 |')).toEqual([
    ['A', 'B'],
    ['1', '2'],
  ]);
});

it('met en page un document léger', () => {
  expect(blocsDocument('# Titre\n\nUn **paragraphe**\n- a\n- b\n1. c')).toEqual([
    { genre: 'titre', niveau: 1, texte: 'Titre' },
    { genre: 'paragraphe', texte: 'Un paragraphe' },
    { genre: 'liste', ordonnee: false, elements: ['a', 'b'] },
    { genre: 'liste', ordonnee: true, elements: ['c'] },
  ]);
});
