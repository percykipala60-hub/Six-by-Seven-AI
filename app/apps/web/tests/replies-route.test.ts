import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/replies/route';

const reponses = vi.hoisted(() =>
  vi.fn(async (_input: unknown, _premium?: boolean) => ({
    reponses: ['Réponse A', 'Réponse B', 'Réponse C'] as [string, string, string],
    demo: true,
  })),
);

vi.mock('@/lib/providers', () => ({ replies: reponses }));

async function poster(body: unknown) {
  return POST(
    new Request('http://localhost/api/replies', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  );
}

describe('route de rédaction', () => {
  beforeEach(() => vi.clearAllMocks());

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
      false, // sans compte premium : modèle de la version gratuite
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
