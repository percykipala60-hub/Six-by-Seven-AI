import { z } from 'zod';
export const ProjetSchema = z.object({
  titre: z.string().trim().min(1).max(100),
  contexte: z.string().trim().max(12000),
});
export const TacheSchema = z.object({
  titre: z.string().trim().min(1).max(100),
  demande: z.string().trim().min(1).max(12000),
  prochaine: z.string().datetime(),
  fuseau: z
    .string()
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat('fr', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
  repetition: z.enum(['unique', '24h', '7j']),
  skill: z.enum(['auto', 'documents', 'code', 'web', 'donnees', 'images']).default('auto'),
  projetId: z.string().uuid().optional(),
});
export type Projet = z.infer<typeof ProjetSchema> & {
  id: string;
  proprietaire: string;
  cree: string;
};
export type Tache = z.infer<typeof TacheSchema> & {
  id: string;
  proprietaire: string;
  etat: 'active' | 'pause' | 'terminee';
  execution?: { debut: string; fin?: string; resultat?: string; erreur?: string };
};
export type Travail = { projets: Projet[]; taches: Tache[]; battement?: string };
export function prochaineOccurrence(
  date: string,
  repetition: Tache['repetition'],
  maintenant: number,
): string {
  const intervalle = (repetition === '7j' ? 7 : 1) * 86400000;
  const debut = Date.parse(date);
  return new Date(
    debut + Math.max(1, Math.floor((maintenant - debut) / intervalle) + 1) * intervalle,
  ).toISOString();
}
