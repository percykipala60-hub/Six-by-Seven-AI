import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrivateKey, sign, X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AchatAppleInvalide,
  controlerTransactionApple,
  referenceApple,
  verifierTransactionApple,
  type TransactionApple,
} from '@/lib/achat-apple';

// Chaîne de certificats de test (racine → intermédiaire → feuille), créée pour ces tests seulement :
// elle ne signe rien d'autre et n'a aucun lien avec Apple.
const dossier = join(__dirname, 'fixtures', 'apple');
const lire = (f: string) => readFileSync(join(dossier, f), 'utf8');
const racine = lire('racine.pem');
const der = (pem: string) => new X509Certificate(pem).raw.toString('base64');
const x5c = [der(lire('feuille.pem')), der(lire('inter.pem')), der(racine)];
const cle = createPrivateKey(lire('feuille-pkcs8.key'));

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function jws(
  contenu: Record<string, unknown>,
  entete: Record<string, unknown> = { alg: 'ES256', x5c },
) {
  const h = b64(entete);
  const p = b64(contenu);
  const s = sign('sha256', Buffer.from(`${h}.${p}`), { key: cle, dsaEncoding: 'ieee-p1363' });
  return `${h}.${p}.${s.toString('base64url')}`;
}

const USER = '3cf4fb4f-5add-4a21-b9e9-6a6db59edc4d';
const achat: TransactionApple = {
  transactionId: '2000000123456789',
  bundleId: 'com.sevenai.six',
  productId: 'com.sevenai.six.premium.7j',
  appAccountToken: USER,
  environment: 'Production',
  signedDate: Date.now(),
  price: 2990,
  currency: 'USD',
};

describe('verifierTransactionApple', () => {
  it('accepte une transaction signée par la chaîne attendue', () => {
    const t = verifierTransactionApple(jws({ ...achat }), racine);
    expect(t.transactionId).toBe(achat.transactionId);
    expect(t.productId).toBe(achat.productId);
  });

  it('accepte une chaîne qui s’arrête à l’intermédiaire (racine ajoutée par le serveur)', () => {
    const t = verifierTransactionApple(
      jws({ ...achat }, { alg: 'ES256', x5c: x5c.slice(0, 2) }),
      racine,
    );
    expect(t.transactionId).toBe(achat.transactionId);
  });

  it('refuse un contenu modifié après la signature', () => {
    const [h, , s] = jws({ ...achat }).split('.');
    const falsifie = `${h}.${b64({ ...achat, productId: 'com.sevenai.six.premium.30j' })}.${s}`;
    expect(() => verifierTransactionApple(falsifie, racine)).toThrow(AchatAppleInvalide);
  });

  it('refuse une transaction qui ne remonte pas à la racine d’Apple', () => {
    // Sans la racine de test : c'est la vraie racine d'Apple qui est attendue.
    expect(() => verifierTransactionApple(jws({ ...achat }))).toThrow(AchatAppleInvalide);
  });

  it('refuse les formats inattendus', () => {
    expect(() => verifierTransactionApple('pas.un.jws', racine)).toThrow(AchatAppleInvalide);
    expect(() => verifierTransactionApple('abc', racine)).toThrow(AchatAppleInvalide);
    expect(() =>
      verifierTransactionApple(jws({ ...achat }, { alg: 'HS256', x5c }), racine),
    ).toThrow(AchatAppleInvalide);
    expect(() => verifierTransactionApple(jws({ ...achat }, { alg: 'ES256' }), racine)).toThrow(
      AchatAppleInvalide,
    );
  });
});

describe('controlerTransactionApple', () => {
  const options = { userId: USER, sandboxAccepte: false };

  it('active la bonne offre pour le bon compte', () => {
    expect(controlerTransactionApple(achat, options)).toEqual({ ok: true, offre: '7j' });
    expect(
      controlerTransactionApple({ ...achat, productId: 'com.sevenai.six.premium.30j' }, options),
    ).toEqual({ ok: true, offre: '30j' });
  });

  it('refuse un autre compte, une autre app, un produit inconnu ou un remboursement', () => {
    expect(controlerTransactionApple({ ...achat, appAccountToken: undefined }, options).ok).toBe(
      false,
    );
    expect(
      controlerTransactionApple(
        { ...achat, appAccountToken: 'de9a9122-2fd6-43c7-ad6f-a4599f8334d5' },
        options,
      ).ok,
    ).toBe(false);
    expect(controlerTransactionApple({ ...achat, bundleId: 'org.autre.app' }, options).ok).toBe(
      false,
    );
    expect(controlerTransactionApple({ ...achat, productId: 'autre' }, options).ok).toBe(false);
    expect(controlerTransactionApple({ ...achat, revocationDate: Date.now() }, options).ok).toBe(
      false,
    );
  });

  it('n’accepte les achats de test (Sandbox, TestFlight) que si c’est autorisé', () => {
    const test = { ...achat, environment: 'Sandbox' };
    expect(controlerTransactionApple(test, options).ok).toBe(false);
    expect(controlerTransactionApple(test, { ...options, sandboxAccepte: true }).ok).toBe(true);
    expect(controlerTransactionApple({ ...achat, environment: 'Xcode' }, options).ok).toBe(false);
  });

  it('donne une référence stable par transaction', () => {
    expect(referenceApple('2000000123456789')).toBe('APPLE-2000000123456789');
  });
});
