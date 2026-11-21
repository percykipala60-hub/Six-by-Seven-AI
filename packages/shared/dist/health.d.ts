import * as z from 'zod/mini';
/** Réponse de GET /health, validée des deux côtés (API et application Six). */
export declare const HealthResponseSchema: z.ZodMiniObject<{
    status: z.ZodMiniEnum<{
        ok: "ok";
        degraded: "degraded";
    }>;
    service: z.ZodMiniLiteral<"six-api">;
    version: z.ZodMiniString<string>;
    uptimeSeconds: z.ZodMiniInt;
    time: z.iso.ZodMiniISODateTime;
}, z.core.$strip>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
