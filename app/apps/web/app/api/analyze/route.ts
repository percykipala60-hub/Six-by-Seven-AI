import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { analyze } from '@/lib/providers';
import { AnalyseBodySchema } from '@/lib/api-schemas';
import { appelant, limitesGratuites, MESSAGE_LIMITE } from '@/lib/premium';
import { depasse } from '@/lib/quotas';

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const body = await readJson(req);
  const parsed = AnalyseBodySchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Colle une conversation valide de 1 à 2000 caractères.');
  const a = await appelant(req);
  if (!a.premium && (await depasse('analyses', a.cle, limitesGratuites().analyses)))
    return fail(402, MESSAGE_LIMITE.analyses);
  try {
    return NextResponse.json(await analyze(parsed.data.conversation));
  } catch (e) {
    return providerFail(e);
  }
}
