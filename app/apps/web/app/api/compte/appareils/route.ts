import { NextResponse } from 'next/server';
import { fail, guard } from '@/lib/http';
import {
  adminDisponible,
  deconnecterAppareil,
  listerAppareils,
  utilisateurDeRequete,
} from '@/lib/supabase-serveur';

/**
 * Appareils connectés au compte (Réglages → Appareils connectés).
 * GET : la liste des appareils du compte qui appelle. DELETE ?appareil=… : déconnecte cet appareil.
 * Seul le compte lui-même voit et gère ses appareils (jeton de session obligatoire).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const APPAREIL = /^[A-Za-z0-9_-]{8,64}$/;
const SANS_CACHE = { 'cache-control': 'no-store' };

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible())
    return fail(503, 'La liste des appareils n’est pas disponible sur ce serveur.');
  const u = await utilisateurDeRequete(req);
  if (!u) return fail(401, 'Connexion requise.');
  try {
    return NextResponse.json({ appareils: await listerAppareils(u.id) }, { headers: SANS_CACHE });
  } catch {
    return fail(503, 'La liste des appareils n’est pas disponible pour le moment.');
  }
}

export async function DELETE(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible())
    return fail(503, 'La gestion des appareils n’est pas disponible sur ce serveur.');
  const u = await utilisateurDeRequete(req);
  if (!u) return fail(401, 'Connexion requise.');
  const appareil = new URL(req.url).searchParams.get('appareil') ?? '';
  if (!APPAREIL.test(appareil)) return fail(400, 'Appareil invalide.');
  try {
    if (!(await deconnecterAppareil(u.id, appareil))) return fail(404, 'Appareil introuvable.');
    return NextResponse.json({ ok: true }, { headers: SANS_CACHE });
  } catch {
    return fail(503, 'Déconnexion de l’appareil impossible pour le moment.');
  }
}
