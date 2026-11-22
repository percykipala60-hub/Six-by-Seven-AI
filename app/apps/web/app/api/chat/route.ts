import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { CHAT_MAX_BYTES, ChatBodySchema } from '@/lib/api-schemas';
import { chat } from '@/lib/providers';

import { hasChatAI } from '@/lib/ai';

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
  try {
    return NextResponse.json(await chat(parsed.data.messages));
  } catch (e) {
    return providerFail(e);
  }
}
