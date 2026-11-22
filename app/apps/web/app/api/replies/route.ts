import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { RepliesBodySchema } from '@/lib/api-schemas';
import { replies } from '@/lib/providers';
import { appelant } from '@/lib/premium';

const CHAMPS_REDACTION: Record<string, string> = {
  conversation: 'conversation',
  objectif: 'objectif',
  ton: 'ton',
  longueur: 'longueur',
  precision: 'précision',
  style: 'style',
  canal: 'réseau',
};

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const b = await readJson(req);
  const parsed = RepliesBodySchema.safeParse(b);
  if (!parsed.success) {
    const champs = [
      ...new Set(
        parsed.error.issues
          .map((issue) => issue.path[0])
          .filter(
            (champ): champ is string => typeof champ === 'string' && champ in CHAMPS_REDACTION,
          )
          .map((champ) => CHAMPS_REDACTION[champ]),
      ),
    ];
    return fail(
      400,
      champs.length
        ? `Paramètres de rédaction invalides : ${champs.join(', ')}.`
        : 'Les paramètres de rédaction sont invalides.',
    );
  }
  const { conversation, objectif, precision, ton, longueur, style, canal } = parsed.data;
  const { illimite } = await appelant(req);
  try {
    return NextResponse.json(
      // Réseau inconnu ou absent : ignoré, Six garde la forme de la conversation.
      await replies({ conversation, objectif, ton, longueur, precision, style, canal }, illimite),
    );
  } catch (e) {
    return providerFail(e);
  }
}
