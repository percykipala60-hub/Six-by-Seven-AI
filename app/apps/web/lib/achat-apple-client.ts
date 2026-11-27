import { supabase } from './supabase';
import { entetesCompte, type OffrePremium } from './premium-client';

/**
 * Achats intégrés Apple dans l'app iPhone (plugin natif SixAchat, ios/App/App/SceneDelegate.swift).
 * L'App Store encaisse ; le serveur (/api/premium/apple) vérifie la transaction signée puis active le premium.
 * Une transaction n'est terminée côté Apple qu'une fois le premium enregistré : rien n'est perdu en cas de coupure.
 */

/** Identifiants des produits dans App Store Connect (mêmes valeurs que lib/achat-apple.ts). */
export const PRODUIT_APPLE: Record<OffrePremium['id'], string> = {
  '7j': 'com.sevenai.six.premium.7j',
  '30j': 'com.sevenai.six.premium.30j',
};

type Transaction = { jws: string; transactionId: string };
type Natif = {
  produits(o: {
    ids: string[];
  }): Promise<{ produits: { id: string; titre: string; prix: string }[] }>;
  acheter(o: {
    id: string;
    compte: string;
  }): Promise<{ etat: 'achete' | 'annule' | 'attente'; jws?: string; transactionId?: string }>;
  transactions(o: { tous: boolean }): Promise<{ transactions: Transaction[] }>;
  terminer(o: { transactionId: string }): Promise<void>;
};

/**
 * Le plugin, seulement dans l'app iPhone qui l'embarque. Jamais l'objet registerPlugin lui-même depuis une
 * fonction async : c'est un Proxy qui répond à « then » et passerait pour une promesse sans fin.
 */
async function natif(): Promise<Natif | null> {
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return null;
    if (!Capacitor.isPluginAvailable('SixAchat')) return null;
    const p = registerPlugin<Natif>('SixAchat');
    return {
      produits: (o) => p.produits(o),
      acheter: (o) => p.acheter(o),
      transactions: (o) => p.transactions(o),
      terminer: (o) => p.terminer(o),
    };
  } catch {
    return null;
  }
}

export async function achatsAppleSurCetAppareil(): Promise<boolean> {
  return (await natif()) !== null;
}

/** Prix affichés par l'App Store, par offre (dans la devise du pays de l'Apple ID). */
export async function prixApple(): Promise<Partial<Record<OffrePremium['id'], string>>> {
  const n = await natif();
  if (!n) return {};
  try {
    const { produits } = await n.produits({ ids: Object.values(PRODUIT_APPLE) });
    const prix: Partial<Record<OffrePremium['id'], string>> = {};
    for (const [offre, id] of Object.entries(PRODUIT_APPLE) as [OffrePremium['id'], string][]) {
      const p = produits.find((x) => x.id === id);
      if (p) prix[offre] = p.prix;
    }
    return prix;
  } catch {
    return {};
  }
}

export type ResultatAchat =
  | { etat: 'actif'; jusquA: string | null }
  | { etat: 'annule' | 'attente' }
  | { etat: 'erreur'; message: string };

/** Envoie une transaction au serveur ; la termine côté Apple seulement si le premium est enregistré. */
async function livrer(n: Natif, t: Transaction): Promise<ResultatAchat> {
  const res = await fetch('/api/premium/apple', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
    body: JSON.stringify({ jws: t.jws }),
  });
  const d = (await res.json().catch(() => ({}))) as { jusquA?: string | null; error?: string };
  // Achat refusé pour de bon (autre compte, remboursé, produit inconnu) : inutile de le redonner sans fin.
  if (res.ok || res.status === 409 || res.status === 400)
    await n.terminer({ transactionId: t.transactionId });
  if (!res.ok) return { etat: 'erreur', message: d.error ?? 'L’achat n’a pas pu être enregistré.' };
  return { etat: 'actif', jusquA: d.jusquA ?? null };
}

async function idCompte(): Promise<string | null> {
  try {
    const sb = await supabase();
    return sb ? ((await sb.auth.getSession()).data.session?.user.id ?? null) : null;
  } catch {
    return null;
  }
}

export async function acheterApple(offre: OffrePremium['id']): Promise<ResultatAchat> {
  const n = await natif();
  if (!n)
    return { etat: 'erreur', message: 'L’achat n’est possible que dans l’app iPhone à jour.' };
  const compte = await idCompte();
  if (!compte) return { etat: 'erreur', message: 'Connectez-vous pour passer à Six Premium.' };
  try {
    const r = await n.acheter({ id: PRODUIT_APPLE[offre], compte });
    if (r.etat !== 'achete' || !r.jws || !r.transactionId)
      return { etat: r.etat === 'attente' ? 'attente' : 'annule' };
    return await livrer(n, { jws: r.jws, transactionId: r.transactionId });
  } catch (e) {
    return { etat: 'erreur', message: e instanceof Error ? e.message : 'L’achat n’a pas abouti.' };
  }
}

/**
 * Redonne au serveur les achats pas encore livrés (coupure réseau pendant l'achat), ou tout l'historique avec
 * `tous` (« Restaurer mes achats »). Le serveur n'active chaque achat qu'une fois : rien n'est compté deux fois.
 */
export async function synchroniserAchatsApple(tous = false): Promise<ResultatAchat | null> {
  const n = await natif();
  if (!n || !(await idCompte())) return null;
  try {
    const { transactions } = await n.transactions({ tous });
    let dernier: ResultatAchat | null = null;
    for (const t of transactions) dernier = await livrer(n, t);
    return dernier;
  } catch {
    return null;
  }
}
