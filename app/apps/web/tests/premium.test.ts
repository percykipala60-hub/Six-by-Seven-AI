import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offres } from '@/lib/premium';
import { depasse, viderQuotas } from '@/lib/quotas';

const VARIABLES = [
  'PREMIUM_PRIX_7J',
  'PREMIUM_PRIX_30J',
  'PREMIUM_DEVISE',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'APPLE_ACHATS',
  'SUPABASE_SERVICE_ROLE_KEY',
];

beforeEach(() => {
  for (const v of VARIABLES) vi.stubEnv(v, '');
  viderQuotas();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('offres', () => {
  it('prend les prix de l’environnement, avec des valeurs par défaut', () => {
    expect(offres().map((o) => [o.id, o.jours, o.montant, o.devise])).toEqual([
      ['7j', 7, 3, 'USD'],
      ['30j', 30, 7, 'USD'],
    ]);
    vi.stubEnv('PREMIUM_PRIX_30J', '7500');
    vi.stubEnv('PREMIUM_DEVISE', 'cdf');
    expect(offres()[1]).toEqual({ id: '30j', jours: 30, montant: 7500, devise: 'CDF' });
  });
});

describe('limites gratuites', () => {
  it('compte par appelant et bloque au-delà de la limite', async () => {
    for (let i = 0; i < 3; i++) expect(await depasse('analyses', 'u:a', 3)).toBe(false);
    expect(await depasse('analyses', 'u:a', 3)).toBe(true);
    expect(await depasse('analyses', 'u:b', 3)).toBe(false);
    expect(await depasse('messages', 'u:a', 3)).toBe(false);
  });

  it('une limite à 0 veut dire sans limite', async () => {
    for (let i = 0; i < 10; i++) expect(await depasse('messages', 'u:a', 0)).toBe(false);
  });
});

describe('route d’analyse', () => {
  const demande = async () => {
    const { POST } = await import('@/app/api/analyze/route');
    return POST(
      new Request('http://localhost/api/analyze', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ conversation: 'Salut, tu viens samedi ?' }),
      }),
    );
  };

  it('en veille (paiement pas configuré), ne limite personne', async () => {
    vi.stubEnv('GRATUIT_ANALYSES_JOUR', '1');
    for (let i = 0; i < 3; i++) expect((await demande()).status).toBe(200);
  });

  it('paiement ouvert : refuse au-delà des analyses gratuites du jour (402)', async () => {
    vi.stubEnv('GRATUIT_ANALYSES_JOUR', '1');
    vi.stubEnv('APPLE_ACHATS', 'oui');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
    expect((await demande()).status).toBe(200); // mode démonstration, sans clé d'IA
    const refus = await demande();
    expect(refus.status).toBe(402);
    expect(((await refus.json()) as { error: string }).error).toContain('Six Premium');
  });
});
