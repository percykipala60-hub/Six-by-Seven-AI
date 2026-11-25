import { promises as fs } from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cheminCloud,
  choisirAuto,
  depotDeTexte,
  fichiersDuZip,
  materialiser,
  niveauDepuisListe,
  synchroniser,
  type EnvironnementCloud,
} from '@/lib/cloud-cosinus';

const env = (id: string, depot: string | null, defaut = false): EnvironnementCloud => ({
  id,
  nom: id,
  depot_github: depot,
  branche: null,
  par_defaut: defaut,
  maj: '',
});

describe('Cloud de Cosinus', () => {
  it('refuse les chemins qui sortiraient de l’environnement', () => {
    expect(cheminCloud('resultats/rapport.md')).toBe('resultats/rapport.md');
    expect(cheminCloud('/a/b.txt')).toBe('a/b.txt');
    for (const c of ['../x', 'a/../../x', 'a\\b', '', 'a//b', './a'])
      expect(cheminCloud(c)).toBeNull();
  });

  it('montre le contenu direct d’un dossier à partir de la liste des fichiers', () => {
    const fichiers = [
      { chemin: 'README.md', taille: 5, maj: 1 },
      { chemin: 'src/app.ts', taille: 9, maj: 2 },
      { chemin: 'src/lib/a.ts', taille: 3, maj: 3 },
      { chemin: '.github/ci.yml', taille: 1, maj: 1 },
    ];
    expect(niveauDepuisListe(fichiers, '').map((e) => `${e.type}:${e.chemin}`)).toEqual([
      'dossier:src',
      'fichier:README.md',
    ]);
    expect(niveauDepuisListe(fichiers, 'src').map((e) => e.chemin)).toEqual([
      'src/lib',
      'src/app.ts',
    ]);
  });

  it('reconnaît un dépôt GitHub (lien ou propriétaire/dépôt)', () => {
    expect(depotDeTexte('https://github.com/percy/six-app.git')).toBe('percy/six-app');
    expect(depotDeTexte('Regarde github.com/a/b et corrige')).toBe('a/b');
    expect(depotDeTexte('percy/six')).toBe('percy/six');
    expect(depotDeTexte('fais un rapport sur le solaire')).toBeNull();
  });

  it('« Auto » choisit l’environnement du dépôt cité, sinon le cloud par défaut', () => {
    const envs = [
      env('defaut', null, true),
      env('six', 'percy/six-app'),
      env('site', 'percy/site'),
    ];
    expect(choisirAuto(envs, 'corrige le bug dans github.com/percy/six-app')?.id).toBe('six');
    expect(choisirAuto(envs, 'ajoute une page au site')?.id).toBe('site');
    expect(choisirAuto(envs, 'résume ce PDF')?.id).toBe('defaut');
  });

  it('lit une archive de dépôt (fichiers stockés et compressés)', () => {
    const entree = (nom: string, donnees: Buffer, comprime: boolean) => {
      const corps = comprime ? deflateRawSync(donnees) : donnees;
      const nomB = Buffer.from(nom);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(comprime ? 8 : 0, 8);
      local.writeUInt32LE(corps.length, 18);
      local.writeUInt32LE(donnees.length, 22);
      local.writeUInt16LE(nomB.length, 26);
      return { nomB, local, corps, comprime, taille: donnees.length };
    };
    const e = [
      entree('depot-main/a.txt', Buffer.from('bonjour'), false),
      entree('depot-main/src/b.ts', Buffer.from('x'.repeat(500)), true),
    ];
    const parties: Buffer[] = [];
    const centraux: Buffer[] = [];
    let decalage = 0;
    for (const x of e) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(x.comprime ? 8 : 0, 10);
      c.writeUInt32LE(x.corps.length, 20);
      c.writeUInt32LE(x.taille, 24);
      c.writeUInt16LE(x.nomB.length, 28);
      c.writeUInt32LE(decalage, 42);
      centraux.push(c, x.nomB);
      parties.push(x.local, x.nomB, x.corps);
      decalage += 30 + x.nomB.length + x.corps.length;
    }
    const central = Buffer.concat(centraux);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(e.length, 8);
    fin.writeUInt16LE(e.length, 10);
    fin.writeUInt32LE(central.length, 12);
    fin.writeUInt32LE(decalage, 16);
    const zip = Buffer.concat([...parties, central, fin]);
    const fichiers = fichiersDuZip(zip);
    expect(fichiers.map((f) => [f.nom, f.octets.toString()])).toEqual([
      ['depot-main/a.txt', 'bonjour'],
      ['depot-main/src/b.ts', 'x'.repeat(500)],
    ]);
  });
});

describe('tâche de l’agent dans un environnement cloud', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('copie les fichiers, puis ne renvoie au Cloud que ce qui a changé', async () => {
    // Supabase simulé : deux fichiers dans l'environnement.
    const base = new Map([
      ['notes.md', Buffer.from('# Notes')],
      ['src/a.ts', Buffer.from('const a = 1;')],
    ]);
    const ecrits: { chemin: string; contenu: string; user_id: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = decodeURIComponent(String(url));
        if (init?.method === 'POST') {
          ecrits.push(...(JSON.parse(String(init.body)) as typeof ecrits));
          return new Response('', { status: 201 });
        }
        if (init?.method === 'PATCH') return new Response('', { status: 204 });
        if (u.includes('select=chemin,taille,maj'))
          return Response.json(
            [...base].map(([chemin, o]) => ({
              chemin,
              taille: o.length,
              maj: '2026-11-25T00:00:00Z',
            })),
          );
        const chemin = /chemin=eq\.([^&]+)/.exec(u)?.[1] ?? '';
        return Response.json([{ contenu: base.get(chemin)?.toString('base64') }]);
      }),
    );
    const { dossier, avant } = await materialiser('jeton', 'env-1');
    expect(await fs.readFile(path.join(dossier, 'src', 'a.ts'), 'utf8')).toBe('const a = 1;');
    // L'agent modifie un fichier et en crée un autre.
    await fs.writeFile(path.join(dossier, 'notes.md'), '# Notes\n\nAjout');
    await fs.mkdir(path.join(dossier, 'resultats'));
    await fs.writeFile(path.join(dossier, 'resultats', 'rapport.md'), '# Rapport');
    const renvoyes = await synchroniser('jeton', 'user-1', 'env-1', dossier, avant);
    expect(renvoyes.sort()).toEqual(['notes.md', 'resultats/rapport.md']);
    expect(ecrits.find((e) => e.chemin === 'notes.md')?.user_id).toBe('user-1');
    expect(
      Buffer.from(
        ecrits.find((e) => e.chemin === 'resultats/rapport.md')?.contenu ?? '',
        'base64',
      ).toString(),
    ).toBe('# Rapport');
    // Le dossier temporaire est effacé.
    await expect(fs.stat(dossier)).rejects.toThrow();
  });
});
