import { X509Certificate, verify } from 'node:crypto';
import type { OffreId } from './premium';

/**
 * Achats intégrés Apple (app iPhone) : vérification, sur le serveur, de la transaction signée par l'App Store
 * (JWS « signedTransaction » renvoyé par StoreKit 2). La signature est vérifiée jusqu'au certificat racine
 * d'Apple (Apple Root CA - G3, ci-dessous) : un appareil ne peut pas inventer un achat.
 */

/** https://www.apple.com/certificateauthority/AppleRootCA-G3.cer (SHA-256 63:34:3A:…:91:79, valable jusqu'en 2039). */
const RACINE_APPLE_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

export const BUNDLE_ID_APPLE = 'com.sevenai.six';

/** Produits à créer dans App Store Connect (abonnements non renouvelables), avec l'offre qu'ils activent. */
export const PRODUITS_APPLE: Record<string, OffreId> = {
  'com.sevenai.six.premium.7j': '7j',
  'com.sevenai.six.premium.30j': '30j',
};

/** Extension que porte le certificat de signature des achats (1.2.840.113635.100.6.11.1), encodée en DER. */
const OID_FEUILLE = Buffer.from('060a2a864886f763640b01', 'hex');
/** Extension du certificat intermédiaire d'Apple (1.2.840.113635.100.6.2.1). */
const OID_INTERMEDIAIRE = Buffer.from('060a2a864886f76364060201', 'hex');

export type TransactionApple = {
  transactionId: string;
  originalTransactionId?: string;
  bundleId: string;
  productId: string;
  appAccountToken?: string;
  environment: string;
  purchaseDate?: number;
  signedDate?: number;
  revocationDate?: number;
  /** Prix payé en millièmes de la devise (ex. 2990 = 2,99). */
  price?: number;
  currency?: string;
};

export class AchatAppleInvalide extends Error {}

function json(partie: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(Buffer.from(partie, 'base64url').toString('utf8'));
    if (v && typeof v === 'object') return v as Record<string, unknown>;
  } catch {
    /* illisible */
  }
  throw new AchatAppleInvalide('Transaction illisible.');
}

function valableLe(c: X509Certificate, date: Date): boolean {
  return new Date(c.validFrom) <= date && date <= new Date(c.validTo);
}

/**
 * Vérifie la signature d'une transaction StoreKit 2 et renvoie son contenu.
 * `racine` ne sert qu'aux tests : en production, c'est toujours le certificat racine d'Apple.
 */
export function verifierTransactionApple(
  jws: string,
  racine: string = RACINE_APPLE_G3,
): TransactionApple {
  const parties = jws.split('.');
  if (parties.length !== 3 || parties.some((p) => !p))
    throw new AchatAppleInvalide('Transaction illisible.');
  const [h, p, s] = parties as [string, string, string];
  const entete = json(h);
  if (entete.alg !== 'ES256') throw new AchatAppleInvalide('Signature inattendue.');
  const x5c = entete.x5c;
  if (
    !Array.isArray(x5c) ||
    x5c.length < 2 ||
    x5c.length > 4 ||
    x5c.some((c) => typeof c !== 'string')
  )
    throw new AchatAppleInvalide('Chaîne de certificats absente.');

  let chaine: X509Certificate[];
  let ancre: X509Certificate;
  try {
    chaine = (x5c as string[]).map((c) => new X509Certificate(Buffer.from(c, 'base64')));
    ancre = new X509Certificate(racine);
  } catch {
    throw new AchatAppleInvalide('Certificat illisible.');
  }

  // La chaîne doit remonter jusqu'à la racine d'Apple (incluse ou non dans x5c).
  if (chaine.at(-1)?.fingerprint256 !== ancre.fingerprint256) chaine.push(ancre);
  for (const [i, enfant] of chaine.entries()) {
    const parent = chaine[i + 1];
    if (!parent) break; // la racine, dernière de la chaîne
    if (!enfant.checkIssued(parent) || !enfant.verify(parent.publicKey))
      throw new AchatAppleInvalide('Chaîne de certificats non reconnue.');
  }

  const [feuille, intermediaire] = chaine;
  if (!feuille || !intermediaire) throw new AchatAppleInvalide('Chaîne de certificats absente.');
  if (racine === RACINE_APPLE_G3) {
    if (!feuille.raw.includes(OID_FEUILLE) || !intermediaire.raw.includes(OID_INTERMEDIAIRE))
      throw new AchatAppleInvalide('Certificat qui n’est pas celui des achats Apple.');
  }

  const ok = verify(
    'sha256',
    Buffer.from(`${h}.${p}`),
    { key: feuille.publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(s, 'base64url'),
  );
  if (!ok) throw new AchatAppleInvalide('Signature invalide.');

  const contenu = json(p) as Partial<TransactionApple>;
  // Les certificats sont contrôlés à la date de signature de la transaction (recommandation d'Apple).
  const signee = new Date(typeof contenu.signedDate === 'number' ? contenu.signedDate : Date.now());
  if (!chaine.every((c) => valableLe(c, signee)))
    throw new AchatAppleInvalide('Certificat expiré.');
  if (typeof contenu.transactionId !== 'string' || typeof contenu.productId !== 'string')
    throw new AchatAppleInvalide('Transaction incomplète.');
  return contenu as TransactionApple;
}

export type Controle =
  { ok: true; offre: OffreId } | { ok: false; raison: string; statut: 400 | 403 | 409 };

/** La transaction vérifiée peut-elle activer le premium de ce compte ? */
export function controlerTransactionApple(
  t: TransactionApple,
  options: { userId: string; sandboxAccepte: boolean },
): Controle {
  if (t.bundleId !== BUNDLE_ID_APPLE)
    return { ok: false, raison: 'Cet achat ne vient pas de l’app Six.', statut: 400 };
  const offre = PRODUITS_APPLE[t.productId];
  if (!offre) return { ok: false, raison: 'Ce produit n’existe pas.', statut: 400 };
  if (t.revocationDate) return { ok: false, raison: 'Cet achat a été remboursé.', statut: 409 };
  if (t.environment !== 'Production' && !(t.environment === 'Sandbox' && options.sandboxAccepte))
    return { ok: false, raison: 'Achat de test refusé.', statut: 403 };
  if (!t.appAccountToken || t.appAccountToken.toLowerCase() !== options.userId.toLowerCase())
    return { ok: false, raison: 'Cet achat appartient à un autre compte.', statut: 409 };
  return { ok: true, offre };
}

const env = (nom: string): string => (process.env[nom] ?? '').trim().toLowerCase();

/** Achats Apple ouverts (APPLE_ACHATS=oui), une fois les produits créés et le contrat Apple signé. */
export function achatsAppleDisponibles(): boolean {
  return env('APPLE_ACHATS') === 'oui';
}

/** Achats de test (TestFlight, comptes Sandbox) acceptés : APPLE_ACHATS_SANDBOX=oui, pendant les essais. */
export function sandboxAppleAccepte(): boolean {
  return env('APPLE_ACHATS_SANDBOX') === 'oui';
}

/** Référence du paiement en base pour une transaction Apple (une seule activation par transaction). */
export function referenceApple(transactionId: string): string {
  return `APPLE-${transactionId}`;
}
