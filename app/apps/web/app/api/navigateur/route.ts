import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, foreignOrigin, readJson } from '@/lib/http';
import { TOUCHES_PERMISES, agir, suivre, type Evenement } from '@/lib/navigateur-distant';

// Navigateur complet de Cosinus (lib/navigateur-distant.ts) : local seulement, comme l'espace de travail.
// POST : une action (ouvrir, souris, molette, clavier…). GET ?session= : flux continu des images et des adresses.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const coord = z.number().finite();
const bouton = z.enum(['left', 'right', 'middle']).optional();
const clics = z.number().int().min(1).max(3).optional();
const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ouvrir'), url: z.string().min(1).max(2000) }),
  z.object({ action: z.literal('survol'), x: coord, y: coord }),
  z.object({ action: z.literal('appuyer'), x: coord, y: coord, bouton, clics }),
  z.object({ action: z.literal('relacher'), x: coord, y: coord, bouton, clics }),
  z.object({
    action: z.literal('defiler'),
    dx: coord,
    dy: coord,
    x: coord.optional(),
    y: coord.optional(),
  }),
  z.object({ action: z.literal('taper'), texte: z.string().min(1).max(500) }),
  z.object({ action: z.literal('touche'), touche: z.enum(TOUCHES_PERMISES) }),
  z.object({ action: z.literal('retour') }),
  z.object({ action: z.literal('avant') }),
  z.object({ action: z.literal('recharger') }),
  z.object({ action: z.literal('etat') }),
  z.object({ action: z.literal('fermer') }),
]);
const CorpsSchema = z.object({
  session: z.string().uuid().optional(),
  largeur: z.number().finite().optional(),
  hauteur: z.number().finite().optional(),
  densite: z.number().finite().optional(),
  a: ActionSchema,
});

/** Demande venue de cet ordinateur (sauf SIXTOUCH_DISTANT=1), et pas sur l'hébergement en ligne. */
function local(req: Request): boolean {
  if (process.env.VERCEL) return false;
  const hote = new URL(req.url).hostname;
  return (
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hote) ||
    process.env.SIXTOUCH_DISTANT === '1'
  );
}
const ABSENT = "Le navigateur complet n'existe qu'en local pour l'instant.";

export async function POST(req: Request) {
  // Pas de limite par minute ici : chaque mouvement de souris est une requête, et la route reste sur l'ordinateur.
  if (foreignOrigin(req)) return fail(403, 'Requête non autorisée.');
  if (!local(req)) return fail(404, ABSENT);
  const corps = CorpsSchema.safeParse(await readJson(req, 5000));
  if (!corps.success) return fail(400, 'Demande invalide.');
  try {
    const r = await agir(corps.data.session, corps.data.a, corps.data);
    if ('erreur' in r) return fail(r.erreur === 'Onglet fermé.' ? 410 : 422, r.erreur);
    return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return fail(503, e instanceof Error ? e.message : 'Navigateur indisponible.');
  }
}

/**
 * Flux binaire : [type 1 octet][longueur 4 octets][contenu]. Type 1 = image JPEG (premier octet du contenu : 1 si
 * nette), type 2 = JSON (adresse, titre, chargement). Pas de base64 : le volet décode l'image hors du fil principal.
 */
function trame(type: 1 | 2, contenu: Uint8Array, prefixe?: number): Uint8Array {
  const extra = prefixe === undefined ? 0 : 1;
  const t = new Uint8Array(5 + extra + contenu.byteLength);
  const v = new DataView(t.buffer);
  v.setUint8(0, type);
  v.setUint32(1, extra + contenu.byteLength);
  if (extra) t[5] = prefixe as number;
  t.set(contenu, 5 + extra);
  return t;
}

export async function GET(req: Request) {
  if (foreignOrigin(req)) return fail(403, 'Requête non autorisée.');
  if (!local(req)) return fail(404, ABSENT);
  const session = new URL(req.url).searchParams.get('session') ?? '';
  if (!z.string().uuid().safeParse(session).success) return fail(400, 'Session invalide.');
  const encodeur = new TextEncoder();
  let fin: (() => void) | null = null;
  // Le volet tire les données à son rythme : seule l'image la plus récente attend, jamais une file d'images en retard.
  let image: Evenement | null = null;
  const messages: Uint8Array[] = [];
  let controleur: ReadableStreamDefaultController<Uint8Array> | null = null;
  const vider = () => {
    const c = controleur;
    if (!c) return;
    try {
      while (messages.length && (c.desiredSize ?? 1) > 0) c.enqueue(messages.shift() as Uint8Array);
      if (image?.t === 'image' && (c.desiredSize ?? 1) > 0) {
        c.enqueue(trame(1, image.jpeg, image.nette ? 1 : 0));
        image = null;
      }
    } catch {
      fin?.();
    }
  };
  const flux = new ReadableStream<Uint8Array>(
    {
      start(c) {
        controleur = c;
        const desabonner = suivre(session, (e) => {
          if (e.t === 'image') image = e;
          else messages.push(trame(2, encodeur.encode(JSON.stringify(e))));
          vider();
        });
        if (!desabonner) {
          c.close();
          return;
        }
        const battement = setInterval(() => {
          messages.push(trame(2, encodeur.encode('{"t":"vivant"}')));
          vider();
        }, 15_000);
        fin = () => {
          clearInterval(battement);
          desabonner();
          fin = null;
          controleur = null;
          try {
            c.close();
          } catch {
            /* déjà fermé */
          }
        };
        req.signal.addEventListener('abort', () => fin?.());
      },
      pull() {
        vider();
      },
      cancel() {
        fin?.();
      },
    },
    { highWaterMark: 2 },
  );
  return new Response(flux, {
    headers: {
      'content-type': 'application/octet-stream',
      // no-transform : le serveur ne compresse pas le flux (la compression retenait les images ~1 s).
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
