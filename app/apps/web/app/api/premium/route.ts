import { NextResponse } from 'next/server';
import { fail, foreignOrigin } from '@/lib/http';
import {
  appelant,
  limitesGratuites,
  offres,
  paiementDisponible,
  premiumEnVeille,
} from '@/lib/premium';

/** État du premium du compte qui appelle, offres et limites gratuites. */
export async function GET(req: Request) {
  if (foreignOrigin(req)) return fail(403, 'Requête non autorisée.');
  const a = await appelant(req);
  return NextResponse.json(
    {
      connecte: Boolean(a.utilisateur),
      premium: a.premium,
      jusquA: a.jusquA?.toISOString() ?? null,
      offres: offres(),
      limites: limitesGratuites(),
      paiementDisponible: paiementDisponible(),
      veille: premiumEnVeille(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
