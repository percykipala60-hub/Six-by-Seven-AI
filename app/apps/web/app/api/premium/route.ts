import { NextResponse } from 'next/server';
import { fail, foreignOrigin } from '@/lib/http';
import { utilise } from '@/lib/quotas';
import {
  appelant,
  limitesGratuites,
  offres,
  appleOuvert,
  paiementDisponible,
  premiumEnVeille,
} from '@/lib/premium';

/** État du premium du compte qui appelle, offres et limites gratuites. */
export async function GET(req: Request) {
  if (foreignOrigin(req)) return fail(403, 'Requête non autorisée.');
  const a = await appelant(req);
  // Utilisations du jour (écran Utilisation) ; remises à zéro chaque jour à minuit UTC.
  const [analyses, messages] = await Promise.all([
    utilise('analyses', a.cle),
    utilise('messages', a.cle),
  ]);
  const demain = new Date();
  demain.setUTCHours(24, 0, 0, 0);
  return NextResponse.json(
    {
      connecte: Boolean(a.utilisateur),
      premium: a.premium,
      jusquA: a.jusquA?.toISOString() ?? null,
      offres: offres(),
      limites: limitesGratuites(),
      paiementDisponible: paiementDisponible(),
      apple: appleOuvert(),
      veille: premiumEnVeille(),
      utilise: { analyses, messages },
      remiseAZero: demain.toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
