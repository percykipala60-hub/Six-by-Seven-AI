import { NextResponse } from 'next/server';
import { fail, guard } from '@/lib/http';
import { MaishaPayError } from '@/lib/maishapay';
import { appelant, confirmerPaiement, REFERENCE_VALIDE } from '@/lib/premium';
import { lirePaiement } from '@/lib/supabase-serveur';

/** L'app demande où en est son paiement ; le serveur le vérifie auprès de MaishaPay à chaque fois. */
export async function GET(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const reference = new URL(req.url).searchParams.get('ref') ?? '';
  if (!REFERENCE_VALIDE.test(reference)) return fail(400, 'Référence de paiement invalide.');

  const a = await appelant(req);
  if (!a.utilisateur) return fail(401, 'Connecte-toi pour voir ce paiement.');
  try {
    const p = await lirePaiement(reference);
    // Le paiement d'un autre compte répond comme un paiement inconnu.
    if (!p || p.user_id !== a.utilisateur.id) return fail(404, 'Paiement introuvable.');
    const statut = await confirmerPaiement(reference);
    const apres = statut === 'REUSSI' ? await appelant(req) : a;
    return NextResponse.json(
      { reference, statut, premium: apres.premium, jusquA: apres.jusquA?.toISOString() ?? null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    if (e instanceof MaishaPayError) return fail(502, e.message);
    console.error('[premium] vérification du paiement impossible');
    return fail(503, 'Six n’a pas pu vérifier le paiement. Réessaie dans un instant.');
  }
}
