import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fail, guard, readJson } from '@/lib/http';
import { adminDisponible, repondreAlerte } from '@/lib/supabase-serveur';

/**
 * Réponse à l'e-mail d'alerte de connexion (page /compte/alerte). Le jeton du lien suffit (aucune connexion) ;
 * il ne sert qu'une fois. « non » : bloque l'appareil et coupe sa session ; « oui » : confirme la connexion.
 * La page n'envoie cette demande qu'après un clic : un simple aperçu du lien (antivirus, messagerie) ne bloque rien.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Corps = z.object({
  jeton: z.string().regex(/^[a-f0-9]{64}$/),
  reponse: z.enum(['oui', 'non']),
});

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!adminDisponible()) return fail(503, 'Service indisponible pour le moment.');
  const corps = Corps.safeParse(await readJson(req, 1_000));
  if (!corps.success) return fail(400, 'Lien invalide.');
  try {
    const r = await repondreAlerte(corps.data.jeton, corps.data.reponse === 'non');
    if (!r) return fail(410, 'Ce lien a déjà été utilisé ou n’est plus valable.');
    return NextResponse.json(r);
  } catch {
    return fail(500, 'Action impossible pour le moment. Réessayez.');
  }
}
