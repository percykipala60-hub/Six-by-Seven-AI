import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateConnexion, trierAppareils, type Appareil } from '@/lib/appareils';

const deconnecter = vi.fn(async () => true);
vi.mock('@/lib/supabase-serveur', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  adminDisponible: () => true,
  utilisateurDeRequete: async (req: Request) =>
    req.headers.get('authorization') === 'Bearer test-token' ? { id: 'moi' } : null,
  listerAppareils: async () => [],
  deconnecterAppareil: (...args: unknown[]) => deconnecter(...(args as [])),
}));

afterEach(() => deconnecter.mockClear());

const appareil = (id: string, jour: string, connecte = true): Appareil => ({
  appareil: id,
  nom: id,
  methode: 'Google',
  cree_le: `2026-11-${jour}T10:00:00Z`,
  derniere_connexion: `2026-11-${jour}T10:00:00Z`,
  connecte,
});

describe('appareils connectés', () => {
  it('cet appareil d’abord, puis les plus récents ; les sessions fermées disparaissent', () => {
    const liste = [
      appareil('ancien', '20'),
      appareil('ferme', '24', false),
      appareil('ici', '21'),
      appareil('recent', '25'),
    ];
    expect(trierAppareils(liste, 'ici').map((a) => a.appareil)).toEqual([
      'ici',
      'recent',
      'ancien',
    ]);
  });

  it('montre la date de la dernière connexion simplement', () => {
    const maintenant = new Date(2026, 10, 25, 18, 0);
    expect(dateConnexion(new Date(2026, 10, 25, 14, 5).toISOString(), maintenant)).toBe(
      'Aujourd’hui, 14:05',
    );
    expect(dateConnexion(new Date(2026, 10, 24, 9, 12).toISOString(), maintenant)).toBe(
      'Hier, 09:12',
    );
    expect(dateConnexion(new Date(2026, 10, 23, 16, 11).toISOString(), maintenant)).toMatch(
      /^23 nov\.?, 16:11$/,
    );
    expect(dateConnexion('pas une date', maintenant)).toBe('');
  });
});

describe('route des appareils', () => {
  const appel = async (methode: 'GET' | 'DELETE', requete = '', jeton = 'test-token') => {
    const route = await import('@/app/api/compte/appareils/route');
    return route[methode](
      new Request(`http://localhost/api/compte/appareils${requete}`, {
        method: methode,
        headers: {
          origin: 'http://localhost',
          ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
        },
      }),
    );
  };

  it('demande d’être connecté', async () => {
    expect((await appel('GET', '', '')).status).toBe(401);
    expect((await appel('DELETE', '?appareil=abcdefgh12', '')).status).toBe(401);
  });

  it('liste les appareils du compte', async () => {
    const r = await appel('GET');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ appareils: [] });
  });

  it('refuse un identifiant d’appareil invalide, déconnecte un appareil valide du compte', async () => {
    expect((await appel('DELETE', '?appareil=../../x')).status).toBe(400);
    expect(deconnecter).not.toHaveBeenCalled();
    expect((await appel('DELETE', '?appareil=abcdefgh12')).status).toBe(200);
    expect(deconnecter).toHaveBeenCalledWith('moi', 'abcdefgh12');
  });
});
