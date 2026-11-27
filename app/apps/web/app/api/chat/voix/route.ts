import { NextResponse } from 'next/server';
import { fail, guard, readJson } from '@/lib/http';
import { depasse } from '@/lib/quotas';
import { utilisateurDeRequete } from '@/lib/supabase-serveur';
import { trouverVoixElevenLabs } from '@/lib/voix-elevenlabs';

const cle = () => process.env.ELEVENLABS_API_KEY?.trim();

export function GET() {
  return NextResponse.json(
    { elevenlabs: Boolean(cle()) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  const bloque = await guard(req);
  if (bloque) return bloque;
  const compte = await utilisateurDeRequete(req);
  if (!compte) return fail(401, 'Connecte-toi à Six pour utiliser les voix ElevenLabs.');
  const apiKey = cle();
  if (!apiKey) return fail(503, 'Les voix ElevenLabs sont indisponibles sur ce serveur.');

  const body = await readJson(req, 25000);
  const voix = trouverVoixElevenLabs(body?.voix);
  const texte = typeof body?.texte === 'string' ? body.texte.trim() : '';
  if (!voix || !texte || texte.length > 4000)
    return fail(400, 'La demande de lecture vocale est invalide ou trop longue.');
  if (await depasse('synthese', compte.id, 60))
    return fail(429, 'Tu as atteint la limite quotidienne de lecture avec ElevenLabs.');

  try {
    const reponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voix.id}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: texte,
        model_id: 'eleven_multilingual_v2',
        language_code: voix.langue,
      }),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(25000)]),
    });
    if (!reponse.ok || !reponse.body || !reponse.headers.get('content-type')?.startsWith('audio/'))
      return fail(502, 'ElevenLabs n’a pas pu générer la voix. Réessaie dans un instant.');
    return new Response(reponse.body, {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
    });
  } catch {
    return fail(503, 'La lecture avec ElevenLabs est temporairement indisponible.');
  }
}
