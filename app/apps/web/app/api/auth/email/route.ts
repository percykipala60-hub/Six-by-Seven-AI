import { NextResponse } from 'next/server';
import {
  composerEmail,
  envoyerParResend,
  limiteAtteinte,
  signatureValide,
  type DemandeEmail,
} from '@/lib/emails-auth';
import { URL_SUPABASE } from '@/lib/supabase';

/**
 * « Send Email Hook » de Supabase : chaque e-mail de connexion passe ici.
 * Réponse attendue par Supabase : 200 {} si c'est envoyé ; sinon { error: { http_code, message } },
 * que Supabase renvoie tel quel à l'app (une limite atteinte s'affiche « Trop de tentatives »).
 */
export const runtime = 'nodejs';

function refus(httpCode: number, message: string) {
  return NextResponse.json({ error: { http_code: httpCode, message } }, { status: httpCode });
}

export async function POST(req: Request) {
  const secret = process.env.SUPABASE_EMAIL_HOOK_SECRET || '';
  const cle = process.env.RESEND_API_KEY || '';
  if (!secret || !cle) return refus(503, 'Email sending is not configured');

  const corps = await req.text();
  if (corps.length > 20_000) return refus(413, 'Payload too large');
  const ok = signatureValide(
    corps,
    {
      id: req.headers.get('webhook-id'),
      horodatage: req.headers.get('webhook-timestamp'),
      signature: req.headers.get('webhook-signature'),
    },
    secret,
  );
  if (!ok) return refus(401, 'Invalid signature');

  let demande: DemandeEmail;
  try {
    demande = JSON.parse(corps) as DemandeEmail;
  } catch {
    return refus(400, 'Invalid payload');
  }
  const email = demande?.user?.email;
  if (!email || !demande.email_data) return refus(400, 'Invalid payload');

  const contenu = composerEmail(demande.email_data, URL_SUPABASE);
  if (!contenu) return refus(400, 'Unsupported email type');

  // Limite par personne (adresse e-mail), quel que soit le réseau utilisé.
  if (limiteAtteinte(email)) return refus(429, 'Email rate limit exceeded for this address');

  try {
    const envoye = await envoyerParResend(cle, email, contenu.objet, contenu.html);
    return envoye ? NextResponse.json({}) : refus(502, 'Error sending email');
  } catch {
    return refus(502, 'Error sending email');
  }
}
