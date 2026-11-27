import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, readJson } from '@/lib/http';
import { appelant } from '@/lib/premium';
import { recevoirDuClient } from '@/lib/agent/pont-ordinateur';

/**
 * Résultat d'une action « ordinateur » exécutée par l'app de bureau, renvoyé à l'agent qui l'attend (voir
 * lib/agent/pont-ordinateur.ts). Accepté seulement pour une demande en cours du même compte.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Corps = z.object({
  id: z.string().uuid(),
  resultat: z.string().max(60_000),
});

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const a = await appelant(req);
  if (!a.utilisateur) return fail(401, 'Connexion requise.');
  const corps = Corps.safeParse(await readJson(req, 80_000));
  if (!corps.success) return fail(400, 'Résultat illisible.');
  if (!recevoirDuClient(a.utilisateur.id, corps.data.id, corps.data.resultat))
    return fail(404, 'Demande inconnue ou expirée.');
  return NextResponse.json({ ok: true });
}
