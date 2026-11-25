import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/replies/route';

const reponses = vi.hoisted(() =>
  vi.fn(async (_input: unknown, _premium?: boolean) => ({
    reponses: ['Réponse A', 'Réponse B', 'Réponse C'] as [string, string, string],
    demo: true,
  })),
);

vi.mock('@/lib/providers', () => ({ replies: reponses }));
vi.mock('@/lib/supabase-serveur', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  utilisateurDeRequete: async (req: Request) =>
    req.headers.get('authorization') === 'Bearer test-token' ? { id: 'test-user' } : null,
}));

async function poster(body: unknown) {
  return POST(
    new Request('http://localhost/api/replies', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  );
}

describe('route de rédaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuse un appelant sans session', async () => {
    const response = await POST(
      new Request('http://localhost/api/replies', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({
          conversation: 'Bonjour',
          objectif: 'Répondre',
          ton: 'amical',
          longueur: 'courte',
        }),
      }),
    );
    expect(response.status).toBe(401);
    expect(reponses).not.toHaveBeenCalled();
  });

  it('accepte une rédaction sans préférence de style enregistrée', async () => {
    const response = await poster({
      conversation: 'Bonjour',
      objectif: 'Répondre avec tact',
      ton: 'amical',
      longueur: 'courte',
    });

    expect(response.status).toBe(200);
    expect(reponses).toHaveBeenCalledWith(
      {
        conversation: 'Bonjour',
        objectif: 'Répondre avec tact',
        ton: 'amical',
        longueur: 'courte',
        precision: undefined,
        style: undefined,
        canal: undefined,
      },
      true, // premium en veille (paiement pas configuré) : meilleur modèle pour tous
    );
  });

  it('indique le champ invalide sans exposer le contenu de la conversation', async () => {
    const response = await poster({
      conversation: 'Message privé à ne pas afficher',
      objectif: 'Répondre',
      ton: 'ton inconnu',
      longueur: 'courte',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Paramètres de rédaction invalides : ton.',
    });
  });

  it('identifie les champs requis manquants', async () => {
    const response = await poster({
      ton: 'amical',
      longueur: 'courte',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Paramètres de rédaction invalides : conversation, objectif.',
    });
  });
});
