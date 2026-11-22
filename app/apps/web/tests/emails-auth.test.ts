import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIMITE_HEURE,
  LIMITE_JOUR,
  composerEmail,
  limiteAtteinte,
  oublierEnvois,
  signatureValide,
} from '@/lib/emails-auth';

describe('limite d’e-mails par personne', () => {
  beforeEach(() => oublierEnvois());

  it('bloque au-delà de la limite horaire pour une même adresse, pas pour une autre', () => {
    const t = 1_800_000_000_000;
    for (let i = 0; i < LIMITE_HEURE; i++)
      expect(limiteAtteinte('A@exemple.com', t + i)).toBe(false);
    expect(limiteAtteinte('a@exemple.com', t + 10)).toBe(true);
    expect(limiteAtteinte('b@exemple.com', t + 10)).toBe(false);
  });

  it('libère après une heure, mais garde la limite du jour', () => {
    const t = 1_800_000_000_000;
    const heure = 3_600_000;
    for (let i = 0; i < LIMITE_HEURE; i++) limiteAtteinte('c@exemple.com', t);
    expect(limiteAtteinte('c@exemple.com', t + heure + 1)).toBe(false);
    for (let i = 1; i < LIMITE_JOUR - LIMITE_HEURE; i++)
      limiteAtteinte('c@exemple.com', t + 2 * heure + i);
    expect(limiteAtteinte('c@exemple.com', t + 5 * heure)).toBe(true);
    expect(limiteAtteinte('c@exemple.com', t + 25 * heure)).toBe(false);
  });
});

describe('signature du hook Supabase', () => {
  const brut = Buffer.from('cle-de-test-pour-six-1234567890').toString('base64');
  const secret = `v1,whsec_${brut}`;
  const signer = (corps: string, id: string, ts: string) =>
    'v1,' +
    createHmac('sha256', Buffer.from(brut, 'base64'))
      .update(`${id}.${ts}.${corps}`)
      .digest('base64');

  it('accepte une signature correcte et récente', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const corps = '{"a":1}';
    expect(
      signatureValide(
        corps,
        { id: 'msg_1', horodatage: ts, signature: signer(corps, 'msg_1', ts) },
        secret,
      ),
    ).toBe(true);
  });

  it('refuse un corps modifié, une signature absente ou trop ancienne', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signer('{"a":1}', 'msg_1', ts);
    expect(
      signatureValide('{"a":2}', { id: 'msg_1', horodatage: ts, signature: sig }, secret),
    ).toBe(false);
    expect(
      signatureValide('{"a":1}', { id: 'msg_1', horodatage: ts, signature: null }, secret),
    ).toBe(false);
    const vieux = String(Math.floor(Date.now() / 1000) - 3600);
    expect(
      signatureValide(
        '{"a":1}',
        { id: 'msg_1', horodatage: vieux, signature: signer('{"a":1}', 'msg_1', vieux) },
        secret,
      ),
    ).toBe(false);
  });
});

describe('contenu des e-mails', () => {
  const base = { token: '123456', token_hash: 'h', redirect_to: '', site_url: '' };

  it('met le code à 6 chiffres et aucun lien dans les e-mails de code', () => {
    for (const type of ['signup', 'magiclink', 'reauthentication'] as const) {
      const e = composerEmail({ ...base, email_action_type: type }, 'https://x.supabase.co');
      expect(e?.html).toContain('123456');
      expect(e?.html).not.toContain('href=');
    }
  });

  it('donne un lien de réinitialisation et refuse les types inutilisés', () => {
    const r = composerEmail({ ...base, email_action_type: 'recovery' }, 'https://x.supabase.co');
    expect(r?.html).toContain('https://x.supabase.co/auth/v1/verify?token=h&#38;type=recovery');
    expect(
      composerEmail({ ...base, email_action_type: 'invite' }, 'https://x.supabase.co'),
    ).toBeNull();
  });
});
