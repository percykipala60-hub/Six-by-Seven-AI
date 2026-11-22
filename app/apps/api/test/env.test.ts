import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env.js';

describe('loadEnv', () => {
  it('accepte .env.example tel quel', () => {
    const path = fileURLToPath(new URL('../.env.example', import.meta.url));
    const env = loadEnv(parseEnv(readFileSync(path, 'utf8')));
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('refuse un joker dans CORS_ORIGINS', () => {
    expect(() => loadEnv({ CORS_ORIGINS: 'https://*.example.com' })).toThrow(/CORS_ORIGINS/);
  });

  it('refuse une clé Anthropic mal formée sans afficher sa valeur', () => {
    const secret = 'cle-secrete-123';
    try {
      loadEnv({ CORS_ORIGINS: 'http://localhost:3000', ANTHROPIC_API_KEY: secret });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toMatch(/ANTHROPIC_API_KEY/);
      expect(String(error)).not.toContain(secret);
    }
  });

  it('accepte plusieurs origines et retire la barre finale', () => {
    const env = loadEnv({ CORS_ORIGINS: 'https://six.app/, http://localhost:3000' });
    expect(env.CORS_ORIGINS).toEqual(['https://six.app', 'http://localhost:3000']);
  });

  it('exige Redis TLS et un proxy de confiance en production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://six.app',
        TRUST_PROXY_HOPS: '0',
      }),
    ).toThrow(/REDIS_URL|TRUST_PROXY_HOPS/);
  });
});
