import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accesDeLaDemande,
  autoriseToutLePc,
  dossierCouvert,
  racinePour,
} from '@/lib/agent/acces-pc';
import { executerOutil } from '@/lib/agent/outils';
import { dossierChoisi } from '@/lib/espace-travail';

let base = '';
beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'six-acces-'));
  await mkdir(path.join(base, 'Cours', 'TP 3'), { recursive: true });
  await writeFile(path.join(base, 'Cours', 'TP 3', 'notes.txt'), 'Notes du TP');
  await writeFile(path.join(base, 'secret.txt'), 'Ne pas lire');
});
afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("accès de Cosinus hors du dossier de l'environnement", () => {
  it('ne donne aucun accès sans demande de la personne', async () => {
    const acces = await accesDeLaDemande('Fais-moi un résumé de mes notes');
    expect(acces).toEqual({ toutLePc: false, chemins: [] });
    const r = await executerOutil(
      'lire_fichier',
      { chemin: path.join(base, 'secret.txt') },
      { espace: '', horsDossier: acces },
    );
    expect(r.resultat).toMatch(/pas demandé/);
  });

  it('autorise seulement le dossier cité, même suivi du reste de la phrase', async () => {
    const dossier = path.join(base, 'Cours', 'TP 3');
    const acces = await accesDeLaDemande(`Regarde ${dossier} et résume les notes`);
    expect(acces.chemins).toEqual([dossier]);
    const ok = await executerOutil(
      'lire_fichier',
      { chemin: path.join(dossier, 'notes.txt') },
      { espace: '', horsDossier: acces },
    );
    expect(ok.resultat).toBe('Notes du TP');
    // Un fichier à côté, non cité : refusé.
    expect(racinePour(acces, path.join(base, 'secret.txt'))).toBeNull();
    expect(dossierCouvert(acces, base)).toBeNull();
  });

  it('autorise tout le PC seulement quand la personne le dit', () => {
    expect(autoriseToutLePc('Cherche ce fichier dans tout mon PC')).toBe(true);
    expect(autoriseToutLePc("Tu peux chercher partout sur l'ordinateur")).toBe(true);
    expect(autoriseToutLePc('Range mes fichiers')).toBe(false);
  });

  it('refuse les dossiers cachés même avec tout le PC', () => {
    const acces = { toutLePc: true, chemins: [] };
    expect(dossierCouvert(acces, path.join(base, '.ssh'))).toBeNull();
    expect(dossierCouvert(acces, path.join(base, 'Cours'))).toBe(path.join(base, 'Cours'));
  });

  it('valide le dossier choisi pour un environnement', async () => {
    expect(await dossierChoisi(base)).toBe(path.resolve(base));
    expect(await dossierChoisi('relatif/dossier')).toBe('');
    expect(await dossierChoisi(path.parse(base).root)).toBe('');
    expect(await dossierChoisi(path.join(base, 'secret.txt'))).toBe('');
    expect(await dossierChoisi(path.join(base, 'inexistant'))).toBe('');
  });
});
