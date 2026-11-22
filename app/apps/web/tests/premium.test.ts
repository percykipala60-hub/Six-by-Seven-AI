import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayerBodySchema } from '@/lib/api-schemas';
import { montantMaishaPay, statutDepuisReponse } from '@/lib/maishapay';
import { nouvelleReference, offres, REFERENCE_VALIDE } from '@/lib/premium';
import { depasse, viderQuotas } from '@/lib/quotas';

const VARIABLES = [
  'PREMIUM_PRIX_7J',
  'PREMIUM_PRIX_30J',
  'PREMIUM_DEVISE',
  'MAISHAPAY_MONTANT_CENTIMES',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'MAISHAPAY_PUBLIC_KEY',
  'MAISHAPAY_SECRET_KEY',
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

describe('statut MaishaPay', () => {
  it('lit le statut du paiement, pas celui de la requête', () => {
    // « status: success » dit seulement que la demande a été reçue : le paiement reste en attente.
    expect(statutDepuisReponse({ status: 'success', data: { payment_status: 'PENDING' } })).toBe(
      'EN_ATTENTE',
    );
    expect(statutDepuisReponse({ status: 'success', data: {} })).toBe('EN_ATTENTE');
    expect(statutDepuisReponse({ status: 'success' })).toBe('EN_ATTENTE');
  });

  it('reconnaît les paiements réussis et échoués', () => {
    expect(statutDepuisReponse({ data: { transactionStatus: 'Success' } })).toBe('REUSSI');
    expect(statutDepuisReponse({ data: { payment_status: 'SUCCESS' } })).toBe('REUSSI');
    expect(statutDepuisReponse({ data: { transactionStatus: 'Declined' } })).toBe('ECHOUE');
    expect(statutDepuisReponse({ data: { payment_status: 'EXPIRED' } })).toBe('ECHOUE');
    expect(statutDepuisReponse({ data: { status: 'FAILED' } })).toBe('ECHOUE');
  });

  it('envoie le montant en unités, ou en centimes si demandé', () => {
    expect(montantMaishaPay(3)).toBe('3');
    vi.stubEnv('MAISHAPAY_MONTANT_CENTIMES', '1');
    expect(montantMaishaPay(3)).toBe('300');
    expect(montantMaishaPay(2.5)).toBe('250');
  });
});

describe('offres et références', () => {
  it('prend les prix de l’environnement, avec des valeurs par défaut', () => {
    expect(offres().map((o) => [o.id, o.jours, o.montant, o.devise])).toEqual([
      ['7j', 7, 3, 'USD'],
      ['30j', 30, 7, 'USD'],
    ]);
    vi.stubEnv('PREMIUM_PRIX_30J', '7500');
    vi.stubEnv('PREMIUM_DEVISE', 'cdf');
    expect(offres()[1]).toEqual({ id: '30j', jours: 30, montant: 7500, devise: 'CDF' });
  });

  it('crée des références uniques et reconnaissables', () => {
    const a = nouvelleReference();
    expect(a).toMatch(REFERENCE_VALIDE);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(nouvelleReference()).not.toBe(a);
    expect(REFERENCE_VALIDE.test("SIX-1'; drop table--")).toBe(false);
  });
});

describe('demande de paiement', () => {
  it('accepte Mobile Money avec un numéro international', () => {
    const r = PayerBodySchema.safeParse({
      canal: 'mobile',
      offre: '30j',
      operateur: 'airtel',
      telephone: '+243 99 123 45 67',
    });
    expect(r.success && r.data.telephone).toBe('+243991234567');
  });

  it('refuse un numéro sans indicatif ou une offre inconnue', () => {
    expect(
      PayerBodySchema.safeParse({
        canal: 'mobile',
        offre: '30j',
        operateur: 'airtel',
        telephone: '0991234567',
      }).success,
    ).toBe(false);
    expect(
      PayerBodySchema.safeParse({
        canal: 'mobile',
        offre: '365j',
        operateur: 'airtel',
        telephone: '+243991234567',
      }).success,
    ).toBe(false);
  });

  it('demande le titulaire pour une carte', () => {
    expect(
      PayerBodySchema.safeParse({
        canal: 'carte',
        offre: '7j',
        reseau: 'VISA',
        telephone: '+243991234567',
      }).success,
    ).toBe(false);
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
  it('refuse au-delà des analyses gratuites du jour (402)', async () => {
    vi.stubEnv('GRATUIT_ANALYSES_JOUR', '1');
    const { POST } = await import('@/app/api/analyze/route');
    const demande = () =>
      POST(
        new Request('http://localhost/api/analyze', {
          method: 'POST',
          headers: { origin: 'http://localhost', 'content-type': 'application/json' },
          body: JSON.stringify({ conversation: 'Salut, tu viens samedi ?' }),
        }),
      );
    expect((await demande()).status).toBe(200); // mode démonstration, sans clé d'IA
    const refus = await demande();
    expect(refus.status).toBe(402);
    expect(((await refus.json()) as { error: string }).error).toContain('Six Premium');
  });
});

describe('notification MaishaPay', () => {
  it('ne croit pas une notification : sans paiement connu, rien n’est activé', async () => {
    const espion = vi.spyOn(globalThis, 'fetch');
    const { POST } = await import('@/app/api/premium/notification/route');
    const res = await POST(
      new Request('http://localhost/api/premium/notification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: 'pas-une-reference', payment_status: 'SUCCESS' }),
      }),
    );
    expect(await res.json()).toEqual({ ok: true, statut: 'INCONNU' });
    expect(espion).not.toHaveBeenCalled();
  });

  it('ramène le navigateur sur l’écran Premium après une carte', async () => {
    const { GET } = await import('@/app/api/premium/notification/route');
    const ref = nouvelleReference();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('hors ligne'));
    const res = await GET(
      new Request(
        `http://localhost/api/premium/notification?status=200&description=APPROVED&transactionRefId=${ref}`,
      ),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      `https://app.sixbysevenai.com/reglages?v=premium&ref=${ref}`,
    );
  });
});
