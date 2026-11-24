/**
 * Copie des projets et des artefacts sur le compte (tables `projets` et `artefacts`, voir
 * supabase/migrations/20261124_projets_artefacts.sql). Appelée par lib/compte.ts seulement quand la personne a
 * autorisé la synchronisation de sa mémoire ; chargée à la demande.
 *
 * Économe sur un petit réseau : on lit d'abord les identifiants et les dates du compte, puis on ne télécharge que ce
 * qui est plus récent sur le compte et on n'envoie que ce qui est plus récent sur l'appareil. La version la plus
 * récente gagne. Les suppressions faites sur l'appareil sont reportées sur le compte.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SUPPRESSIONS_ARTEFACTS,
  curerArtefact,
  ecrireArtefacts,
  lireArtefacts,
  type Artefact,
} from './artefacts';
import { memoireActive } from './memoire';
import {
  SUPPRESSIONS_PROJETS,
  curerProjet,
  ecrireProjets,
  lireProjets,
  lireSuppressions,
  oublierSuppressions,
  type Projet,
} from './projets';

type Element = { id: string; maj: number };
export type PlanSync<T> = {
  aTelecharger: string[];
  aEnvoyer: T[];
  /** Effacés sur l'appareil : à effacer du compte. */
  aEffacer: string[];
  /** Déjà vus sur le compte, puis effacés depuis un autre appareil : à retirer de celui-ci. */
  aRetirer: string[];
};

/**
 * Ce qu'il faut télécharger, envoyer et effacer. Fonction pure (testée).
 * `vus` : identifiants présents sur le compte à la synchronisation précédente. Un élément local absent du compte est
 * nouveau s'il n'a jamais été vu (on l'envoie), effacé ailleurs s'il avait été vu (on le retire de l'appareil).
 */
export function planSync<T extends Element>(
  locaux: T[],
  distants: Element[],
  supprimes: string[],
  vus: string[] = [],
): PlanSync<T> {
  const parId = new Map(locaux.map((l) => [l.id, l]));
  const distantParId = new Map(distants.map((d) => [d.id, d]));
  const effaceAilleurs = (l: T) => !distantParId.has(l.id) && vus.includes(l.id);
  return {
    aTelecharger: distants
      .filter((d) => !supprimes.includes(d.id))
      .filter((d) => {
        const l = parId.get(d.id);
        return !l || d.maj > l.maj;
      })
      .map((d) => d.id),
    aEnvoyer: locaux.filter((l) => {
      const d = distantParId.get(l.id);
      return d ? l.maj > d.maj : !effaceAilleurs(l);
    }),
    aEffacer: supprimes.filter((id) => distantParId.has(id)),
    aRetirer: locaux.filter(effaceAilleurs).map((l) => l.id),
  };
}

/** Remplace ou ajoute les éléments reçus du compte, puis trie du plus récent au plus ancien. */
export function fusionnerRecus<T extends Element>(locaux: T[], recus: T[]): T[] {
  const parId = new Map(locaux.map((l) => [l.id, l]));
  for (const r of recus) {
    const l = parId.get(r.id);
    if (!l || r.maj > l.maj) parId.set(r.id, r);
  }
  return [...parId.values()].sort((a, b) => b.maj - a.maj);
}

/** Liste des identifiants vus sur le compte, propre à chaque compte (changer de compte ne retire rien). */
const cleDesVus = (table: string, userId: string) => `six-sync-vus-${table}-${userId}`;

