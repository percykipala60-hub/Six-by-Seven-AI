import { NextResponse } from 'next/server';
import { fail, guard } from '@/lib/http';
import { urlTranscriptionLocale } from '@/lib/transcription-locale';
import { estLangueVoix } from '@/lib/langues-voix';

// Transcription d'un message vocal par le moteur vocal de Six (SIX_TRANSCRIPTION_LOCALE). Claude répond aux
// messages mais ne transcrit pas la voix ; sans moteur, la dictée du navigateur ou du téléphone prend le relais.
const TAILLE_MAX = 10 * 1024 * 1024; // 10 Mo
const INDISPONIBLE = 'La dictée est indisponible pour le moment.';

export async function POST(req: Request) {
  const blocked = await guard(req, true);
  if (blocked) return blocked;

  let audio: unknown;
  let langue = 'fr';
  try {
    const form = await req.formData();
    audio = form.get('audio');
    const l = form.get('langue');
    if (estLangueVoix(l)) langue = l;
  } catch {
    return fail(400, 'Message vocal illisible. Réessayez.');
  }
  if (!(audio instanceof File) || !audio.type.startsWith('audio/'))
    return fail(400, 'Envoyez un message vocal (fichier audio).');
  if (audio.size === 0) return fail(400, 'Le message vocal est vide.');
  if (audio.size > TAILLE_MAX) return fail(400, 'Le message vocal dépasse 10 Mo.');

  const local = urlTranscriptionLocale();
  if (local) {
    try {
      const res = await fetch(`${local}/transcribe?langue=${langue}`, {
        method: 'POST',
        body: audio,
        signal: AbortSignal.timeout(120_000),
      });
      const data = await res.json();
      if (!res.ok || typeof data.texte !== 'string' || !data.texte.trim())
        return fail(502, 'Le moteur local n’a pas compris le message. Réessayez.');
      return NextResponse.json({
        texte: data.texte.trim(),
        ...(estLangueVoix(data.langue) && data.langue !== 'auto' ? { langue: data.langue } : {}),
      });
    } catch {
      return fail(503, 'Le moteur de transcription local est indisponible.');
    }
  }

  // Pas de moteur vocal sur ce serveur : la dictée passe par le navigateur ou le téléphone, sinon elle est
  // simplement indisponible (aucun service extérieur ne reçoit la voix).
  return fail(503, INDISPONIBLE);
}
