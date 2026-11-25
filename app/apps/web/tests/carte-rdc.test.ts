import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cadreCarte,
  distanceKm,
  executerOutilCarte,
  lieuxUniques,
  questionDeLieu,
  urlCarteIntegree,
  urlLieu,
  viderCacheCarte,
} from '@/lib/carte-rdc';

const GOMBE = { nom: 'Gombe', lat: -4.3053, lon: 15.3107 };
const LIMETE = { nom: 'Limete', lat: -4.3638, lon: 15.3446 };

describe('questionDeLieu', () => {
  it.each([
    'Où se trouve l’hôpital du Cinquantenaire ?',
    'Une pharmacie près de Matete',
    'Quelle distance entre Kinshasa et Matadi ?',
    'Comment aller à Lemba depuis Gombe ?',
    'Dans quelle commune est le marché Gambela ?',
  ])('reconnaît « %s »', (q) => expect(questionDeLieu(q)).toBe(true));

  it.each(['Écris-moi un poème', 'Explique la photosynthèse', 'Traduis bonjour en lingala'])(
    'ignore « %s »',
    (q) => expect(questionDeLieu(q)).toBe(false),
  );
});

describe('calculs de carte', () => {
  it('distance Gombe–Limete : environ 7 km à vol d’oiseau', () => {
    expect(distanceKm(GOMBE, LIMETE)).toBeGreaterThan(6);
    expect(distanceKm(GOMBE, LIMETE)).toBeLessThan(8);
  });

  it('cadre qui contient tous les lieux, avec une marge', () => {
    const [ouest, sud, est, nord] = cadreCarte([GOMBE, LIMETE]) ?? [];
    expect(ouest).toBeLessThan(GOMBE.lon);
    expect(est).toBeGreaterThan(LIMETE.lon);
    expect(sud).toBeLessThan(LIMETE.lat);
    expect(nord).toBeGreaterThan(GOMBE.lat);
    expect(cadreCarte([])).toBeNull();
  });

  it('adresses OpenStreetMap', () => {
    const u = new URL(urlCarteIntegree([GOMBE]) ?? '');
    expect(u.origin).toBe('https://www.openstreetmap.org');
    expect(u.searchParams.get('marker')).toBe('-4.30530,15.31070');
    expect(urlLieu(GOMBE)).toContain('mlat=-4.30530&mlon=15.31070');
  });

  it('lieux sans doublons', () => {
    expect(lieuxUniques([GOMBE, { ...GOMBE, nom: 'Gombe bis' }, LIMETE])).toHaveLength(2);
  });
});

describe('outils de carte', () => {
  beforeEach(() => viderCacheCarte());
  afterEach(() => vi.unstubAllGlobals());

  it('chercher_lieu_rdc : interroge Nominatim en RDC seulement', async () => {
    const appels: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string) => {
        appels.push(String(url));
        return new Response(
          JSON.stringify([
            {
              name: 'Gombe',
              display_name: 'Gombe, Kinshasa, République démocratique du Congo',
              lat: '-4.3053',
              lon: '15.3107',
            },
          ]),
        );
      }),
    );
    const r = await executerOutilCarte('chercher_lieu_rdc', { requete: 'Gombe, Kinshasa' });
    expect(appels[0]).toContain('countrycodes=cd');
    expect(r.resultat).toContain('Gombe, Kinshasa');
    expect(r.lieux).toEqual([expect.objectContaining({ nom: 'Gombe', lat: -4.3053 })]);
  });

  it('lieux_proches_rdc : centre puis lieux triés par distance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string) =>
        String(url).includes('nominatim')
          ? new Response(JSON.stringify([{ name: 'Gombe', lat: '-4.3053', lon: '15.3107' }]))
          : new Response(
              JSON.stringify({
                elements: [
                  { lat: -4.32, lon: 15.32, tags: { name: 'Pharmacie loin' } },
                  { lat: -4.306, lon: 15.311, tags: { name: 'Pharmacie proche' } },
                ],
              }),
            ),
      ),
    );
    const r = await executerOutilCarte('lieux_proches_rdc', {
      categorie: 'pharmacie',
      pres_de: 'Gombe, Kinshasa',
    });
    expect(r.lieux.map((l) => l.nom)).toEqual(['Gombe', 'Pharmacie proche', 'Pharmacie loin']);
    expect(r.resultat).toMatch(/1\. Pharmacie proche/);
  });

  it('service indisponible : message clair, pas d’exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    const r = await executerOutilCarte('chercher_lieu_rdc', { requete: 'Lemba' });
    expect(r.lieux).toEqual([]);
    expect(r.resultat).toContain('ne répond pas');
  });
});
