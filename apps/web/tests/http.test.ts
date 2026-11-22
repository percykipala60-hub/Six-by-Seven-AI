import { afterEach, describe, expect, it, vi } from 'vitest';
import { clientKey, foreignOrigin, guard, readJson } from '@/lib/http';
import { dailyLimitReached } from '@/lib/ai';

const req = (headers: Record<string, string> = {}, url = 'http://localhost:3000/api/analyze') =>
  new Request(url, { method: 'POST', headers, body: '{}' });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('origine des requêtes', () => {
  it("accepte l'app elle-même", () => {
    expect(foreignOrigin(req({ origin: 'http://localhost:3000' }))).toBe(false);
    expect(foreignOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
  });

  it('refuse un autre site et une requête sans origine', () => {
    expect(foreignOrigin(req({ origin: 'https://site-pirate.example' }))).toBe(true);
    expect(foreignOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(foreignOrigin(req())).toBe(true);
  });

  it("derrière le relais du serveur, accepte l'adresse publique du site", () => {
    vi.stubEnv('TRUST_PROXY', '1');
    const derriere = {
      origin: 'https://app.six.example',
      'x-forwarded-host': 'app.six.example',
      'x-forwarded-proto': 'https',
    };
    expect(foreignOrigin(req(derriere))).toBe(false);
    expect(foreignOrigin(req({ ...derriere, origin: 'https://site-pirate.example' }))).toBe(true);
  });

  it("sans relais déclaré, n'écoute pas X-Forwarded-Host", () => {
    expect(
      foreignOrigin(
        req({ origin: 'https://site-pirate.example', 'x-forwarded-host': 'site-pirate.example' }),
      ),
    ).toBe(true);
  });

  it('accepte les domaines listés dans ALLOWED_ORIGINS', () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://six.example, https://www.six.example/');
    expect(foreignOrigin(req({ origin: 'https://www.six.example' }))).toBe(false);
  });

  it('guard renvoie 403 pour un autre site', async () => {
    const r = await guard(req({ origin: 'https://site-pirate.example' }));
    expect(r?.status).toBe(403);
  });
});

describe('adresse du client (limite de débit)', () => {
  it('ignore X-Forwarded-For sans relais de confiance', () => {
    vi.stubEnv('TRUST_PROXY', '');
    expect(clientKey(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe('direct');
  });

  it("prend l'adresse ajoutée par le relais de confiance, pas celle inventée par le client", () => {
    vi.stubEnv('TRUST_PROXY', '1');
    // le client a inventé 6.6.6.6, l'hébergeur a ajouté la vraie adresse 41.243.1.2 à la fin
    expect(clientKey(req({ 'x-forwarded-for': '6.6.6.6, 41.243.1.2' }))).toBe('41.243.1.2');
  });

  it("un client qui change d'en-tête à chaque requête reste limité", () => {
    vi.stubEnv('TRUST_PROXY', '');
    const statuts = Promise.all(
      Array.from(
        { length: 22 },
        async (_, i) =>
          (await guard(req({ origin: 'http://localhost:3000', 'x-forwarded-for': `10.0.0.${i}` })))
            ?.status ?? 200,
      ),
    );
    return expect(statuts).resolves.toContain(429);
  });

  it('utilise le compteur partagé Redis et ne transmet pas l’adresse IP en clair', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', '1');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
    vi.stubEnv('RATE_LIMIT_HASH_SECRET', 'a'.repeat(32));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([{ result: 21 }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await guard(
      req({ origin: 'http://localhost:3000', 'x-forwarded-for': '41.243.1.2' }),
    );

    expect(response?.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody[0][0]).toBe('EVAL');
    expect(requestBody[0][3]).not.toContain('41.243.1.2');
  });

  it('bascule sur la mémoire locale en production sans magasin partagé', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TRUST_PROXY', '1');

    const response = await guard(
      req({ origin: 'http://localhost:3000', 'x-forwarded-for': '41.243.1.2' }),
    );

    expect(response).toBeNull();
  });
});

describe('taille des requêtes', () => {
  it("refuse d'après la taille annoncée sans lire le corps", async () => {
    const r = new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-length': '999999' },
      body: '{}',
    });
    expect(await readJson(r)).toBeNull();
  });

  it('limite aussi le corps reçu quand Content-Length est absent', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"conversation":"'));
        controller.enqueue(new Uint8Array(64));
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    });
    const r = new Request('http://localhost/api/x', {
      method: 'POST',
      body,
      duplex: 'half',
    } as RequestInit);
    expect(await readJson(r, 32)).toBeNull();
  });

  it('lit correctement un JSON dans la limite en comptant les octets UTF-8', async () => {
    const r = new Request('http://localhost/api/x', {
      method: 'POST',
      body: JSON.stringify({ mot: 'é' }),
    });
    expect(await readJson(r, 32)).toEqual({ mot: 'é' });
  });

  it('refuse un tableau JSON comme corps de requête', async () => {
    const r = new Request('http://localhost/api/x', { method: 'POST', body: '[]' });
    expect(await readJson(r)).toBeNull();
  });
});

describe('plafond quotidien', () => {
  it('bloque au-delà de AI_DAILY_LIMIT', () => {
    vi.stubEnv('AI_DAILY_LIMIT', '2');
    const res = [
      dailyLimitReached(),
      dailyLimitReached(),
      dailyLimitReached(),
      dailyLimitReached(),
    ];
    expect(res.slice(-2)).toEqual([true, true]);
  });

  it('se désactive avec AI_DAILY_LIMIT=0', () => {
    vi.stubEnv('AI_DAILY_LIMIT', '0');
    expect(dailyLimitReached()).toBe(false);
  });
});
