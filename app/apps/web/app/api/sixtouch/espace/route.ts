import { NextResponse } from 'next/server';
import { fail, guard, readJson } from '@/lib/http';
import {
  ESPACE_ECRITURE_MAX,
  dossierEspace,
  ecrireResultat,
  lireEspace,
  listerEspace,
  preparerEspace,
  typeDe,
} from '@/lib/espace-travail';

// Espace de travail de Cosinus (lib/espace-travail.ts) : local seulement pour l'instant.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ABSENT = "L'espace de travail de Cosinus n'existe qu'en local pour l'instant.";

/** Local seulement : un dossier est réglé ET la demande vient de cet ordinateur (sauf SIXTOUCH_DISTANT=1). */
function racineAutorisee(req: Request): string {
  const racine = dossierEspace();
  if (!racine) return '';
  const hote = new URL(req.url).hostname;
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hote);
  return local || process.env.SIXTOUCH_DISTANT === '1' ? racine : '';
}

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const racine = racineAutorisee(req);
  if (!racine) return fail(404, ABSENT);
  const f = new URL(req.url).searchParams.get('f');
  try {
    await preparerEspace(racine);
    if (f) {
      const contenu = await lireEspace(racine, f);
      if (!contenu) return fail(404, 'Fichier introuvable dans l’espace de travail.');
      return new NextResponse(new Uint8Array(contenu), {
        headers: {
          'content-type': typeDe(f),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.split('/').pop() ?? 'fichier')}`,
        },
      });
    }
    return NextResponse.json(
      { dossier: racine, fichiers: await listerEspace(racine) },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return fail(500, 'Lecture de l’espace de travail impossible.');
  }
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const racine = racineAutorisee(req);
  if (!racine) return fail(404, ABSENT);
  const b = await readJson(req, ESPACE_ECRITURE_MAX + 2_000);
  if (!b || typeof b.contenu !== 'string' || !b.contenu.trim())
    return fail(400, 'Rien à enregistrer.');
  try {
    return NextResponse.json({ chemin: await ecrireResultat(racine, b.nom, b.contenu) });
  } catch {
    return fail(500, 'Enregistrement dans l’espace de travail impossible.');
  }
}
