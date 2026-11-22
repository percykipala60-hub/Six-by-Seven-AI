import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HealthResponseSchema } from '@six/shared';
import { buildApp } from '../src/app.js';
import { testEnv } from './helpers.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /health', () => {
  it('répond 200 avec un corps conforme au contrat partagé', async () => {
    app = await buildApp(testEnv());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body.status).toBe('ok');
  });

  it('pose les en-têtes de sécurité', async () => {
    app = await buildApp(testEnv());
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS', () => {
  it('autorise une origine de la liste', async () => {
    app = await buildApp(testEnv());
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it("n'autorise pas une origine inconnue", async () => {
    app = await buildApp(testEnv());
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://pirate.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('erreurs', () => {
  it('renvoie un 404 JSON sans détail interne', async () => {
    app = await buildApp(testEnv());
    const res = await app.inject({ method: 'GET', url: '/nexiste-pas' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, message: 'Route inconnue.' });
  });

  it('limite le nombre de requêtes', async () => {
    app = await buildApp(testEnv({ RATE_LIMIT_PER_MINUTE: '2' }));
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/health' });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toMatch(/Réessaie/);
  });
});
