import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { executerProchaine } from '@/lib/planificateur';
import { chat } from '@/lib/providers';
import { depasse } from '@/lib/quotas';
import { limitesGratuites } from '@/lib/premium';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  const secret = process.env.SIX_CRON_SECRET ?? '';
  const fourni = req.headers.get('authorization') ?? '';
  const attendu = `Bearer ${secret}`;
  if (
    secret.length < 32 ||
    Buffer.byteLength(fourni) !== Buffer.byteLength(attendu) ||
    !timingSafeEqual(Buffer.from(fourni), Buffer.from(attendu))
  )
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 401 });
  try {
    const executee = await executerProchaine(async (t, contexte) => {
      if (await depasse('messages', `u:${t.proprietaire}`, limitesGratuites().messages))
        throw new Error('quota');
      const r = await chat(
        [
          {
            role: 'user',
            content: `${contexte}\n\nTâche planifiée : ${t.demande}\nProduis le résultat maintenant. Aucune personne n’est présente pour répondre à une question. Indique les informations manquantes. Tu ne disposes pas de navigation web ni d’action dans une application externe pour cette exécution.`,
          },
        ],
        false,
        undefined,
        'sixtouch',
        t.skill,
      );
      if (r.demo) throw new Error('Service IA absent');
      return r.reponse;
    });
    return NextResponse.json({ executee });
  } catch {
    return NextResponse.json({ error: 'Exécution indisponible.' }, { status: 503 });
  }
}
