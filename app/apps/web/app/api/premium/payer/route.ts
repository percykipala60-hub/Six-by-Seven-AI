import { NextResponse } from 'next/server';
import { fail, guard, readJson } from '@/lib/http';
import { PayerBodySchema } from '@/lib/api-schemas';
import { initierCarte, initierMobile, MaishaPayError } from '@/lib/maishapay';
import { appelant, maishapayOuvert, nouvelleReference, offre, urlPublique } from '@/lib/premium';
import { creerPaiement, majPaiement } from '@/lib/supabase-serveur';

/**
 * Lance le paiement d'un pass premium. Mobile Money : une invite arrive sur le téléphone, l'app attend la
 * confirmation (route /api/premium/paiement). Carte : l'app ouvre la page de paiement sécurisée de MaishaPay.
 */
export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  if (!maishapayOuvert())
    return fail(503, 'Le paiement n’est pas encore ouvert. Réessaie plus tard.');

  const a = await appelant(req);
  if (!a.utilisateur) return fail(401, 'Connecte-toi pour passer à Six Premium.');
  if (!a.utilisateur.email) return fail(400, 'Ton compte n’a pas d’adresse e-mail.');

  const parsed = PayerBodySchema.safeParse(await readJson(req, 2_000));
  if (!parsed.success) return fail(400, 'Vérifie l’offre, le numéro (avec +243) et les champs.');
  const b = parsed.data;
  const o = offre(b.offre);
  if (!o || o.montant <= 0) return fail(400, 'Cette offre n’existe pas.');

  const reference = nouvelleReference();
  const callbackUrl = `${urlPublique()}/api/premium/notification`;
  const commun = {
    reference,
    montant: o.montant,
    devise: o.devise,
    email: a.utilisateur.email,
    callbackUrl,
  };

  try {
    await creerPaiement({
      reference,
      user_id: a.utilisateur.id,
      offre: o.id,
      jours: o.jours,
      montant: o.montant,
      devise: o.devise,
      canal: b.canal,
      operateur: b.canal === 'mobile' ? b.operateur : b.reseau,
    });
  } catch {
    console.error('[premium] enregistrement du paiement impossible');
    return fail(503, 'Le paiement n’a pas pu être préparé. Réessaie dans un instant.');
  }

  try {
    if (b.canal === 'mobile') {
      const r = await initierMobile({
        ...commun,
        prenom: a.utilisateur.prenom,
        nom: a.utilisateur.nom,
        operateur: b.operateur,
        telephone: b.telephone,
      });
      if (r.maishapayId) await majPaiement(reference, { maishapay_id: r.maishapayId });
      return NextResponse.json({ reference, statut: 'EN_ATTENTE' });
    }
    const r = await initierCarte({
      ...commun,
      prenom: b.prenom,
      nom: b.nom,
      reseau: b.reseau,
      telephone: b.telephone,
      ville: b.ville,
    });
    if (r.maishapayId) await majPaiement(reference, { maishapay_id: r.maishapayId });
    return NextResponse.json({ reference, statut: 'EN_ATTENTE', pagePaiement: r.pagePaiement });
  } catch (e) {
    await majPaiement(reference, { statut: 'ECHOUE' }).catch(() => {});
    if (e instanceof MaishaPayError) return fail(502, e.message);
    return fail(500, 'Erreur inattendue. Réessaie.');
  }
}
