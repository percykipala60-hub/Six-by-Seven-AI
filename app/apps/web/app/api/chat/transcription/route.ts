import { NextResponse } from 'next/server';
import { fail, guard } from '@/lib/http';

// Message vocal Seven AI : transcription via le modèle audio d'OpenAI quand une clé est configurée.
// Sans clé OpenAI, on le dit honnêtement (Claude ne transcrit pas l'audio) : jamais de fausse transcription.
const TAILLE_MAX = 10 * 1024 * 1024; // 10 Mo

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  let audio: unknown;
  try {
    const form = await req.formData();
    audio = form.get('audio');
  } catch {
    return fail(400, 'Message vocal illisible. Réessaie.');
  }
  if (!(audio instanceof File) || !audio.type.startsWith('audio/'))
    return fail(400, 'Envoie un message vocal (fichier audio).');
  if (audio.size === 0) return fail(400, 'Le message vocal est vide.');
  if (audio.size > TAILLE_MAX) return fail(400, 'Le message vocal dépasse 10 Mo.');

  const key = (process.env.OPENAI_API_KEY ?? '').trim();
  if (!key)
    return fail(
      503,
      'La transcription vocale demande une clé OpenAI (OPENAI_API_KEY) côté serveur. En attendant, écris ton message.',
    );

  try {
    const corps = new FormData();
    corps.append('file', audio, 'message.webm');
    corps.append('model', (process.env.OPENAI_TRANSCRIBE_MODEL ?? '').trim() || 'whisper-1');
    corps.append('response_format', 'json');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: corps,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok)
      return fail(502, "La transcription n'a pas abouti. Réessaie ou écris ton message.");
    const data = (await res.json().catch(() => ({}))) as { text?: unknown };
    const texte = typeof data.text === 'string' ? data.text.trim() : '';
    if (!texte)
      return fail(502, "Le message vocal n'a pas été compris. Réessaie plus distinctement.");
    return NextResponse.json({ texte });
  } catch {
    return fail(502, "La transcription n'a pas abouti. Réessaie ou écris ton message.");
  }
}
