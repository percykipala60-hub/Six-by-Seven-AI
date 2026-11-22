import * as z from 'zod/mini';

export const PublicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.pipe(
    z.url({ protocol: /^https?$/ }),
    z.transform((url: string) => url.replace(/\/$/, '')),
  ),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

/**
 * Next.js remplace `process.env.NEXT_PUBLIC_*` au build : on doit écrire chaque nom en entier.
 * Le build échoue tout de suite si la valeur manque ou est invalide.
 */
export function loadPublicEnv(
  source: Record<string, string | undefined> = {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
): PublicEnv {
  const result = PublicEnvSchema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Configuration web invalide (voir apps/web/.env.example) : ${names}`);
  }
  return result.data;
}
