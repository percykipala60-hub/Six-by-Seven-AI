import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ouvrir, sceller, gmailRetour, jetonsGmail, accesGmail } from '@/lib/gmail-serveur';
import { ecrireLienGmail } from '@/lib/supabase-serveur';

export async function GET(req: NextRequest) {
  let ok = false;
  try {
    const { id, fin, state, verifier } = JSON.parse(
      ouvrir(req.cookies.get('six-gmail-oauth')?.value || '', 'oauth'),
    );
    const p = req.nextUrl.searchParams,
      code = p.get('code');
    if (code && fin > Date.now() && p.get('state') === state) {
      const d = await jetonsGmail({
        grant_type: 'authorization_code',
        code,
        redirect_uri: gmailRetour,
        code_verifier: verifier,
      });
      if (d?.refresh_token && (await accesGmail(d.access_token))) {
        await ecrireLienGmail(id, sceller(d.refresh_token, id));
        ok = true;
      }
    }
  } catch {
    /* Le client reçoit un résultat sans code ni jeton. */
  }
  const res = NextResponse.redirect(
    new URL('/reglages?v=plugins&gmail=' + (ok ? 'ok' : 'echec'), gmailRetour || req.url),
  );
  res.cookies.set('six-gmail-oauth', '', { maxAge: 0, path: '/api/gmail/retour' });
  res.headers.set('referrer-policy', 'no-referrer');
  return res;
}
