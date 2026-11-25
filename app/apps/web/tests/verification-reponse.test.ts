import { beforeEach, expect, it, vi } from 'vitest';

const callAI = vi.fn();
vi.mock('../lib/ai', () => ({ callAI: (...args: unknown[]) => callAI(...args) }));

import { verifierReponse } from '../lib/verification-reponse';

beforeEach(() => callAI.mockReset());

it('corrige une action annoncée sans preuve puis limite la vérification à un appel', async () => {
  callAI.mockResolvedValue(
    JSON.stringify({ verdict: 'corrige', reponse: "La modification n'a pas abouti." }),
  );
  const reponse = await verifierReponse({
    question: 'Modifie le document',
    reponse: 'Le document a été modifié.',
    preuves: ['modifier_document : L’outil a échoué.'],
  });
  expect(reponse).toBe("La modification n'a pas abouti.");
  expect(callAI).toHaveBeenCalledOnce();
  expect(callAI.mock.calls[0][2]).toContain('L’outil a échoué.');
});

it('garde la réponse si la vérification échoue ou rend un format invalide', async () => {
  callAI.mockRejectedValueOnce(new Error('indisponible')).mockResolvedValueOnce('invalide');
  const demande = { question: 'Bonjour', reponse: 'Salut !' };
  expect(await verifierReponse(demande)).toBe('Salut !');
  expect(await verifierReponse(demande)).toBe('Salut !');
});
