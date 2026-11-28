import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

export const gmailRetour = process.env.GMAIL_REDIRECT_URI || '';
const client = process.env.GMAIL_CLIENT_ID || '';
const secret = process.env.GMAIL_CLIENT_SECRET || '';
const cle = Buffer.from(process.env.GMAIL_ENCRYPTION_KEY || '', 'base64');
export const gmailConfigure = Boolean(client && secret && gmailRetour && cle.length === 32);
const scope = 'https://www.googleapis.com/auth/gmail.labels';

export function sceller(texte: string, contexte: string) {
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', cle, iv);
  c.setAAD(Buffer.from(contexte));
  return Buffer.concat([iv, c.update(texte, 'utf8'), c.final(), c.getAuthTag()]).toString(
    'base64url',
  );
}
export function ouvrir(valeur: string, contexte: string) {
  const b = Buffer.from(valeur, 'base64url'),
    c = createDecipheriv('aes-256-gcm', cle, b.subarray(0, 12));
  c.setAAD(Buffer.from(contexte));
  c.setAuthTag(b.subarray(-16));
  return Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString();
}
export function debutGmail(id: string) {
  const state = randomBytes(32).toString('base64url'),
    verifier = randomBytes(48).toString('base64url');
  const params = new URLSearchParams({
    client_id: client,
    redirect_uri: gmailRetour,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  return {
    adresse: 'https://accounts.google.com/o/oauth2/v2/auth?' + params,
    cookie: sceller(JSON.stringify({ id, state, verifier, fin: Date.now() + 600000 }), 'oauth'),
  };
}
export async function jetonsGmail(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: client, client_secret: secret, ...params }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  const d = await r.json();
  if (!r.ok && d.error === 'invalid_grant') return null;
  if (!r.ok || !d.access_token) throw Error('Google indisponible');
  return d as { access_token: string; refresh_token?: string };
}
export async function accesGmail(token: string) {
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels?fields=labels(id)', {
    headers: { authorization: 'Bearer ' + token },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401 || r.status === 403) return false;
  if (!r.ok) throw Error('Gmail indisponible');
  return true;
}
