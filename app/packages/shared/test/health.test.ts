import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '../src/index.js';

describe('HealthResponseSchema', () => {
  it('accepte une réponse valide', () => {
    const parsed = HealthResponseSchema.parse({
      status: 'ok',
      service: 'six-api',
      version: '0.1.0',
      uptimeSeconds: 12,
      time: new Date().toISOString(),
    });
    expect(parsed.status).toBe('ok');
  });

  it('refuse un statut inconnu', () => {
    const result = HealthResponseSchema.safeParse({
      status: 'boom',
      service: 'six-api',
      version: '0.1.0',
      uptimeSeconds: 1,
      time: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
