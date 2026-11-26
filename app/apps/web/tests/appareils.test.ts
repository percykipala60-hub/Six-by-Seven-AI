import { afterEach, describe, expect, it, vi } from 'vitest';
import { dateConnexion, trierAppareils, type Appareil } from '@/lib/appareils';

const deconnecter = vi.fn(async () => true);
vi.mock('@/lib/supabase-serveur', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  adminDisponible: () => true,
  utilisateurDeRequete: async (req: Request) =>
    ['Bearer test-token', 'Bearer jeton-qr'].includes(req.headers.get('authorization') ?? '')
      ? { id: 'moi' }
      : null,
  // Deux appareils : « principal1 » (Google, session s1) et « qr000001 » (code QR, session s2).
  listerAppareils: async () => [
    {
      appareil: 'principal1',
      nom: 'PC',
      methode: 'Google',
      cree_le: '',
      derniere_connexion: '2026-11-26T09:00:00Z',
      connecte: true,
    },
    {
      appareil: 'qr000001',
      nom: 'Téléphone',
      methode: 'Code QR',
      cree_le: '',
      derniere_connexion: '2026-11-26T10:00:00Z',
      connecte: true,
    },
  ],
  sessionsDesAppareils: async () =>
    new Map([
      ['principal1', 's1'],
      ['qr000001', 's2'],
    ]),
  sessionDuJeton: (jeton: string) =>
    jeton === 'test-token' ? 's1' : jeton === 'jeton-qr' ? 's2' : null,
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

  // Premier test : charge la route à froid (lente quand la machine est occupée), d'où le délai plus long.
  it('demande d’être connecté', { timeout: 20_000 }, async () => {
    expect((await appel('GET', '', '')).status).toBe(401);
    expect((await appel('DELETE', '?appareil=principal1&cible=qr000001', '')).status).toBe(401);
  });

  it('tous les appareils voient la liste ; seul le principal peut gérer', async () => {
    const r = await appel('GET', '?appareil=principal1');
    expect(r.status).toBe(200);
    const d = (await r.json()) as {
      gestion: boolean;
      appareils: { appareil: string; role: string; gerable: boolean }[];
    };
    expect(d.gestion).toBe(true);
    expect(d.appareils.find((a) => a.appareil === 'qr000001')).toMatchObject({
      role: 'secondaire',
      gerable: true,
    });
  });

  it('le principal déconnecte ; un appareil par code QR est refusé ; un faux appareil aussi', async () => {
    expect((await appel('DELETE', '?appareil=principal1&cible=../../x')).status).toBe(400);
    expect(deconnecter).not.toHaveBeenCalled();
    expect((await appel('DELETE', '?appareil=qr000001&cible=principal1', 'jeton-qr')).status).toBe(
      403,
    );
    // Se faire passer pour le principal avec la session d'un autre appareil : refusé.
    expect((await appel('DELETE', '?appareil=principal1&cible=qr000001', 'jeton-qr')).status).toBe(
      403,
    );
    expect(deconnecter).not.toHaveBeenCalled();
    expect((await appel('DELETE', '?appareil=principal1&cible=qr000001')).status).toBe(200);
    expect(deconnecter).toHaveBeenCalledWith('moi', 'qr000001');
  });
});
