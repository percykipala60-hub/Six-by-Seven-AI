import { NextResponse } from 'next/server';
import { rateLimited, readJson } from '@/lib/http';
import { confirmerPaiement, REFERENCE_VALIDE, urlPublique } from '@/lib/premium';

/**
 * Adresse de retour donnée à MaishaPay (callbackUrl).
 * - POST : notification de MaishaPay après un paiement Mobile Money.
 * - GET : le navigateur revient de la page de paiement par carte (…?status=200&transactionRefId=SIX-…).
 * Le contenu reçu n'est jamais cru : on n'en garde que notre référence, puis le serveur vérifie lui-même le
 * statut auprès de MaishaPay (confirmerPaiement). Une fausse notification ne peut donc rien activer.
 */

const CHAMPS = [
  'transactionRefId',
  'transactionReference',
  'originatingTransactionId',
  'reference',
];

function referenceDans(source: Record<string, unknown> | URLSearchParams | null): string | null {
  if (!source) return null;
  const lire = (k: string): unknown =>
    source instanceof URLSearchParams ? source.get(k) : (source[k] ?? null);
  for (const k of CHAMPS) {
    const v = lire(k);
    if (typeof v === 'string' && REFERENCE_VALIDE.test(v.trim())) return v.trim();
  }
  if (!(source instanceof URLSearchParams) && source.data && typeof source.data === 'object')
    return referenceDans(source.data as Record<string, unknown>);
  return null;
}

async function verifier(reference: string | null): Promise<string> {
  if (!reference) return 'INCONNU';
  try {
    return await confirmerPaiement(reference);
  } catch {
    console.error('[premium] notification : vérification impossible');
    return 'EN_ATTENTE';
  }
}

export async function POST(req: Request) {
  try {
    if (await rateLimited(req)) return NextResponse.json({ ok: false }, { status: 429 });
  } catch {
    /* limite indisponible : on vérifie quand même, la vérification est sans risque */
  }
  const url = new URL(req.url);
  const corps = await readJson(req, 10_000);
  const statut = await verifier(referenceDans(corps) ?? referenceDans(url.searchParams));
  return NextResponse.json({ ok: true, statut });
}

export async function GET(req: Request) {
  const reference = referenceDans(new URL(req.url).searchParams);
  try {
    if (!(await rateLimited(req))) await verifier(reference);
  } catch {
    await verifier(reference);
  }
  const retour = new URL('/reglages', urlPublique());
  retour.searchParams.set('v', 'premium');
  if (reference) retour.searchParams.set('ref', reference);
  return NextResponse.redirect(retour, 303);
}
