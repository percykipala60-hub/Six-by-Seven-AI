import { NextResponse } from 'next/server';
import { fail, guard, readJson } from '@/lib/http';
import { AchatAppleBodySchema } from '@/lib/api-schemas';
import {
  AchatAppleInvalide,
  controlerTransactionApple,
  referenceApple,
  sandboxAppleAccepte,
  verifierTransactionApple,
} from '@/lib/achat-apple';
import { appelant, appleOuvert, offre } from '@/lib/premium';
import { activerPaiement, creerPaiement, finPremium, lirePaiement } from '@/lib/supabase-serveur';

/**
 * Achat intégré Apple (app iPhone) : l'app envoie la transaction signée par l'App Store, le serveur en vérifie
 * la signature jusqu'à la racine d'Apple, puis prolonge le premium du compte, une seule fois par transaction.
 * Renvoyée plusieurs fois (restauration, achat interrompu), la même transaction ne prolonge rien de plus.
 */
export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!appleOuvert()) return fail(503, 'Les achats dans l’app ne sont pas encore ouverts.');

  const a = await appelant(req);
  if (!a.utilisateur) return fail(401, 'Connectez-vous pour passer à Six Premium.');

  const parsed = AchatAppleBodySchema.safeParse(await readJson(req, 25_000));
  if (!parsed.success) return fail(400, 'Achat illisible.');

  let transaction;
  try {
    transaction = verifierTransactionApple(parsed.data.jws);
  } catch (e) {
    if (e instanceof AchatAppleInvalide) return fail(400, 'Achat non reconnu par Apple.');
    return fail(500, 'Erreur inattendue. Réessayez.');
  }

  const c = controlerTransactionApple(transaction, {
    userId: a.utilisateur.id,
    sandboxAccepte: sandboxAppleAccepte(),
  });
  if (!c.ok) return fail(c.statut, c.raison);
  const o = offre(c.offre);
  if (!o) return fail(400, 'Cette offre n’existe pas.');

  const reference = referenceApple(transaction.transactionId);
  try {
    const existant = await lirePaiement(reference);
    if (existant && existant.user_id !== a.utilisateur.id)
      return fail(409, 'Cet achat appartient à un autre compte.');
    if (!existant) {
      // Prix réellement payé (en millièmes chez Apple), sinon celui de l'offre (achats de test gratuits).
      const paye = transaction.price && transaction.price > 0 ? transaction.price / 1000 : 0;
      await creerPaiement({
        reference,
        user_id: a.utilisateur.id,
        offre: o.id,
        jours: o.jours,
        montant: paye || o.montant,
        devise: paye && transaction.currency ? transaction.currency : o.devise,
        canal: 'apple',
        operateur: transaction.environment,
      });
    }
    await activerPaiement(reference);
    const fin = await finPremium(a.utilisateur.id);
    return NextResponse.json({
      premium: Boolean(fin && fin.getTime() > Date.now()),
      jusquA: fin?.toISOString() ?? null,
    });
  } catch {
    console.error('[premium] activation de l’achat Apple impossible');
    return fail(
      503,
      'L’achat n’a pas pu être enregistré. Réessayez : vous ne serez pas débité deux fois.',
    );
  }
}
