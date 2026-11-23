import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { CHAT_MAX_BYTES, ChatBodySchema } from '@/lib/api-schemas';
import { chat } from '@/lib/providers';
import { appelant, limitesGratuites, MESSAGE_LIMITE } from '@/lib/premium';
import { depasse } from '@/lib/quotas';

import { hasChatAI } from '@/lib/ai';

// Calculé à chaque demande : sinon Next fige la réponse au moment de la construction de l'app,
// quand les clés du serveur (deploy/.env) ne sont pas encore chargées, et l'app se croit en démonstration.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      demo: !hasChatAI(),
      transcription: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, CHAT_MAX_BYTES);
  if (!b) return fail(400, 'Requête illisible ou trop volumineuse. Raccourcis ton message.');
  const parsed = ChatBodySchema.safeParse(b);
  if (!parsed.success) return fail(400, 'Les messages du chat sont invalides.');
  const a = await appelant(req);
  if (!a.illimite && (await depasse('messages', a.cle, limitesGratuites().messages)))
    return fail(402, MESSAGE_LIMITE.messages);
  try {
    return NextResponse.json(await chat(parsed.data.messages, a.illimite));
  } catch (e) {
    return providerFail(e);
  }
}
