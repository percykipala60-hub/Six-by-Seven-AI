import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { AdjustBodySchema } from '@/lib/api-schemas';
import { adjust } from '@/lib/providers';

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const b = await readJson(req);
  const parsed = AdjustBodySchema.safeParse(b);
  if (!parsed.success) return fail(400, 'La réponse ou la consigne est invalide.');
  try {
    return NextResponse.json(await adjust(parsed.data.reponse, parsed.data.consigne));
  } catch (e) {
    return providerFail(e);
  }
}
