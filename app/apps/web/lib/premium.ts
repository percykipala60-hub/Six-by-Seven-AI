import { clientKey } from './http';
import { achatsAppleDisponibles } from './achat-apple';
import { maishapayDisponible, verifierTransaction } from './maishapay';
import {
  activerPaiement,
  adminDisponible,
  finPremium,
  lirePaiement,
  majPaiement,
  utilisateurDeRequete,
  type Utilisateur,
} from './supabase-serveur';

/**
 * Six Premium : un pass de 7 ou 30 jours, payé avec MaishaPay (Mobile Money ou carte) sur le site, ou par achat
 * intégré Apple dans l'app iPhone (lib/achat-apple.ts).
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

/** Un moyen de paiement au moins est ouvert : MaishaPay (site) ou achats intégrés Apple (app iPhone). */
export function paiementDisponible(): boolean {
  return adminDisponible() && (maishapayDisponible() || achatsAppleDisponibles());
}

/** Paiement MaishaPay ouvert (site seulement). */
export function maishapayOuvert(): boolean {
  return adminDisponible() && maishapayDisponible();
}

/** Achats intégrés Apple ouverts (app iPhone seulement). */
export function appleOuvert(): boolean {
  return adminDisponible() && achatsAppleDisponibles();
}

/**
 * Premium en veille : tant qu'aucun paiement n'est configuré sur le serveur (MaishaPay ou Apple, et clé secrète
 * Supabase), personne ne peut payer. On ne limite alors personne : pas de limites du jour, meilleur modèle pour
 * tous, et l'entrée Six Premium est cachée dans l'app. Voir docs/premium.md pour le lancement.
 */
export function premiumEnVeille(): boolean {
  return !paiementDisponible();
}

/** Adresse publique de l'app, pour les retours de MaishaPay (jamais lue depuis la requête). */
export function urlPublique(): string {
  return (env('PREMIUM_URL_PUBLIQUE') || 'https://app.sixbysevenai.com').replace(/\/$/, '');
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

/**
 * Vérifie un paiement auprès de MaishaPay et active le premium s'il a réussi.
 * Peut être appelée plusieurs fois (notification, retour de carte, l'app qui demande) : le premium n'est
 * prolongé qu'une fois par paiement, grâce à la fonction SQL activer_paiement.
 */
export async function confirmerPaiement(
  reference: string,
): Promise<'REUSSI' | 'ECHOUE' | 'EN_ATTENTE' | 'INCONNU'> {
  const p = await lirePaiement(reference);
  if (!p) return 'INCONNU';
  if (p.statut !== 'EN_ATTENTE') return p.statut;
  const statut = await verifierTransaction(reference);
  if (statut === 'REUSSI') await activerPaiement(reference);
  else if (statut === 'ECHOUE') await majPaiement(reference, { statut: 'ECHOUE' });
  else if (Date.now() - new Date(p.cree).getTime() > 60 * 60_000) {
    // Toujours en attente après une heure : l'invite a expiré (15 min chez MaishaPay).
    await majPaiement(reference, { statut: 'ECHOUE' });
    return 'ECHOUE';
  }
  return statut;
}

/** Référence unique de paiement, envoyée à MaishaPay (64 caractères au plus). */
export function nouvelleReference(): string {
  const octets = crypto.getRandomValues(new Uint8Array(9));
  const alea = Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
  return `SIX-${Date.now().toString(36).toUpperCase()}-${alea.toUpperCase()}`;
}

export const REFERENCE_VALIDE = /^SIX-[A-Z0-9]{6,12}-[A-F0-9]{18}$/;
