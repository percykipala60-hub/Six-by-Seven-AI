import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { loadPublicEnv } from '@/lib/env';

describe('loadPublicEnv', () => {
  it('accepte .env.example tel quel', () => {
    const path = fileURLToPath(new URL('../.env.example', import.meta.url));
    const env = loadPublicEnv(parseEnv(readFileSync(path, 'utf8')));
    expect(env.NEXT_PUBLIC_API_URL).toBe('http://localhost:4000');
  });

  it("refuse une URL d'API absente", () => {
    expect(() => loadPublicEnv({})).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('retire la barre finale', () => {
    expect(loadPublicEnv({ NEXT_PUBLIC_API_URL: 'https://api.six.app/' }).NEXT_PUBLIC_API_URL).toBe(
      'https://api.six.app',
    );
  });
});
