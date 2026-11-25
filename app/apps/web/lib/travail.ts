import { z } from 'zod';
/** Documents d'un projet (texte ou PDF lus sur l'appareil) : 10 au plus, 24 000 caractères en tout. */
export const DOCS_PROJET_MAX = 10;
export const DOC_PROJET_MAX = 12_000;
export const DOCS_PROJET_TOTAL = 24_000;
export const ProjetSchema = z.object({
  titre: z.string().trim().min(1).max(100),
  contexte: z.string().trim().max(12000),
  documents: z
    .array(
      z.object({
        nom: z.string().trim().min(1).max(120),
        texte: z.string().min(1).max(DOC_PROJET_MAX),
      }),
    )
    .max(DOCS_PROJET_MAX)
    .refine((l) => l.reduce((n, d) => n + d.texte.length, 0) <= DOCS_PROJET_TOTAL)
    .optional(),
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
  skill: z
    .enum(['auto', 'documents', 'code', 'web', 'presentations', 'donnees', 'images'])
    .default('auto'),
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
/**
 * Contexte d'un projet donné à Six (Chat, Cosinus, tâches planifiées) : consignes puis documents. Ce sont des données
 * de référence, jamais des ordres.
 */
export function contexteDuProjet(p: Pick<Projet, 'titre' | 'contexte' | 'documents'>): string {
  const documents = (p.documents ?? [])
    .map((d) => `[Document du projet : ${d.nom}]\n${d.texte}`)
    .join('\n\n');
  return [`Contexte du projet « ${p.titre} » (données de référence) :`, p.contexte, documents]
    .filter((x) => x.trim())
    .join('\n\n');
}

/** Ajoute un document lu sur l'appareil, tronqué au besoin. Renvoie la nouvelle liste ou un message d'erreur. */
export function ajouterDocumentProjet(
  documents: { nom: string; texte: string }[],
  nom: string,
  texte: string,
): { documents: { nom: string; texte: string }[] } | { erreur: string } {
  if (documents.length >= DOCS_PROJET_MAX)
    return { erreur: `Un projet garde ${DOCS_PROJET_MAX} documents au plus.` };
  const propre = texte.trim();
  if (!propre) return { erreur: 'Ce fichier ne contient pas de texte lisible.' };
  const place = DOCS_PROJET_TOTAL - documents.reduce((n, d) => n + d.texte.length, 0);
  const max = Math.min(DOC_PROJET_MAX, place);
  if (max < 200)
    return { erreur: 'Les documents de ce projet sont déjà assez longs. Retires-en un.' };
  const coupe =
    propre.length > max ? `${propre.slice(0, max - 30)}\n\n[… document tronqué]` : propre;
  return {
    documents: [...documents, { nom: nom.trim().slice(0, 120) || 'Document', texte: coupe }],
  };
}

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
