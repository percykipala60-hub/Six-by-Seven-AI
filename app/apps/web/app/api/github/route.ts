import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, readJson } from '@/lib/http';
import {
  ErreurGithub,
  adresseAutorisation,
  adresseInstallation,
  depotsInstallation,
  etatSigne,
  etatValide,
  githubDisponible,
  installationDe,
} from '@/lib/github-app';
import {
  adminDisponible,
  ecrireLienGithub,
  lireLienGithub,
  supprimerLienGithub,
  utilisateurDeRequete,
} from '@/lib/supabase-serveur';

/**
 * GitHub dans le Cloud (Réglages → Cloud) :
 * - GET : relié ou non, le compte GitHub et les dépôts autorisés ; sinon l'adresse pour relier (avec un état signé
 *   par le serveur, lié au compte et daté : il marche même si le retour arrive dans un autre navigateur) ;
 * - POST { code, installation?, etat } : retour de GitHub (autorisation ou installation) ; vérifie l'état et que
 *   l'installation appartient à la personne ; si l'application n'est installée nulle part, renvoie l'adresse
 *   d'installation (choisir ses dépôts) ;
 * - DELETE : retire le lien côté Six (l'application se désinstalle depuis GitHub).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SANS_CACHE = { 'cache-control': 'no-store' };
const INDISPONIBLE = 'La connexion à GitHub est indisponible pour le moment.';
const Retour = z.object({
  code: z.string().min(8).max(200),
  installation: z.coerce.number().int().positive().optional(),
  etat: z.string().min(10).max(200),
});

export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!githubDisponible() || !adminDisponible()) return fail(503, INDISPONIBLE);
  const u = await utilisateurDeRequete(req);
  if (!u) return fail(401, 'Connexion requise.');
  try {
    const lien = await lireLienGithub(u.id);
    if (!lien) {
      return NextResponse.json(
        { relie: false, adresse: adresseAutorisation(etatSigne(u.id)) },
        { headers: SANS_CACHE },
      );
    }
    const depots = await depotsInstallation(lien.installation_id).catch(() => null);
    // Application désinstallée depuis GitHub : le lien ne sert plus, on l'oublie.
    if (!depots) {
      await supprimerLienGithub(u.id);
      return NextResponse.json(
        { relie: false, adresse: adresseAutorisation(etatSigne(u.id)) },
        { headers: SANS_CACHE },
      );
    }
    return NextResponse.json(
      {
        relie: true,
        login: lien.login,
        depots,
        gerer: `https://github.com/settings/installations/${lien.installation_id}`,
      },
      { headers: SANS_CACHE },
    );
  } catch {
    return fail(503, INDISPONIBLE);
  }
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!githubDisponible() || !adminDisponible()) return fail(503, INDISPONIBLE);
  const u = await utilisateurDeRequete(req);
  if (!u) return fail(401, 'Connexion requise.');
  const corps = Retour.safeParse(await readJson(req, 2_000));
  if (!corps.success) return fail(400, 'Retour de GitHub invalide.');
  // Le retour doit venir d'une demande faite par ce compte il y a moins de 30 minutes (pas d'un lien piégé).
  if (!etatValide(corps.data.etat, u.id))
    return fail(
      403,
      'Ce lien de retour GitHub a expiré ou ne vient pas de ton compte. Recommence depuis Réglages → Cloud.',
    );
  try {
    const { login, installation } = await installationDe(corps.data.code, corps.data.installation);
    // Autorisée mais pas encore installée : on passe au choix des dépôts sur GitHub (même état signé).
    if (!installation)
      return NextResponse.json(
        { relie: false, installer: adresseInstallation(corps.data.etat) },
        { headers: SANS_CACHE },
      );
    await ecrireLienGithub(u.id, installation, login);
    return NextResponse.json({ relie: true, login }, { headers: SANS_CACHE });
  } catch (e) {
    return fail(
      e instanceof ErreurGithub ? 403 : 503,
      e instanceof ErreurGithub ? e.message : INDISPONIBLE,
    );
  }
}

export async function DELETE(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible()) return fail(503, INDISPONIBLE);
  const u = await utilisateurDeRequete(req);
  if (!u) return fail(401, 'Connexion requise.');
  try {
    await supprimerLienGithub(u.id);
    return NextResponse.json({ relie: false }, { headers: SANS_CACHE });
  } catch {
    return fail(503, INDISPONIBLE);
  }
}
