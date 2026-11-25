import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { genreApercu, ressembleATexte } from '@/lib/arbre';
import { feuilleDeXml, textesPartages } from '@/lib/xlsx';
import { listerNiveau } from '@/lib/espace-travail';

describe('aperçus de tous les types de fichiers courants', () => {
  it('reconnaît photos, vidéos, sons, classeurs, archives et code', () => {
    expect(
      [
        'logo.svg',
        'film.mp4',
        'voix.m4a',
        'notes.xlsx',
        'sources.zip',
        'app.py',
        'style.scss',
        'x.bin',
      ].map(genreApercu),
    ).toEqual(['image', 'video', 'audio', 'tableur', 'archive', 'texte', 'texte', 'autre']);
  });

  it('affiche en texte un fichier inconnu seulement s’il contient du texte', () => {
    expect(ressembleATexte(new TextEncoder().encode('clé = valeur\nautre = 2'))).toBe(true);
    expect(ressembleATexte(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBe(false);
    expect(ressembleATexte(new Uint8Array([0xff, 0xfe, 0xfd, 0x41, 0x42, 0x43, 0x44, 0x45]))).toBe(
      false,
    );
  });

  it('lit une feuille Excel (textes partagés, nombres, cellules vides)', () => {
    const partages = textesPartages(
      '<sst><si><t>Année</t></si><si><t>Nom &amp; prénom</t></si><si><r><t>Mbala</t></r><r><t> Jean</t></r></si></sst>',
    );
    expect(partages).toEqual(['Année', 'Nom & prénom', 'Mbala Jean']);
    const xml = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2"><v>1950</v></c><c r="C2" t="inlineStr"><is><t>note</t></is></c></row>
<row r="3"><c r="B3" t="s"><v>2</v></c><c r="C3" t="b"><v>1</v></c></row>
</sheetData></worksheet>`;
    expect(feuilleDeXml(xml, partages)).toEqual([
      ['Année', 'Nom & prénom', ''],
      ['1950', '', 'note'],
      ['', 'Mbala Jean', 'VRAI'],
    ]);
  });
});

describe('premier niveau du dossier choisi (explorateur)', () => {
  let racine = '';
  beforeAll(async () => {
    racine = await mkdtemp(path.join(tmpdir(), 'six-niveau-'));
    await mkdir(path.join(racine, 'Cours', 'TP'), { recursive: true });
    await mkdir(path.join(racine, 'Vide'));
    await mkdir(path.join(racine, '.cache'));
    await writeFile(path.join(racine, 'b.txt'), 'b');
    await writeFile(path.join(racine, 'A.pdf'), 'a');
    await writeFile(path.join(racine, '.secret'), 's');
    await writeFile(path.join(racine, 'Cours', 'TP', 'x.md'), 'x');
  });
  afterAll(async () => {
    await rm(racine, { recursive: true, force: true });
  });

  it('montre les dossiers (même vides) puis les fichiers, sans rien de caché', async () => {
    const niveau = await listerNiveau(racine);
    expect(niveau?.map((e) => `${e.type}:${e.chemin}`)).toEqual([
      'dossier:Cours',
      'dossier:Vide',
      'fichier:A.pdf',
      'fichier:b.txt',
    ]);
    expect((await listerNiveau(racine, 'Cours'))?.map((e) => e.chemin)).toEqual(['Cours/TP']);
  });

  it('refuse ce qui sort du dossier ou qui n’est pas un dossier', async () => {
    expect(await listerNiveau(racine, '../')).toBeNull();
    expect(await listerNiveau(racine, '.cache')).toBeNull();
    expect(await listerNiveau(racine, 'A.pdf')).toBeNull();
  });
});
