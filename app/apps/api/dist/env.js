import { z } from 'zod';
/** Une variable vide dans .env (`CLE=`) compte comme absente. */
const optional = (schema) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
const originList = z
    .string()
    .min(1, 'CORS_ORIGINS doit lister au moins une origine')
    .transform((raw) => raw.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z
    .url({ protocol: /^https?$/ })
    .refine((origin) => !origin.includes('*'), 'Pas de joker dans CORS_ORIGINS')
    .transform((origin) => origin.replace(/\/$/, ''))));
export const EnvSchema = z
    .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
    CORS_ORIGINS: originList,
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(30),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
    ANTHROPIC_API_KEY: optional(z.string().startsWith('sk-ant-', 'ANTHROPIC_API_KEY doit commencer par sk-ant-')),
    REDIS_URL: optional(z.url({ protocol: /^rediss?$/ })),
    /**
     * Modèle qui rédige pour l'app. « auto » : Claude si la clé est là, sinon Ollama local.
     * Les offres gratuites en ligne (Groq, Gemini…) sont exclues de l'app : elles peuvent
     * réutiliser les conversations. Elles restent disponibles dans les scripts d'essai.
     */
    AI_PROVIDER: z.enum(['auto', 'anthropic', 'ollama']).default('auto'),
    ANTHROPIC_MODEL: z.string().min(1).default('claude-haiku-4-5-20251001'),
    /** Moteur « Qualité maximale ». */
    ANTHROPIC_MODEL_QUALITE: z.string().min(1).default('claude-sonnet-5-5'),
    ANTHROPIC_URL: z.url({ protocol: /^https?$/ }).default('https://api.anthropic.com'),
    OLLAMA_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:11434/v1'),
    OLLAMA_MODEL: z.string().min(1).default('llama3.2:3b'),
    /** Moteur « Rapide » sans clé Claude : le plus petit modèle local. */
    OLLAMA_MODEL_RAPIDE: z.string().min(1).default('llama3.2:3b'),
    OLLAMA_TIMEOUT_S: z.coerce.number().int().min(5).max(3600).default(600),
})
    .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production')
        return;
    if (!env.REDIS_URL) {
        context.addIssue({
            code: 'custom',
            path: ['REDIS_URL'],
            message: 'REDIS_URL est requis en production pour le rate limiting partagé',
        });
    }
    else if (!env.REDIS_URL.startsWith('rediss://')) {
        context.addIssue({
            code: 'custom',
            path: ['REDIS_URL'],
            message: 'Utilise une URL Redis TLS (rediss://) en production',
        });
    }
    if (env.TRUST_PROXY_HOPS < 1) {
        context.addIssue({
            code: 'custom',
            path: ['TRUST_PROXY_HOPS'],
            message: 'Configure le nombre de relais de confiance en production',
        });
    }
});
/**
 * Valide les variables d'environnement et s'arrête avec un message lisible.
 * Les valeurs ne sont jamais affichées : seulement le nom de la variable fautive.
 */
export function loadEnv(source = process.env) {
    const result = EnvSchema.safeParse(source);
    if (!result.success) {
        const problems = result.error.issues
            .map((issue) => `  - ${issue.path.join('.') || '(racine)'} : ${issue.message}`)
            .join('\n');
        throw new Error(`Configuration invalide (voir .env.example) :\n${problems}`);
    }
    return result.data;
}
//# sourceMappingURL=env.js.map