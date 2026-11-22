import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as TonJuste from '@/lib/ton-juste';

// L'appel à l'IA est remplacé : ces tests vérifient ce que la route laisse passer, pas la note elle-même.
vi.mock('@/lib/ton-juste', async (importOriginal) => ({
  ...(await importOriginal<typeof TonJuste>()),
  evaluer: vi.fn(async () => ({
    score: 70,
    feedback: 'Bien.',
    points_forts: [],
    axes_amelioration: [],
  })),
}));

const { POST } = await import('@/app/api/ton-juste/route');

const site = 'http://localhost:3000';
const demande = (body: unknown, origin = site) =>
  POST(
    new Request(`${site}/api/ton-juste`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    }),
  );
const valide = { levelId: 1, playerAnswer: 'Bonjour, je peux m’asseoir ?' };

afterEach(() => vi.unstubAllEnvs());

describe('route /api/ton-juste', () => {
  it('refuse un autre site et un niveau inconnu', async () => {
    expect((await demande(valide, 'https://evil.example')).status).toBe(403);
    expect((await demande({ levelId: 99, playerAnswer: 'Bonjour' })).status).toBe(400);
  });

  it('ne donne jamais de fausse note sans clé IA', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    expect((await demande(valide)).status).toBe(503);
  });

  it('a son propre plafond quotidien, pour garder le budget de Six', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('TON_JUSTE_DAILY_LIMIT', '1');
    const premiere = await demande(valide);
    expect(premiere.status).toBe(200);
    expect((await premiere.json()).score).toBe(70);
    const seconde = await demande(valide);
    expect(seconde.status).toBe(503);
    expect((await seconde.json()).error).toMatch(/limite d'évaluations/);
  });
});
