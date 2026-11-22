import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { analyze } from '@/lib/providers';
import { AnalyseBodySchema } from '@/lib/api-schemas';

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const body = await readJson(req);
  const parsed = AnalyseBodySchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Colle une conversation valide de 1 à 2000 caractères.');
  try {
    return NextResponse.json(await analyze(parsed.data.conversation));
  } catch (e) {
    return providerFail(e);
  }
}
