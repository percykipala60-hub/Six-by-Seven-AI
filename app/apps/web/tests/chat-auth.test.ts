import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/chat/route';

const repondre = vi.hoisted(() => vi.fn());
vi.mock('@/lib/providers', () => ({ chat: repondre }));
vi.mock('@/lib/supabase-serveur', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  utilisateurDeRequete: async () => null,
}));

describe('authentification du chat', () => {
  it('refuse une demande anonyme avant d’appeler le fournisseur IA', async () => {
    const res = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { origin: 'http://localhost', 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Bonjour Six' }] }),
      }),
    );
    expect(res.status).toBe(401);
    expect(repondre).not.toHaveBeenCalled();
  });
});
