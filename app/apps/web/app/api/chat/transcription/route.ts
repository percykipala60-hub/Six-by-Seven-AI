import { NextResponse } from 'next/server';
import { fail, guard } from '@/lib/http';
import { urlTranscriptionLocale } from '@/lib/transcription-locale';

// Message vocal Seven AI : transcription via le modèle audio d'OpenAI quand une clé est configurée.
// Sans clé OpenAI, on le dit honnêtement (Claude ne transcrit pas l'audio) : jamais de fausse transcription.
const TAILLE_MAX = 10 * 1024 * 1024; // 10 Mo
/** Langue de la dictée (Réglages → Voix) ; « auto » laisse le modèle la reconnaître. */
const LANGUES = new Set(['fr', 'en', 'ln', 'sw', 'auto']);

export async function POST(req: Request) {
  const blocked = await guard(req, true);
  if (blocked) return blocked;

  let audio: unknown;
  let langue = 'fr';
  try {
    const form = await req.formData();
    audio = form.get('audio');
    const l = form.get('langue');
    if (typeof l === 'string' && LANGUES.has(l)) langue = l;
  } catch {
    return fail(400, 'Message vocal illisible. Réessaie.');
  }
  if (!(audio instanceof File) || !audio.type.startsWith('audio/'))
    return fail(400, 'Envoie un message vocal (fichier audio).');
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
        return fail(502, 'Le moteur local n’a pas compris le message. Réessaie.');
      return NextResponse.json({ texte: data.texte.trim() });
    } catch {
      return fail(503, 'Le moteur de transcription local est indisponible.');
    }
  }

  const key = (process.env.OPENAI_API_KEY ?? '').trim();
  if (!key)
    return fail(
      503,
      'La transcription vocale demande une clé OpenAI (OPENAI_API_KEY) côté serveur. En attendant, écris ton message.',
    );

  try {
    const corps = new FormData();
    const format = audio.type.split(';')[0]?.toLowerCase();
    const extensions: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/mp4': 'mp4',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
    };
    const extension = format && extensions[format];
    if (!extension) return fail(415, 'Ce format audio ne peut pas être transcrit.');
    corps.append('file', audio, `message.${extension}`);
    corps.append('model', (process.env.OPENAI_TRANSCRIBE_MODEL ?? '').trim() || 'whisper-1');
    corps.append('response_format', 'json');
    if (langue !== 'auto') corps.append('language', langue);
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
