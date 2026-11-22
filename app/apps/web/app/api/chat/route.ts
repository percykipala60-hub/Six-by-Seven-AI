import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { ChatBodySchema } from '@/lib/api-schemas';
import { chat } from '@/lib/providers';

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const b = await readJson(req);
  const parsed = ChatBodySchema.safeParse(b);
  if (!parsed.success) return fail(400, 'Les messages du chat sont invalides.');
  try {
    return NextResponse.json(await chat(parsed.data.messages));
  } catch (e) {
    return providerFail(e);
  }
}
