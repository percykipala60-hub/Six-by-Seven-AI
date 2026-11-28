import { NextResponse } from 'next/server';
import { guard, fail } from '@/lib/http';
import { utilisateurDeRequete, lireLienGmail } from '@/lib/supabase-serveur';
import {
  gmailConfigure,
  debutGmail,
  ouvrir,
  jetonsGmail,
  accesGmail,
  gmailRetour,
} from '@/lib/gmail-serveur';

async function connexion(req: Request, demarrer: boolean) {
  const bloque = await guard(req);
  if (bloque) return bloque;
  const u = await utilisateurDeRequete(req);
  if (!u) return fail(401, 'Connexion à Six requise.');
  if (!gmailConfigure) return fail(503, 'La connexion Gmail doit être configurée sur le serveur.');
  try {
    if (demarrer) {
      const { adresse, cookie } = debutGmail(u.id);
      const res = NextResponse.json({ adresse });
      res.cookies.set('six-gmail-oauth', cookie, {
        httpOnly: true,
        sameSite: 'lax',
        secure: gmailRetour.startsWith('https:'),
        maxAge: 600,
        path: '/api/gmail/retour',
      });
      return res;
    }
    const valeur = await lireLienGmail(u.id);
    const token =
      valeur &&
      (await jetonsGmail({ grant_type: 'refresh_token', refresh_token: ouvrir(valeur, u.id) }));
    return NextResponse.json(
      { relie: Boolean(token && (await accesGmail(token.access_token))) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return fail(503, 'Impossible de vérifier la connexion Gmail.');
  }
}
export const GET = (req: Request) => connexion(req, false);
export const POST = (req: Request) => connexion(req, true);
