import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { TopicsBodySchema } from '@/lib/api-schemas';
import { topics } from '@/lib/providers';

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const b = await readJson(req, 4_000);
  const parsed = TopicsBodySchema.safeParse(b);
  if (!parsed.success) return fail(400, 'La situation ou le contexte est invalide.');
  try {
    return NextResponse.json(await topics(parsed.data.situation, parsed.data.contexte ?? ''));
  } catch (e) {
    return providerFail(e);
  }
}
