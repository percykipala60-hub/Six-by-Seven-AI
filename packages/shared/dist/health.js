// zod/mini : même validation, mais ~10 fois plus léger dans le navigateur (budget 3G).
import * as z from 'zod/mini';
/** Réponse de GET /health, validée des deux côtés (API et application Six). */
export const HealthResponseSchema = z.object({
    status: z.enum(['ok', 'degraded']),
    service: z.literal('six-api'),
    version: z.string().check(z.minLength(1)),
    uptimeSeconds: z.int().check(z.nonnegative()),
    time: z.iso.datetime(),
});
//# sourceMappingURL=health.js.map