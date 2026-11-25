import { NextResponse } from 'next/server';
import { fail, guard } from '@/lib/http';
import { droitsAppareils, peutDeconnecter } from '@/lib/droits-appareils';
import {
  adminDisponible,
  deconnecterAppareil,
  listerAppareils,
  sessionDuJeton,
  sessionsDesAppareils,
  utilisateurDeRequete,
} from '@/lib/supabase-serveur';

/**
 * Appareils connectés au compte (Réglages → Appareils connectés).
 * GET ?appareil=… : la liste (tous les appareils la voient), avec le rôle de chacun et ce que cet appareil peut faire.
 * DELETE ?appareil=…&cible=… (ou &tous=1) : déconnecte, seulement si la hiérarchie le permet (lib/droits-appareils).
 * L'appareil qui demande n'est reconnu que si sa session est bien celle enregistrée pour lui (pas d'usurpation).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPAREIL = /^[A-Za-z0-9_-]{8,64}$/;
const SANS_CACHE = { 'cache-control': 'no-store' };

/** Le compte, la liste de ses appareils, et l'appareil qui fait la demande (vérifié par sa session). */
async function contexte(req: Request) {
  const u = await utilisateurDeRequete(req);
  if (!u) return null;
  const jeton = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  const demande = new URL(req.url).searchParams.get('appareil') ?? '';
  const [liste, sessions] = await Promise.all([listerAppareils(u.id), sessionsDesAppareils(u.id)]);
  const session = sessionDuJeton(jeton);
  const moi =
    APPAREIL.test(demande) && session && sessions.get(demande) === session ? demande : null;
  return { u, liste, moi };
}

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible())
    return fail(503, 'La liste des appareils est indisponible pour le moment.');
  try {
    const c = await contexte(req);
    if (!c) return fail(401, 'Connexion requise.');
    const { roles, gestion } = droitsAppareils(c.liste, c.moi);
    return NextResponse.json(
      {
        appareils: c.liste.map((a) => ({
          ...a,
          role: roles.get(a.appareil) ?? 'secondaire',
          gerable: gestion && a.connecte && a.appareil !== c.moi,
        })),
        moi: c.moi,
        gestion,
      },
      { headers: SANS_CACHE },
    );
  } catch {
    return fail(503, 'La liste des appareils est indisponible pour le moment.');
  }
}

export async function DELETE(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible())
    return fail(503, 'La gestion des appareils est indisponible pour le moment.');
  const params = new URL(req.url).searchParams;
  const cible = params.get('cible') ?? '';
  const tous = params.get('tous') === '1';
  if (!tous && !APPAREIL.test(cible)) return fail(400, 'Appareil invalide.');
  try {
    const c = await contexte(req);
    if (!c) return fail(401, 'Connexion requise.');
    const cibles = tous
      ? c.liste.filter((a) => peutDeconnecter(c.liste, c.moi, a.appareil)).map((a) => a.appareil)
      : [cible];
    if (!cibles.length || cibles.some((x) => !peutDeconnecter(c.liste, c.moi, x)))
      return fail(
        403,
        'Seul l’appareil principal (ou l’hôte) peut déconnecter les autres appareils.',
      );
    await Promise.all(cibles.map((x) => deconnecterAppareil(c.u.id, x)));
    return NextResponse.json({ ok: true, deconnectes: cibles.length }, { headers: SANS_CACHE });
  } catch {
    return fail(503, 'Déconnexion de l’appareil impossible pour le moment.');
  }
}
