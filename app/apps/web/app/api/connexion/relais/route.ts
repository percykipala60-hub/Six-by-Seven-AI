import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, foreignOrigin, readJson } from '@/lib/http';

/**
 * Relais de connexion pour l'app de bureau (local seulement).
 *
 * L'app de bureau envoie la connexion Google ou Apple dans le navigateur de l'ordinateur. Au retour, le navigateur
 * arrive sur /connexion/retour, servie par ce même serveur local : la page dépose ici ce que Supabase a donné, et
 * l'app de bureau, qui attendait, le récupère. Plus besoin que le navigateur ouvre un lien six:// (Chrome l'exige
 * d'un clic).
 *
 * - une seule attente à la fois, 10 minutes au plus, identifiant aléatoire connu de la seule app de bureau ;
 * - un dépôt n'est accepté que si une attente existe, et une seule fois ; la récupération l'efface ;
 * - appels du site lui-même seulement (Origin), et de cet ordinateur seulement.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Attente = { id: string; fin: number; retour: string | null };
const g = globalThis as typeof globalThis & { __sixRelaisConnexion?: { attente: Attente | null } };
const etat = (g.__sixRelaisConnexion ??= { attente: null });
const DUREE_MS = 10 * 60_000;

function local(req: Request): boolean {
  if (process.env.VERCEL) return false;
  const hote = new URL(req.url).hostname;
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hote);
}

function active(): Attente | null {
  const a = etat.attente;
  if (a && a.fin < Date.now()) etat.attente = null;
  return etat.attente;
}

const CorpsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('attendre') }),
  // Ce que Supabase a mis dans l'adresse de retour : « ?code=… » ou « #access_token=… ».
  z.object({ action: z.literal('deposer'), retour: z.string().min(2).max(8000) }),
]);

export async function POST(req: Request) {
  if (foreignOrigin(req)) return fail(403, 'Requête non autorisée.');
  if (!local(req)) return fail(404, 'Relais de connexion disponible en local seulement.');
  const corps = CorpsSchema.safeParse(await readJson(req, 10_000));
  if (!corps.success) return fail(400, 'Demande invalide.');
  if (corps.data.action === 'attendre') {
    etat.attente = {
      id: randomBytes(24).toString('base64url'),
      fin: Date.now() + DUREE_MS,
      retour: null,
    };
    return NextResponse.json({ id: etat.attente.id }, { headers: { 'cache-control': 'no-store' } });
  }
  const a = active();
  if (!a || a.retour !== null) return NextResponse.json({ recu: false });
  if (!/^[?#]/.test(corps.data.retour)) return fail(400, 'Retour invalide.');
  a.retour = corps.data.retour;
  return NextResponse.json({ recu: true }, { headers: { 'cache-control': 'no-store' } });
}

export async function GET(req: Request) {
  if (foreignOrigin(req)) return fail(403, 'Requête non autorisée.');
  if (!local(req)) return fail(404, 'Relais de connexion disponible en local seulement.');
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const a = active();
  if (!a || id.length < 20 || a.id !== id) return fail(410, 'Attente terminée.');
  if (a.retour === null) return new NextResponse(null, { status: 204 });
  const retour = a.retour;
  etat.attente = null; // une seule récupération
  return NextResponse.json({ retour }, { headers: { 'cache-control': 'no-store' } });
}
