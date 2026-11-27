import { NextResponse } from 'next/server';
import { fail, foreignOrigin, guard, readJson } from '@/lib/http';
import {
  ESPACE_ECRITURE_MAX,
  demandeLocale,
  dossierEspace,
  ecrireResultat,
  espaceAutorise,
  listerNiveau,
  listerVersions,
  nombresDeVersions,
  restaurerVersion,
  lireEspace,
  listerEspace,
  preparerEspace,
  typeDe,
} from '@/lib/espace-travail';

// Espace de travail de Cosinus (lib/espace-travail.ts) : local seulement pour l'instant.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Protection des demandes. Les fichiers ne sont servis qu'à cet ordinateur (demandeLocale) : pour lui, seule
 * l'origine est vérifiée (un autre site ne peut pas lire les fichiers), sans la limite de 20 demandes par minute
 * faite pour les appels à l'IA (parcourir un dossier et afficher ses fichiers en demande beaucoup plus).
 */
async function garde(req: Request) {
  if (demandeLocale(req)) return foreignOrigin(req) ? fail(403, 'Requête non autorisée.') : null;
  return guard(req);
}

const ABSENT = "L'espace de travail de Cosinus n'existe qu'en local pour l'instant.";

const DOSSIER_REFUSE = 'Dossier introuvable ou inaccessible. Choisissez un autre dossier.';

/**
 * Local seulement : la demande vient de cet ordinateur (sauf SIXTOUCH_DISTANT=1). « d » : dossier de
 * l'environnement de la discussion (chemin absolu) ; sans « d », le dossier par défaut (SIXTOUCH_DOSSIER).
 */
export async function GET(req: Request) {
  const blocked = await garde(req);
  if (blocked) return blocked;
  const params = new URL(req.url).searchParams;
  // « etat » : Cosinus sait s'il peut proposer des dossiers (local) et lequel suggérer par défaut.
  if (params.has('etat'))
    return NextResponse.json(
      { local: demandeLocale(req), defaut: demandeLocale(req) ? dossierEspace() : '' },
      { headers: { 'cache-control': 'no-store' } },
    );
  const d = params.get('d');
  if (!demandeLocale(req)) return fail(404, ABSENT);
  const racine = await espaceAutorise(req, d);
  if (!racine) return fail(404, d ? DOSSIER_REFUSE : ABSENT);
  const f = params.get('f');
  try {
    // Le dossier par défaut est préparé d'office ; un dossier choisi n'est jamais modifié par une simple lecture
    // (« resultats » n'y est créé qu'au premier enregistrement).
    if (!d) await preparerEspace(racine);
    if (f) {
      const contenu = await lireEspace(racine, f);
      if (!contenu) return fail(404, 'Fichier introuvable dans l’espace de travail.');
      return new NextResponse(new Uint8Array(contenu), {
        headers: {
          'content-type': typeDe(f),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          // Un SVG peut contenir du script : ouvert seul, il est isolé et rien ne s'y exécute.
          ...(/\.svg$/i.test(f)
            ? {
                'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
              }
            : {}),
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.split('/').pop() ?? 'fichier')}`,
        },
      });
    }
    // « niveau » : contenu direct d'un dossier (vide : la racine), pour l'explorateur.
    if (params.has('niveau')) {
      const entrees = await listerNiveau(racine, params.get('niveau') ?? '');
      if (!entrees) return fail(404, 'Dossier introuvable dans l’espace de travail.');
      return NextResponse.json(
        { dossier: racine, entrees },
        { headers: { 'cache-control': 'no-store' } },
      );
    }
    // « versions » : anciennes versions d'un fichier, la plus récente d'abord.
    const v = params.get('versions');
    if (v)
      return NextResponse.json(
        { versions: await listerVersions(racine, v) },
        { headers: { 'cache-control': 'no-store' } },
      );
    return NextResponse.json(
      {
        dossier: racine,
        fichiers: await listerEspace(racine),
        versions: await nombresDeVersions(racine),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return fail(500, 'Lecture de l’espace de travail impossible.');
  }
}

export async function POST(req: Request) {
  const blocked = await garde(req);
  if (blocked) return blocked;
  const b = await readJson(req, ESPACE_ECRITURE_MAX + 2_000);
  const racine = await espaceAutorise(req, b?.dossier);
  if (!racine) return fail(404, b?.dossier ? DOSSIER_REFUSE : ABSENT);
  // Revenir à une version précédente d'un fichier (la version actuelle est gardée, on peut donc annuler).
  if (b?.action === 'restaurer') {
    try {
      return NextResponse.json({ restaures: await restaurerVersion(racine, b.chemin, b.version) });
    } catch {
      return fail(400, 'Restauration impossible : version introuvable.');
    }
  }
  if (!b || typeof b.contenu !== 'string' || !b.contenu.trim())
    return fail(400, 'Rien à enregistrer.');
  try {
    return NextResponse.json({ chemin: await ecrireResultat(racine, b.nom, b.contenu) });
  } catch {
    return fail(500, 'Enregistrement dans l’espace de travail impossible.');
  }
}
