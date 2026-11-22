import { supabase } from './supabase';

/**
 * Côté app : prouver au serveur qui appelle (jeton de session Supabase), et lire l'état du premium.
 * Le jeton ne contient aucune conversation ; il permet seulement au serveur de reconnaître le compte.
 */

/** En-tête Authorization avec le jeton de la session, ou rien en mode invité. */
export async function entetesCompte(): Promise<Record<string, string>> {
  try {
    const sb = await supabase();
    const jeton = sb ? (await sb.auth.getSession()).data.session?.access_token : undefined;
    return jeton ? { authorization: `Bearer ${jeton}` } : {};
  } catch {
    return {};
  }
}

export type OffrePremium = { id: '7j' | '30j'; jours: number; montant: number; devise: string };

export type EtatPremium = {
  connecte: boolean;
  premium: boolean;
  jusquA: string | null;
  offres: OffrePremium[];
  limites: { analyses: number; messages: number };
  paiementDisponible: boolean;
  /** Paiement pas encore ouvert : pas de limites, l'entrée Six Premium est cachée. */
  veille: boolean;
};

export async function lireEtatPremium(): Promise<EtatPremium | null> {
  try {
    const res = await fetch('/api/premium', { headers: await entetesCompte(), cache: 'no-store' });
    return res.ok ? ((await res.json()) as EtatPremium) : null;
  } catch {
    return null;
  }
}

/** Dans l'app Android ou iOS, on n'affiche pas d'achat : le paiement se fait sur le site (règles des stores). */
export async function dansAppNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function prix(o: OffrePremium): string {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: o.devise,
      maximumFractionDigits: o.devise === 'CDF' ? 0 : 2,
    }).format(o.montant);
  } catch {
    return `${o.montant} ${o.devise}`;
  }
}

export function dateFin(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
