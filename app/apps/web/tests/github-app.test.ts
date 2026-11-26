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
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

  it('commence par l’autorisation de la personne (comme Claude)', async () => {
    reglages();
    const { adresseAutorisation } = await import('@/lib/github-app');
    expect(adresseAutorisation('a.b.c')).toBe(
      'https://github.com/login/oauth/authorize?client_id=Iv23test&state=a.b.c',
    );
  });

  function github(installations: { id: number; account: { login: string } }[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const corps = url.endsWith('/access_token')
          ? { access_token: 'jeton-personne' }
          : url.endsWith('/user')
            ? { login: 'percy' }
            : { installations };
        return new Response(JSON.stringify(corps), { status: 200 });
      }),
    );
  }

  it('relie l’installation déjà faite, sinon demande d’installer', async () => {
    reglages();
    const { installationDe } = await import('@/lib/github-app');
    github([
      { id: 11, account: { login: 'une-organisation' } },
      { id: 22, account: { login: 'percy' } },
    ]);
    expect(await installationDe('code-de-test')).toEqual({ login: 'percy', installation: 22 });
    github([]);
    expect(await installationDe('code-de-test')).toEqual({ login: 'percy', installation: null });
  });

  it('refuse une installation annoncée qui n’est pas à la personne', async () => {
    reglages();
    const { installationDe } = await import('@/lib/github-app');
    github([{ id: 22, account: { login: 'percy' } }]);
    await expect(installationDe('code-de-test', 99)).rejects.toThrow(/n’appartient pas/);
    expect(await installationDe('code-de-test', 22)).toEqual({ login: 'percy', installation: 22 });
  });
});