async function synchroniserTable<T extends Element>(
  sb: SupabaseClient,
  userId: string,
  table: 'projets' | 'artefacts',
  options: {
    lire: () => T[];
    ecrire: (l: T[]) => boolean;
    curer: (o: unknown) => T | null;
    cleSuppressions: string;
    colonnes?: (e: T) => Record<string, unknown>;
  },
): Promise<void> {
  const { data, error } = await sb.from(table).select('id, maj').eq('user_id', userId);
  if (error) return; // hors-ligne ou table absente : on réessaiera plus tard
  const distants = ((data ?? []) as { id: string; maj: number | string }[]).map((d) => ({
    id: d.id,
    maj: Number(d.maj),
  }));
  const supprimes = lireSuppressions(options.cleSuppressions);
  const cleVus = cleDesVus(table, userId);
  const plan = planSync(options.lire(), distants, supprimes, lireSuppressions(cleVus));

  if (plan.aRetirer.length)
    options.ecrire(options.lire().filter((l) => !plan.aRetirer.includes(l.id)));

  if (plan.aEffacer.length) {
    const { error: e } = await sb
      .from(table)
      .delete()
      .eq('user_id', userId)
      .in('id', plan.aEffacer);
    if (!e) oublierSuppressions(options.cleSuppressions, plan.aEffacer);
  } else if (supprimes.length) {
    // Déjà absents du compte : rien à reporter.
    oublierSuppressions(options.cleSuppressions, supprimes);
  }

  if (plan.aTelecharger.length) {
    const { data: lignes, error: e } = await sb
      .from(table)
      .select('donnees')
      .eq('user_id', userId)
      .in('id', plan.aTelecharger);
    if (!e) {
      const recus = ((lignes ?? []) as { donnees: unknown }[])
        .map((l) => options.curer(l.donnees))
        .filter((x): x is T => x !== null);
      if (recus.length) options.ecrire(fusionnerRecus(options.lire(), recus));
    }
  }

  let envoyes: string[] = [];
  if (plan.aEnvoyer.length) {
    const { error: e } = await sb.from(table).upsert(
      plan.aEnvoyer.map((x) => ({
        user_id: userId,
        id: x.id,
        donnees: x,
        maj: x.maj,
        ...(options.colonnes?.(x) ?? {}),
      })),
    );
    if (!e) envoyes = plan.aEnvoyer.map((x) => x.id);
  }

  // Ce que le compte contient maintenant : la prochaine fois, un absent de cette liste sera nouveau.
  const vus = new Set([...distants.map((d) => d.id), ...envoyes]);
  for (const id of plan.aEffacer) vus.delete(id);
  try {
    localStorage.setItem(cleVus, JSON.stringify([...vus].slice(-200)));
  } catch {
    /* stockage bloqué */
  }
}

/** Fusionne les projets (et, mémoire active, les artefacts) de l'appareil avec ceux du compte. */
export async function synchroniserProjets(sb: SupabaseClient, userId: string): Promise<void> {
  await synchroniserTable<Projet>(sb, userId, 'projets', {
    lire: lireProjets,
    ecrire: ecrireProjets,
    curer: curerProjet,
    cleSuppressions: SUPPRESSIONS_PROJETS,
  });
  if (!memoireActive()) return; // mémoire coupée : les artefacts ne sont pas gardés, rien à copier
  await synchroniserTable<Artefact>(sb, userId, 'artefacts', {
    lire: lireArtefacts,
    ecrire: ecrireArtefacts,
    curer: curerArtefact,
    cleSuppressions: SUPPRESSIONS_ARTEFACTS,
    colonnes: (a) => ({ projet_id: a.projet ?? null }),
  });
}

/** Autorisation retirée ou compte oublié : la copie du compte est effacée, l'appareil garde tout. */
export async function effacerProjetsDuCompte(sb: SupabaseClient, userId: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    sb.from('projets').delete().eq('user_id', userId),
    sb.from('artefacts').delete().eq('user_id', userId),
  ]);
  // Tables pas encore créées sur le serveur : il n'y a rien à effacer.
  const absente = (e: { code?: string } | null) =>
    !e || e.code === '42P01' || e.code === 'PGRST205';
  try {
    // La copie du compte n'existe plus : rien de l'appareil ne doit passer pour « effacé ailleurs » ensuite.
    localStorage.removeItem(cleDesVus('projets', userId));
    localStorage.removeItem(cleDesVus('artefacts', userId));
  } catch {
    /* stockage bloqué */
  }
  return absente(a.error) && absente(b.error);
}
