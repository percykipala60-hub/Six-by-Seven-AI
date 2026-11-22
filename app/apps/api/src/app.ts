import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { HealthResponseSchema, type HealthResponse } from '@six/shared';
import type { Env } from './env.js';
import type { ProviderConfig } from './ai/openai-compatible.js';
import { providerFor } from './ai/server-provider.js';
import { registerReponses } from './routes/reponses.js';

export const API_VERSION = '0.4.0';

/** Taille maximale d'une requête : 6000 caractères de conversation + fiche de style. */
const BODY_LIMIT_BYTES = 32 * 1024;

/**
 * Logs sans contenu : ni corps de requête, ni query string, ni IP, ni en-têtes sensibles.
 * Une conversation ne doit jamais pouvoir apparaître dans un log.
 */
function loggerOptions(
  env: Env,
  stream?: NodeJS.WritableStream,
): NonNullable<FastifyServerOptions['logger']> {
  if (env.LOG_LEVEL === 'silent') return false;
  return {
    level: env.LOG_LEVEL,
    ...(stream ? { stream } : {}),
    redact: {
      paths: ['req.headers', 'req.body', 'res.headers', 'body'],
      remove: true,
    },
    serializers: {
      req: (req: { method: string; url: string; id: string }) => ({
        id: req.id,
        method: req.method,
        path: req.url.split('?')[0]?.split('#')[0] ?? '/',
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  };
}

export interface BuildOptions {
  /** Pour les tests : capture des logs. */
  logStream?: NodeJS.WritableStream;
  /** Pour les tests : un faux modèle à la place de celui de l'environnement. */
  provider?: ProviderConfig;
  fetchImpl?: typeof fetch;
}

export async function buildApp(env: Env, options: BuildOptions = {}): Promise<FastifyInstance> {
  if (env.NODE_ENV === 'production' && !env.REDIS_URL)
    throw new Error('REDIS_URL est requis en production pour le rate limiting partagé.');

  const trustProxy =
    env.NODE_ENV === 'production'
      ? (_address: string, hop: number) => hop < env.TRUST_PROXY_HOPS
      : false;
  const app = Fastify({
    logger: loggerOptions(env, options.logStream),
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy,
    genReqId: () => crypto.randomUUID(),
  });

  const redis = env.REDIS_URL
    ? new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      })
    : undefined;
  if (redis) {
    redis.on('error', () => app.log.error('Connexion Redis du rate limiter indisponible.'));
    try {
      await redis.connect();
    } catch {
      redis.disconnect();
      throw new Error('Impossible de connecter Redis pour le rate limiting.');
    }
    app.addHook('onClose', async () => {
      if (redis.status === 'ready') await redis.quit();
      else redis.disconnect();
    });
  }

  await app.register(helmet, {
    // L'API ne renvoie que du JSON : aucune ressource ne doit pouvoir être chargée.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  const allowedOrigins = new Set(env.CORS_ORIGINS);
  await app.register(cors, {
    origin: (origin, callback) => {
      // Pas d'en-tête Origin (curl, sonde de surveillance) : accepté, CORS ne concerne que les navigateurs.
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
    methods: ['GET', 'POST'],
    credentials: false,
    maxAge: 600,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    ...(redis ? { redis } : {}),
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Trop de demandes. Réessaie dans ${Math.ceil(context.ttl / 1000)} s.`,
    }),
  });

  const startedAt = Date.now();

  app.get('/health', async (): Promise<HealthResponse> => {
    return HealthResponseSchema.parse({
      status: 'ok',
      service: 'six-api',
      version: API_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      time: new Date().toISOString(),
    });
  });

  registerReponses(app, {
    provider: (moteur) => options.provider ?? providerFor(env, moteur),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Route inconnue.' });
  });

  app.setErrorHandler((error: { statusCode?: number; message: string }, request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: { message: error.message } }, 'Erreur interne');
      void reply
        .code(statusCode)
        .send({ statusCode, error: 'Internal Server Error', message: 'Erreur interne.' });
      return;
    }
    void reply.code(statusCode).send({ statusCode, error: 'Bad Request', message: error.message });
  });

  return app;
}
