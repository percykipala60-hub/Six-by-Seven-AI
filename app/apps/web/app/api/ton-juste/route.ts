import { NextResponse } from 'next/server';
import { dailyCounter, hasAI } from '@/lib/ai';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { evaluer, lireDemande } from '@/lib/ton-juste';

// Le jeu est très dur : les joueurs réessaient souvent. Ce plafond propre au jeu (400 évaluations par jour
// par défaut, TON_JUSTE_DAILY_LIMIT=0 pour le couper) garde le reste du budget AI_DAILY_LIMIT pour Six.
const plafondJeu = dailyCounter('TON_JUSTE_DAILY_LIMIT', 400);

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const lu = lireDemande(await readJson(req));
  if ('erreur' in lu) return fail(400, lu.erreur);
  // Sans clé, pas de fausse note : la progression du joueur ne doit reposer que sur de vraies évaluations.
  if (!hasAI())
    return fail(503, "Le jeu n'est pas encore relié à l'IA de Six. Réessaie plus tard.");
  if (plafondJeu())
    return fail(503, "Le jeu a atteint sa limite d'évaluations pour aujourd'hui. Reviens demain.");
  try {
    return NextResponse.json(await evaluer(lu.level, lu.playerAnswer));
  } catch (e) {
    return providerFail(e);
  }
}
