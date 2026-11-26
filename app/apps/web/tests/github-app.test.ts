import { createVerify, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

function reglages() {
  vi.stubEnv('GITHUB_APP_ID', '5929181');
  vi.stubEnv('GITHUB_APP_CLIENT_ID', 'Iv23test');
  vi.stubEnv('GITHUB_APP_CLIENT_SECRET', 'secret-de-test-assez-long');
  vi.stubEnv('GITHUB_APP_PRIVATE_KEY_B64', Buffer.from(pem).toString('base64'));
}
afterEach(() => vi.unstubAllEnvs());

describe('application GitHub « Six by Seven »', () => {
  it('signe son jeton avec sa clé privée (RS256, 9 minutes, émetteur = App ID)', async () => {
    reglages();
    const { jetonApplication } = await import('@/lib/github-app');
    const jeton = jetonApplication(1_800_000_000);
    const [h, p, s] = jeton.split('.');
    const charge = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;
    expect(charge).toEqual({ iat: 1_799_999_940, exp: 1_800_000_540, iss: '5929181' });
    const ok = createVerify('RSA-SHA256')
      .update(`${h}.${p}`)
      .verify(publicKey, Buffer.from(s, 'base64url'));
    expect(ok).toBe(true);
  });

  it('l’état du retour est lié au compte, expire après 30 minutes et ne se falsifie pas', async () => {
    reglages();
    const { etatSigne, etatValide } = await import('@/lib/github-app');
    const t = 1_800_000_000_000;
    const etat = etatSigne('compte-a', t);
    expect(etatValide(etat, 'compte-a', t + 60_000)).toBe(true);
    expect(etatValide(etat, 'compte-b', t + 60_000)).toBe(false);
    expect(etatValide(etat, 'compte-a', t + 31 * 60_000)).toBe(false);
    expect(etatValide(`compte-a.${t}.faux`, 'compte-a', t)).toBe(false);
    expect(etatValide('', 'compte-a', t)).toBe(false);
  });

  it('l’adresse d’installation passe par l’application', async () => {
    reglages();
    vi.stubEnv('GITHUB_APP_SLUG', 'six-by-seven');
    const { adresseInstallation } = await import('@/lib/github-app');
    expect(adresseInstallation('a.b.c')).toBe(
      'https://github.com/apps/six-by-seven/installations/new?state=a.b.c',
    );
  });
});
