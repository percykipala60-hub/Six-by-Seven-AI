import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, readJson } from '@/lib/http';
import { adminDisponible, approuverQr, utilisateurDeRequete } from '@/lib/supabase-serveur';

/**
 * Connexion par code QR : l'appareil déjà connecté (qui a scanné le code) approuve la demande. L'autre appareil
 * récupère ensuite, une seule fois, son jeton de connexion (fonction six_qr_attendre dans Supabase).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Corps = z.object({ id: z.string().uuid(), secret: z.string().regex(/^[a-f0-9]{48}$/) });

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible())
    return fail(503, 'La connexion par code QR n’est pas configurée sur ce serveur.');
  const u = await utilisateurDeRequete(req);
  if (!u) return fail(401, 'Connecte-toi d’abord sur cet appareil.');
  const corps = Corps.safeParse(await readJson(req, 1_000));
  if (!corps.success) return fail(400, 'Code QR invalide.');
  try {
    const r = await approuverQr(corps.data, u);
    if (r === 'introuvable')
      return fail(410, 'Ce code QR a expiré ou a déjà servi. Affiche-en un nouveau.');
    return NextResponse.json({ ok: true });
  } catch {
    return fail(500, 'Connexion impossible pour le moment. Réessaie.');
  }
}
