import { afterEach, describe, expect, it, vi } from 'vitest';
import { etatSession } from '@/lib/supabase-serveur';

afterEach(() => vi.unstubAllGlobals());

const reponse = (status: number, corps: object) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(corps), { status }));

describe('déconnexion depuis un autre appareil', () => {
  it('reconnaît une session supprimée', async () => {
    vi.stubGlobal('fetch', reponse(403, { error_code: 'session_not_found' }));
    expect(await etatSession('jeton')).toBe('fermee');
  });

  it('ne déconnecte pas pour un jeton expiré ou invalide (il se renouvelle)', async () => {
    vi.stubGlobal('fetch', reponse(403, { error_code: 'bad_jwt' }));
    expect(await etatSession('jeton')).toBe('inconnue');
    vi.stubGlobal('fetch', reponse(401, {}));
    expect(await etatSession('jeton')).toBe('inconnue');
  });

  it('session active, ou Supabase injoignable', async () => {
    vi.stubGlobal('fetch', reponse(200, { id: 'u' }));
    expect(await etatSession('jeton')).toBe('active');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('hors ligne')));
    expect(await etatSession('jeton')).toBe('inconnue');
  });
});
