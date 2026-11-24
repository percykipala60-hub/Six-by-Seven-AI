import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crc32, lireMarkdown, structurer, versPdf, versWord } from '@/lib/agent/documents';
import { fusionner, resoudre } from '@/lib/agent/mise-en-forme';
import { modifierDocument, trouverPartie } from '@/lib/agent/edition';

const RAPPORT = `# Les micro-réseaux solaires en RDC

## Introduction

L'accès à l'électricité reste un défi.

## Partie 1 : Technique

Les panneaux et les batteries.

### Stockage

Les batteries lithium.

## Conclusion

Ancienne conclusion.

## Bibliographie

- Auteur (2024). Titre. Revue.`;

let espace = '';
beforeAll(async () => {
  espace = await mkdtemp(path.join(tmpdir(), 'six-rapports-'));
  await mkdir(path.join(espace, 'resultats'), { recursive: true });
  await writeFile(path.join(espace, 'resultats', 'rapport.md'), RAPPORT);
});
afterAll(async () => {
  await rm(espace, { recursive: true, force: true });
});

describe('génération des rapports', () => {
  it('lit la structure : titre du document, parties renumérotées', () => {
    const s = structurer(RAPPORT, 'rapport.md');
    expect(s.titre).toBe('Les micro-réseaux solaires en RDC');
    expect(
      s.blocs
        .filter((b) => b.type === 'titre')
        .map((b) => [(b as { niveau: number }).niveau, (b as { texte: string }).texte]),
    ).toEqual([
      [1, 'Introduction'],
      [1, 'Partie 1 : Technique'],
      [2, 'Stockage'],
      [1, 'Conclusion'],
      [1, 'Bibliographie'],
    ]);
    expect(lireMarkdown('- un\n- deux').map((b) => b.type)).toEqual(['puce', 'puce']);
  });

  it('produit un .docx valide (ZIP avec document, styles, table des matières) et un PDF', async () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const docx = versWord(RAPPORT, { nomFichier: 'rapport.md' });
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    const brut = docx.toString('latin1');
    for (const part of [
      'word/document.xml',
      'word/styles.xml',
      'word/settings.xml',
      'word/footer1.xml',
      '[Content_Types].xml',
    ])
      expect(brut).toContain(part);
    expect(brut).toContain('TOC \\o');
    const pdf = await versPdf(RAPPORT, { nomFichier: 'rapport.md' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('mise en forme', () => {
  it('comprend les réglages relatifs, les couleurs et les alignements en français', () => {
    const m1 = fusionner({}, { titre_document: { taille: 24 } });
    const m2 = fusionner(m1, {
      titre_document: { taille: '+4', couleur: 'bleu' },
      sommaire: { alignement: 'à gauche' },
    });
    expect(m2.titre_document).toMatchObject({ taille: 28, couleur: '1F4E9A' });
    expect(m2.sommaire?.alignement).toBe('gauche');
    expect(fusionner({}, { titre_document: { taille: 500 } }).titre_document?.taille).toBe(72);
    expect(
      fusionner({}, { texte: { alignement: 'justifié', interligne: '1,5' } }).texte,
    ).toMatchObject({ alignement: 'justifie', interligne: 1.5 });
  });

  it('applique le style professionnel sans gabarit', () => {
    const r = resoudre({}, null);
    expect(r.style).toBe('professionnel');
    expect(r.sommaire.afficher).toBe(true);
  });

  it('garde le style de la personne pour quand elle le demande', () => {
    const gabarit = {
      stylesXml: '',
      ids: {},
      corps: { police: 'Times New Roman', taille: 11 },
      titre1: { police: 'Times New Roman', taille: 20, couleur: '0F4761' },
      titre2: { police: 'Times New Roman', taille: 16, couleur: '0F4761' },
      justifie: true,
      margesTwips: 1440,
    };
    // Par défaut : la base sobre (Six l'adapte avec mise_en_forme), même si un gabarit existe.
    expect(resoudre({}, gabarit).style).toBe('professionnel');
    expect(resoudre({}, gabarit).texte.police).toBe('Calibri');
    // « Dans mon style » : le gabarit de la personne.
    expect(resoudre({ style: 'personnel' }, gabarit).style).toBe('personnel');
    expect(resoudre({ style: 'personnel' }, gabarit).texte.police).toBe('Times New Roman');
  });
});

describe('modification ciblée', () => {
  it('trouve une partie sans tenir compte des accents ni de la numérotation', () => {
    const lignes = RAPPORT.split('\n');
    expect(trouverPartie(lignes, 'conclusion')?.texte).toBe('Conclusion');
    expect(trouverPartie(lignes, 'technique')?.texte).toBe('Partie 1 : Technique');
  });

  it('réécrit seulement la partie demandée, garde la version précédente, régénère le Word (pas de PDF non demandé)', async () => {
    const r = await modifierDocument(espace, {
      chemin: 'rapport.docx',
      partie: 'Conclusion',
      nouveau_texte: 'Nouvelle conclusion argumentée.',
      mise_en_forme: { titre_document: { taille: '+4' }, sommaire: { alignement: 'gauche' } },
    });
    expect(r.resultat).toContain('réécrite');
    const md = await readFile(path.join(espace, 'resultats', 'rapport.md'), 'utf8');
    expect(md).toContain('Nouvelle conclusion argumentée.');
    expect(md).not.toContain('Ancienne conclusion.');
    expect(md).toContain("L'accès à l'électricité reste un défi."); // le reste ne bouge pas
    expect(md).toContain('## Bibliographie');
    const fichiers = await readdir(path.join(espace, 'resultats'));
    expect(fichiers).toEqual(expect.arrayContaining(['rapport.md', 'rapport.docx']));
    expect(fichiers).not.toContain('rapport.pdf');
    expect(await readdir(path.join(espace, 'resultats', '.six', 'versions'))).toHaveLength(1);
  });

  it('ajoute une partie avant la bibliographie et signale ce qui est introuvable', async () => {
    const r = await modifierDocument(espace, {
      chemin: 'resultats/rapport.md',
      nouvelle_partie_titre: 'Coûts',
      nouvelle_partie_texte: 'Les coûts baissent.',
    });
    expect(r.resultat).toContain('ajoutée');
    const md = await readFile(path.join(espace, 'resultats', 'rapport.md'), 'utf8');
    expect(md.indexOf('## Coûts')).toBeLessThan(md.indexOf('## Bibliographie'));
    const r2 = await modifierDocument(espace, {
      chemin: 'rapport',
      partie: 'Annexe Z',
      nouveau_texte: 'x',
    });
    expect(r2.resultat).toContain('introuvable');
    expect(
      await modifierDocument(espace, { chemin: 'inexistant.md', partie: 'x', nouveau_texte: 'y' }),
    ).toMatchObject({
      resultat: expect.stringContaining('introuvable'),
    });
  });
});
