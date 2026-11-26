import { NextResponse } from 'next/server';

/**
 * Adresse de retour de l'application GitHub (réglée sur GitHub). La session de Six vit dans l'app (pas de cookie) :
 * on renvoie vers la page /github/retour, qui termine la liaison avec le compte connecté.
 */
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const entree = new URL(req.url);
  // Derrière le proxy du serveur, l'adresse interne n'est pas celle du site : on revient sur l'adresse publique.
  const site = (process.env.SITE_APP_URL || 'https://app.sixbysevenai.com').replace(/\/$/, '');
  const sortie = new URL(
    '/github/retour',
    process.env.NODE_ENV === 'production' ? site : entree.origin,
  );
  for (const cle of ['code', 'installation_id', 'setup_action', 'state']) {
    const v = entree.searchParams.get(cle);
    if (v) sortie.searchParams.set(cle, v.slice(0, 200));
  }
  return NextResponse.redirect(sortie, 302);
}
