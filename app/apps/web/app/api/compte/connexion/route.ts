import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, readJson } from '@/lib/http';
import {
  adminDisponible,
  appareilBloque,
  enregistrerConnexion,
  sessionDuJeton,
  utilisateurDeRequete,
} from '@/lib/supabase-serveur';
import { composerAlerteConnexion, envoyerParResend } from '@/lib/emails-auth';

/**
 * Alerte de connexion. Appelé par l'app juste après chaque vraie connexion (mot de passe, Google, Apple, code QR) :
 * l'appareil est enregistré avec sa session, et un e-mail part vers l'adresse du compte avec « Ce n'était pas moi »
 * (bloque cet appareil) et « C'était moi ». GET : l'app vérifie que son appareil n'a pas été bloqué.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SITE = (process.env.SITE_APP_URL || 'https://app.sixbysevenai.com').replace(/\/$/, '');
const Corps = z.object({
  appareil: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  nom: z.string().max(120),
  methode: z.enum(['Mot de passe', 'Google', 'Apple', 'Code QR', 'Code e-mail', 'Connexion']),
});

async function compte(req: Request) {
  const u = await utilisateurDeRequete(req);
  const jeton = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  return u && jeton ? { u, jeton } : null;
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible()) return fail(503, 'Alertes de connexion non configurées sur ce serveur.');
  const c = await compte(req);
  if (!c) return fail(401, 'Connexion requise.');
  const corps = Corps.safeParse(await readJson(req, 2_000));
  if (!corps.success) return fail(400, 'Demande invalide.');
  try {
    const r = await enregistrerConnexion({
      userId: c.u.id,
      appareil: corps.data.appareil,
      nom: corps.data.nom,
      methode: corps.data.methode,
      sessionId: sessionDuJeton(c.jeton),
    });
    if (r.bloque) return NextResponse.json({ bloque: true });
    const cle = process.env.RESEND_API_KEY || '';
    let envoye = false;
    if (cle && c.u.email) {
      const { objet, html } = composerAlerteConnexion({
        methode: corps.data.methode,
        appareil: corps.data.nom,
        quand: new Date(),
        lienReponse: `${SITE}/compte/alerte?j=${encodeURIComponent(r.jeton)}`,
      });
      envoye = await envoyerParResend(cle, c.u.email, objet, html).catch(() => false);
    }
    return NextResponse.json({ bloque: false, alerte: envoye });
  } catch {
    return fail(500, 'Enregistrement de la connexion impossible.');
  }
}

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible()) return NextResponse.json({ bloque: false });
  const c = await compte(req);
  if (!c) return fail(401, 'Connexion requise.');
  const appareil = new URL(req.url).searchParams.get('appareil') ?? '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(appareil)) return fail(400, 'Appareil invalide.');
  try {
    return NextResponse.json(
      { bloque: await appareilBloque(c.u.id, appareil) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ bloque: false });
  }
}
