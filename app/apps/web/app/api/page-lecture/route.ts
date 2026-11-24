import { NextResponse } from 'next/server';
import { fail, guard } from '@/lib/http';
import { lirePourNavigateur } from '@/lib/page-lecture';

// Navigateur de Cosinus : dit si une page accepte l'affichage intégré, et sinon en donne une version lecture.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const url = new URL(req.url).searchParams.get('url');
  if (!url) return fail(400, 'Adresse manquante.');
  const r = await lirePourNavigateur(url);
  if ('erreur' in r) return fail(422, r.erreur);
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
}
