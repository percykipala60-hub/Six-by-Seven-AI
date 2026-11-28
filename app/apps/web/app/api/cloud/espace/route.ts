import { githubDisponible, jetonInstallation } from '@/lib/github-app';
import { adminDisponible, lireLienGithub } from '@/lib/supabase-serveur';
import { NextResponse } from 'next/server';
import { fail, guard, readJson } from '@/lib/http';
import { utilisateurDeRequete } from '@/lib/supabase-serveur';
import { typeDe } from '@/lib/espace-travail';
import {
  ErreurCloud,
  FICHIER_CLOUD_MAX,
  creerEnvironnementCloud,
  depotDeTexte,
  ecrireFichiersCloud,
  environnementsCloud,
  fichiersCloud,
  importerDepotGithub,
  lireFichierCloud,
  niveauDepuisListe,
} from '@/lib/cloud-cosinus';

/**
 * Cloud de Cosinus : environnements en ligne et leurs fichiers (lib/cloud-cosinus.ts). Demande un compte connecté ;
 * tout passe avec sa session, donc chacun n'accède qu'à ses propres données. Mêmes paramètres que l'espace local
 * (« niveau », « f ») pour l'explorateur, avec « e » = l'environnement cloud.
 */
/** Jeton de l'application GitHub de la personne, si elle a relié GitHub (sinon : dépôts publics seulement). */
async function jetonGithubDe(userId: string): Promise<string | undefined> {
  if (!githubDisponible() || !adminDisponible()) return undefined;
  const lien = await lireLienGithub(userId).catch(() => null);
  return lien ? jetonInstallation(lien.installation_id).catch(() => undefined) : undefined;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SANS_COMPTE = 'Connectez-vous à votre compte Six pour utiliser le Cloud.';

async function compte(req: Request) {
  const u = await utilisateurDeRequete(req);
  const jeton = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
  return u && jeton ? { u, jeton } : null;
}

const erreur = (e: unknown) =>
  fail(
    e instanceof ErreurCloud ? 400 : 500,
    e instanceof ErreurCloud ? e.message : 'Cloud indisponible.',
  );

export async function GET(req: Request) {
  const blocked = await guard(req, false, 'leger');
  if (blocked) return blocked;
  const c = await compte(req);
  if (!c) return fail(401, SANS_COMPTE);
  const params = new URL(req.url).searchParams;
  try {
    const e = params.get('e');
    if (!e)
      return NextResponse.json(
        { environnements: await environnementsCloud(c.jeton, c.u.id) },
        { headers: { 'cache-control': 'no-store' } },
      );
    const f = params.get('f');
    if (f) {
      const octets = await lireFichierCloud(c.jeton, e, f);
      if (!octets) return fail(404, 'Fichier introuvable dans le Cloud.');
      return new NextResponse(new Uint8Array(octets), {
        headers: {
          'content-type': typeDe(f),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          ...(/\.svg$/i.test(f)
            ? {
                'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
              }
            : {}),
        },
      });
    }
    const envs = await environnementsCloud(c.jeton, c.u.id);
    const env = envs.find((x) => x.id === e);
    if (!env) return fail(404, 'Environnement cloud introuvable.');
    const fichiers = await fichiersCloud(c.jeton, e);
    if (params.has('niveau'))
      return NextResponse.json(
        {
          dossier: `Cloud · ${env.nom}`,
          entrees: niveauDepuisListe(fichiers, params.get('niveau') ?? ''),
        },
        { headers: { 'cache-control': 'no-store' } },
      );
    return NextResponse.json(
      { dossier: `Cloud · ${env.nom}`, fichiers, versions: {}, environnement: env },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return erreur(e);
  }
}

/**
 * - { action: 'creer', nom, depot?, branche? } : nouvel environnement cloud (dépôt GitHub public importé) ;
 * - { action: 'importer', e, depot, branche? } : importe un dépôt dans un environnement existant ;
 * - { e, nom, contenu } : enregistre un texte dans « resultats/ » (bouton du volet Fichiers).
 */
export async function POST(req: Request) {
  const blocked = await guard(req, false, 'leger');
  if (blocked) return blocked;
  const c = await compte(req);
  if (!c) return fail(401, SANS_COMPTE);
  const b = await readJson(req, FICHIER_CLOUD_MAX);
  if (!b) return fail(400, 'Requête illisible.');
  try {
    const depot =
      typeof b.depot === 'string' && b.depot.trim() ? depotDeTexte(b.depot.trim()) : null;
    if (typeof b.depot === 'string' && b.depot.trim() && !depot)
      return fail(
        400,
        'Dépôt GitHub invalide : écris-le sous la forme proprietaire/depot ou colle son lien.',
      );
    const branche = typeof b.branche === 'string' && b.branche.trim() ? b.branche.trim() : null;
    if (b.action === 'creer') {
      const env = await creerEnvironnementCloud(
        c.jeton,
        c.u.id,
        typeof b.nom === 'string' ? b.nom : '',
        depot,
        branche,
      );
      const importe = depot
        ? await importerDepotGithub(
            c.jeton,
            c.u.id,
            env.id,
            depot,
            branche,
            await jetonGithubDe(c.u.id),
          )
        : null;
      return NextResponse.json({ environnement: env, importe });
    }
    if (typeof b.e !== 'string') return fail(400, 'Environnement manquant.');
    if (b.action === 'importer') {
      if (!depot) return fail(400, 'Dépôt GitHub manquant.');
      return NextResponse.json({
        importe: await importerDepotGithub(
          c.jeton,
          c.u.id,
          b.e,
          depot,
          branche,
          await jetonGithubDe(c.u.id),
        ),
      });
    }
    if (typeof b.contenu !== 'string' || !b.contenu.trim()) return fail(400, 'Rien à enregistrer.');
    const nom = (typeof b.nom === 'string' ? b.nom : 'resultat-six.md')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .slice(0, 80);
    const [chemin] = await ecrireFichiersCloud(c.jeton, c.u.id, b.e, [
      { chemin: `resultats/${nom || 'resultat-six.md'}`, octets: Buffer.from(b.contenu, 'utf8') },
    ]);
    return NextResponse.json({ chemin });
  } catch (e) {
    return erreur(e);
  }
}
