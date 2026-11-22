/**
 * Client MaishaPay (https://docs.maishapay.net), côté serveur uniquement : les clés publique et secrète
 * partent dans le corps des requêtes vers MaishaPay, elles ne doivent jamais arriver dans le navigateur.
 *
 * Règle de sécurité : on ne croit JAMAIS une notification ou une redirection. Le statut d'un paiement vient
 * toujours d'une vérification faite par le serveur (verifierTransaction), avec notre propre référence.
 */

const BASE = 'https://marchand.maishapay.online/api';
const env = (nom: string): string => (process.env[nom] ?? '').trim();

export class MaishaPayError extends Error {}

export type Operateur = 'airtel' | 'orange' | 'mpesa' | 'afrimoney';

/** Nom de chaque opérateur attendu par MaishaPay (champ paymentChannel.provider). À confirmer en mode test. */
export const FOURNISSEURS: Record<Operateur, string> = {
  airtel: 'AIRTEL',
  orange: 'ORANGE',
  mpesa: 'MPESA',
  afrimoney: 'AFRICELL',
};

export function maishapayDisponible(): boolean {
  return Boolean(env('MAISHAPAY_PUBLIC_KEY') && env('MAISHAPAY_SECRET_KEY'));
}

function identifiants() {
  return {
    // 1 : production (vrai argent) ; 0 : mode test de MaishaPay. Test par défaut, par prudence.
    gatewayMode: env('MAISHAPAY_MODE') === '1' ? '1' : '0',
    publicApiKey: env('MAISHAPAY_PUBLIC_KEY'),
    secretApiKey: env('MAISHAPAY_SECRET_KEY'),
  };
}

/** Montant tel que MaishaPay l'attend : en unités (défaut) ou en centimes si MAISHAPAY_MONTANT_CENTIMES=1. */
export function montantMaishaPay(montant: number): string {
  return env('MAISHAPAY_MONTANT_CENTIMES') === '1'
    ? String(Math.round(montant * 100))
    : String(montant);
}

async function appeler(chemin: string, corps: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${chemin}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(corps),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new MaishaPayError('MaishaPay ne répond pas. Réessaie dans un instant.');
  }
  const texte = await res.text();
  let d: unknown = null;
  try {
    d = texte ? JSON.parse(texte) : null;
  } catch {
    /* réponse non JSON */
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    // Journal technique : code HTTP seulement, jamais les clés ni le corps envoyé.
    console.error(`[maishapay] ${chemin} : réponse illisible (HTTP ${res.status})`);
    throw new MaishaPayError('Le paiement n’a pas pu être lancé. Réessaie dans un instant.');
  }
  if (!res.ok) {
    console.error(`[maishapay] ${chemin} : HTTP ${res.status}`);
    throw new MaishaPayError('Le paiement a été refusé par MaishaPay. Vérifie tes informations.');
  }
  return d as Record<string, unknown>;
}

function donnees(r: Record<string, unknown>): Record<string, unknown> {
  const d = r.data;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : r;
}

function texte(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

export type Commande = {
  reference: string;
  montant: number;
  devise: string;
  email: string;
  prenom: string;
  nom: string;
  callbackUrl: string;
};

/** Invite USSD sur le téléphone du client. Le paiement reste en attente jusqu'à sa confirmation. */
export async function initierMobile(
  c: Commande & { operateur: Operateur; telephone: string },
): Promise<{ maishapayId: string | null }> {
  const r = await appeler('/collect/v2/store/mobileMoney', {
    transactionReference: c.reference,
    ...identifiants(),
    order: {
      amount: montantMaishaPay(c.montant),
      currency: c.devise,
      customerFullName: `${c.prenom} ${c.nom}`.trim() || 'Client Six',
      customerEmailAdress: c.email,
    },
    paymentChannel: {
      channel: 'MOBILEMONEY',
      provider: FOURNISSEURS[c.operateur],
      walletID: c.telephone,
      callbackUrl: c.callbackUrl,
    },
  });
  if (statutDepuisReponse(r) === 'ECHOUE')
    throw new MaishaPayError('Le paiement a été refusé. Vérifie le numéro et l’opérateur.');
  const d = donnees(r);
  return { maishapayId: texte(d.transactionId) ?? texte(d.transaction_id) };
}

/** Session de paiement par carte (Visa, Mastercard) : renvoie la page MaishaPay où le client paie. */
export async function initierCarte(
  c: Commande & {
    reseau: 'VISA' | 'MASTERCARD';
    telephone: string;
    ville: string;
  },
): Promise<{ maishapayId: string | null; pagePaiement: string }> {
  const r = await appeler('/collect/v3/store/card', {
    transactionReference: c.reference,
    ...identifiants(),
    order: {
      amount: montantMaishaPay(c.montant),
      currency: c.devise,
      customerFirstname: c.prenom,
      customerLastname: c.nom,
      customerAddress: c.ville,
      customerCity: c.ville,
      customerPhoneNumber: c.telephone,
      customerEmailAdress: c.email,
    },
    paymentChannel: { channel: 'CARD', provider: c.reseau, callbackUrl: c.callbackUrl },
  });
  const d = donnees(r);
  const page = texte(d.paymentPage);
  if (!page || !page.startsWith('https://')) {
    console.error('[maishapay] carte : pas de page de paiement dans la réponse');
    throw new MaishaPayError('Le paiement par carte n’a pas pu être lancé. Réessaie.');
  }
  return { maishapayId: texte(d.transactionId), pagePaiement: page };
}

const REUSSIS = new Set(['SUCCESS', 'SUCCESSFUL', 'SUCCEEDED', 'APPROVED', 'COMPLETED', 'PAID']);
const ECHECS = new Set([
  'FAILED',
  'FAILURE',
  'DECLINED',
  'CANCELED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
  'ERROR',
]);

/** Lit le statut du paiement dans une réponse MaishaPay (le statut de la requête elle-même est ignoré). */
export function statutDepuisReponse(
  r: Record<string, unknown>,
): 'REUSSI' | 'ECHOUE' | 'EN_ATTENTE' {
  const d = donnees(r);
  const brut =
    texte(d.transactionStatus) ??
    texte(d.payment_status) ??
    texte(d.paymentStatus) ??
    texte(d.transaction_status) ??
    (d !== r ? texte(d.status) : null);
  const s = (brut ?? '').toUpperCase().replace(/\s+/g, '');
  if (REUSSIS.has(s)) return 'REUSSI';
  if (ECHECS.has(s)) return 'ECHOUE';
  return 'EN_ATTENTE';
}

/** Demande à MaishaPay le statut réel d'un paiement, par notre référence. */
export async function verifierTransaction(
  reference: string,
): Promise<'REUSSI' | 'ECHOUE' | 'EN_ATTENTE'> {
  const r = await appeler('/transaction/rest/v2/check?useRef=1', {
    ...identifiants(),
    gatewayMode: Number(identifiants().gatewayMode),
    transactionId: reference,
  });
  return statutDepuisReponse(r);
}
