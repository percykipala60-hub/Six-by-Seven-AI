import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cheminSur, ecrireResultat, lireEspace, listerEspace, nomSur } from '@/lib/espace-travail';

let racine = '';
let dehors = '';

beforeAll(async () => {
  racine = await mkdtemp(path.join(tmpdir(), 'six-espace-'));
  dehors = await mkdtemp(path.join(tmpdir(), 'six-dehors-'));
  await mkdir(path.join(racine, 'rapports'), { recursive: true });
  await writeFile(path.join(racine, 'rapports', 'pbl.md'), '# Rapport');
  await writeFile(path.join(racine, '.secret'), 'caché');
  await writeFile(path.join(dehors, 'mot-de-passe.txt'), 'secret');
});
afterAll(async () => {
  await rm(racine, { recursive: true, force: true });
  await rm(dehors, { recursive: true, force: true });
});

describe('espace de travail de Cosinus', () => {
  it('refuse tout chemin qui sort du dossier', () => {
    expect(cheminSur(racine, '../dehors.txt')).toBeNull();
    expect(cheminSur(racine, 'rapports/../../x')).toBeNull();
    expect(cheminSur(racine, path.join(dehors, 'mot-de-passe.txt'))).toBeNull();
    expect(cheminSur(racine, 'C:/Windows/win.ini')).toBeNull();
    expect(cheminSur(racine, '.secret')).toBeNull();
    expect(cheminSur(racine, 'a\0b')).toBeNull();
    expect(cheminSur(racine, '')).toBeNull();
    expect(cheminSur(racine, 'rapports/pbl.md')).toBe(path.join(racine, 'rapports', 'pbl.md'));
  });

  it('liste les fichiers sans les fichiers cachés', async () => {
    const l = await listerEspace(racine);
    expect(l.map((f) => f.chemin)).toEqual(['rapports/pbl.md']);
  });

  it('lit un fichier du dossier, pas un fichier extérieur', async () => {
    expect((await lireEspace(racine, 'rapports/pbl.md'))?.toString()).toBe('# Rapport');
    expect(await lireEspace(racine, '../mot-de-passe.txt')).toBeNull();
    expect(await lireEspace(racine, 'absent.md')).toBeNull();
  });

  it('ne suit pas un lien symbolique qui sort du dossier', async () => {
    try {
      await symlink(path.join(dehors, 'mot-de-passe.txt'), path.join(racine, 'lien.txt'));
    } catch {
      return; // création de lien refusée (Windows sans droits) : rien à vérifier
    }
    expect(await lireEspace(racine, 'lien.txt')).toBeNull();
    expect((await listerEspace(racine)).some((f) => f.chemin === 'lien.txt')).toBe(false);
  });

  it('enregistre dans resultats sans écraser un fichier existant', async () => {
    const a = await ecrireResultat(racine, 'rapport.md', 'un');
    const b = await ecrireResultat(racine, 'rapport.md', 'deux');
    expect(a).toBe('resultats/rapport.md');
    expect(b).toBe('resultats/rapport-2.md');
    expect(await readFile(path.join(racine, 'resultats', 'rapport.md'), 'utf8')).toBe('un');
  });

  it('nettoie les noms de fichiers', () => {
    expect(nomSur('../../etc/passwd')).toBe('etc-passwd.md');
    expect(nomSur('notes.txt')).toBe('notes.txt');
    expect(nomSur('')).toBe('resultat-six.md');
    expect(nomSur('a\u0001b.md')).toBe('a-b.md');
  });
});
