import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ecrireEnPlace,
  listerEspace,
  listerVersions,
  nombresDeVersions,
  restaurerVersion,
} from '@/lib/espace-travail';

let racine = '';
beforeAll(async () => {
  racine = await mkdtemp(path.join(tmpdir(), 'six-versions-'));
});
afterAll(async () => {
  await rm(racine, { recursive: true, force: true });
});
const lire = (rel: string) => readFile(path.join(racine, rel), 'utf8');

describe('versions précédentes des fichiers de l’espace', () => {
  it('garde l’ancienne version à chaque remplacement, sans la montrer dans la liste', async () => {
    await ecrireEnPlace(racine, 'resultats/rapport.md', 'v1');
    await ecrireEnPlace(racine, 'resultats/rapport.md', 'v2');
    await ecrireEnPlace(racine, 'resultats/rapport.md', 'v3');
    expect(await lire('resultats/rapport.md')).toBe('v3');
    const versions = await listerVersions(racine, 'resultats/rapport.md');
    expect(versions).toHaveLength(2);
    expect((await listerEspace(racine)).map((f) => f.chemin)).toEqual(['resultats/rapport.md']);
    expect(await nombresDeVersions(racine)).toEqual({ 'resultats/rapport.md': 2 });
  });

  it('restaure une version, et la restauration elle-même peut être annulée', async () => {
    const [v2, v1] = await listerVersions(racine, 'resultats/rapport.md');
    expect(await restaurerVersion(racine, 'resultats/rapport.md', v1.id)).toEqual([
      'resultats/rapport.md',
    ]);
    expect(await lire('resultats/rapport.md')).toBe('v1');
    // La version d'avant la restauration (v3) est gardée.
    const apres = await listerVersions(racine, 'resultats/rapport.md');
    expect(apres).toHaveLength(3);
    await restaurerVersion(racine, 'resultats/rapport.md', apres[0].id);
    expect(await lire('resultats/rapport.md')).toBe('v3');
    expect(v2).toBeDefined();
  });

  it('refuse une version inventée ou un chemin qui sort de l’espace', async () => {
    await expect(restaurerVersion(racine, 'resultats/rapport.md', '../../x')).rejects.toThrow();
    await expect(restaurerVersion(racine, '../ailleurs.md', '1700000000000.md')).rejects.toThrow();
    expect(await listerVersions(racine, '.versions/resultats/rapport.md')).toEqual([]);
  });
});
