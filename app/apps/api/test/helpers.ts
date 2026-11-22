import { EnvSchema, type Env } from '../src/env.js';

export function testEnv(overrides: Record<string, string> = {}): Env {
  return EnvSchema.parse({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: 'http://localhost:3000',
    RATE_LIMIT_PER_MINUTE: '100',
    ...overrides,
  });
}
