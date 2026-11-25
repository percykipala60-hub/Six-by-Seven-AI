import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modifierTravail } from '../lib/travail-serveur';
import { executerProchaine } from '../lib/planificateur';
import { prochaineOccurrence, type Tache } from '../lib/travail';
vi.mock('../lib/supabase-serveur', () => ({
  utilisateurDeRequete: async (r: Request) =>
    r.headers.get('authorization') === 'Bearer alice'
      ? { id: 'alice' }
      : r.headers.get('authorization') === 'Bearer bob'
        ? { id: 'bob' }
        : null,
}));
vi.mock('../lib/http', () => ({
  guard: async () => null,
  readJson: async (r: Request) => r.json(),
}));
import { GET, POST } from '../app/api/travail/route';
let dossier: string;
const id = 'b5888d47-ed11-4a7f-8999-1f051fd5cf1d';
const tache = (): Tache => ({
  id,
  proprietaire: 'alice',
  titre: 'Test',
  demande: 'Rédige une note',
  prochaine: new Date(Date.now() - 1000).toISOString(),
  fuseau: 'Africa/Lagos',
  repetition: 'unique',
  skill: 'documents',
  etat: 'active',
});
beforeEach(async () => {
  dossier = await mkdtemp(path.join(tmpdir(), 'six-travail-'));
  vi.stubEnv('SIX_TRAVAIL_DIR', dossier);
  vi.stubEnv('SIX_CRON_SECRET', 'x'.repeat(32));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dossier, { recursive: true, force: true });
});
it('exécute sans navigateur et persiste le résultat', async () => {
  await modifierTravail((e) => {
    e.taches.push(tache());
  });
  await executerProchaine(async () => 'Résultat conservé');
  const disque = await modifierTravail((e) => e);
  expect(disque.taches[0].etat).toBe('terminee');
  expect(disque.taches[0].execution?.resultat).toBe('Résultat conservé');
});
it('ne réserve pas deux fois une tâche lors de requêtes concurrentes', async () => {
  await modifierTravail((e) => {
    e.taches.push(tache());
  });
  const generer = vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 100));
    return 'ok';
  });
  await Promise.all([executerProchaine(generer), executerProchaine(generer)]);
  expect(generer).toHaveBeenCalledOnce();
});
it('suspend après échec et après une exécution interrompue', async () => {
  await modifierTravail((e) => {
    e.taches.push(tache());
  });
  await executerProchaine(async () => {
    throw new Error('panne');
  });
  expect(await modifierTravail((e) => e.taches[0].etat)).toBe('pause');
  await modifierTravail((e) => {
    e.taches[0].etat = 'active';
    e.taches[0].execution = { debut: new Date(Date.now() - 1000000).toISOString() };
  });
  const generer = vi.fn();
  await executerProchaine(generer);
  expect(generer).not.toHaveBeenCalled();
  expect(await modifierTravail((e) => e.taches[0].etat)).toBe('pause');
});
it('saute les répétitions manquées sans lancer une rafale', () => {
  expect(
    prochaineOccurrence('2026-01-01T10:00:00.000Z', '24h', Date.parse('2026-01-05T11:00:00Z')),
  ).toBe('2026-01-06T10:00:00.000Z');
});
it('isole les comptes et refuse un projet appartenant à un autre utilisateur', async () => {
  await modifierTravail((e) => {
    e.projets.push({
      id,
      proprietaire: 'alice',
      titre: 'Privé',
      contexte: 'secret',
      cree: new Date().toISOString(),
    });
  });
  const anonyme = await GET(new Request('http://localhost/api/travail'));
  expect(anonyme.status).toBe(401);
  const bob = await GET(
    new Request('http://localhost/api/travail', { headers: { authorization: 'Bearer bob' } }),
  );
  expect((await bob.json()).projets).toEqual([]);
  const modification = await POST(
    new Request('http://localhost/api/travail', {
      method: 'POST',
      headers: { authorization: 'Bearer bob', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'projet', id, donnees: { titre: 'Volé', contexte: '' } }),
    }),
  );
  expect(modification.status).toBe(400);
  expect(await modifierTravail((e) => e.projets[0].titre)).toBe('Privé');
});
it('refuse de créer une tâche lorsque le moteur ne tourne pas', async () => {
  const t = tache();
  t.prochaine = new Date(Date.now() + 3600000).toISOString();
  const r = await POST(
    new Request('http://localhost/api/travail', {
      method: 'POST',
      headers: { authorization: 'Bearer alice', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'tache', donnees: t }),
    }),
  );
  expect(r.status).toBe(400);
  expect(await modifierTravail((e) => e.taches.length)).toBe(0);
});
