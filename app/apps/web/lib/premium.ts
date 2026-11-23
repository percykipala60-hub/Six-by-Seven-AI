import { clientKey } from './http';
import { achatsAppleDisponibles } from './achat-apple';
import {
  adminDisponible,
  finPremium,
  utilisateurDeRequete,
  type Utilisateur,
} from './supabase-serveur';

/**
 * Six Premium : un pass de 7 ou 30 jours, acheté par achat intégré Apple dans l'app iPhone (lib/achat-apple.ts).
 * Le premium lève les limites du jour, rédige avec le meilleur modèle et permet de copier sa mémoire sur le compte.
 */

const env = (nom: string): string => (process.env[nom] ?? '').trim();
const nombre = (nom: string, defaut: number): number => {
  const n = Number(env(nom));
  return env(nom) && Number.isFinite(n) && n >= 0 ? n : defaut;
};

export type OffreId = '7j' | '30j';
export type Offre = { id: OffreId; jours: number; montant: number; devise: string };

/** Prix réglables dans l'environnement du serveur (PREMIUM_PRIX_7J, PREMIUM_PRIX_30J, PREMIUM_DEVISE). */
export function offres(): Offre[] {
  const devise = env('PREMIUM_DEVISE').toUpperCase() || 'USD';
  return [
    { id: '7j', jours: 7, montant: nombre('PREMIUM_PRIX_7J', 3), devise },
    { id: '30j', jours: 30, montant: nombre('PREMIUM_PRIX_30J', 7), devise },
  ];
}

export function offre(id: unknown): Offre | null {
  return offres().find((o) => o.id === id) ?? null;
}

/** Limites gratuites par jour (0 = pas de limite). */
export function limitesGratuites() {
  return {
    analyses: nombre('GRATUIT_ANALYSES_JOUR', 5),
    messages: nombre('GRATUIT_MESSAGES_SEVEN_JOUR', 20),
  };
}

export const MESSAGE_LIMITE = {
  analyses:
    "Tu as utilisé tes analyses gratuites d'aujourd'hui. Passe à Six Premium (Réglages > Six Premium) ou reviens demain.",
  messages:
    "Tu as utilisé tes messages gratuits avec Six pour aujourd'hui. Passe à Six Premium (Réglages > Six Premium) ou reviens demain.",
};

/** Un moyen de paiement est ouvert : les achats intégrés Apple (app iPhone) et la clé secrète Supabase. */
export function paiementDisponible(): boolean {
  return adminDisponible() && achatsAppleDisponibles();
}

/** Achats intégrés Apple ouverts (app iPhone seulement). */
export function appleOuvert(): boolean {
  return adminDisponible() && achatsAppleDisponibles();
}

/**
 * Premium en veille : tant qu'aucun paiement n'est configuré sur le serveur (achats Apple et clé secrète
 * Supabase), personne ne peut payer. On ne limite alors personne : pas de limites du jour, meilleur modèle pour
 * tous, et l'entrée Six Premium est cachée dans l'app. Voir docs/premium.md pour le lancement.
 */
export function premiumEnVeille(): boolean {
  return !paiementDisponible();
}

export type Appelant = {
  utilisateur: Utilisateur | null;
  premium: boolean;
  jusquA: Date | null;
  /** Pas de limites et meilleur modèle : premium actif, ou premium en veille (personne ne peut payer). */
  illimite: boolean;
  /** Clé des compteurs du jour : le compte s'il est connecté, sinon l'adresse. */
  cle: string;
};

/** Qui appelle, et a-t-il le premium ? Une panne de Supabase compte comme « pas de premium ». */
export async function appelant(req: Request): Promise<Appelant> {
  const utilisateur = await utilisateurDeRequete(req);
  let jusquA: Date | null = null;
  if (utilisateur && adminDisponible()) {
    try {
      jusquA = await finPremium(utilisateur.id);
    } catch {
      console.error('[premium] lecture du premium impossible');
    }
  }
  const premium = Boolean(jusquA && jusquA.getTime() > Date.now());
  return {
    utilisateur,
    jusquA,
    premium,
    illimite: premium || premiumEnVeille(),
    cle: utilisateur ? `u:${utilisateur.id}` : `ip:${clientKey(req)}`,
  };
}
