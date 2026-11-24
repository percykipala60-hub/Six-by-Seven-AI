import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { CHAT_MAX_BYTES, CHAT_MAX_BYTES_AVEC_IMAGE, ChatBodySchema } from '@/lib/api-schemas';
import { chat } from '@/lib/providers';
import { appelant, limitesGratuites, MESSAGE_LIMITE } from '@/lib/premium';
import { depasse } from '@/lib/quotas';

import { ProviderError, agentDisponible, hasChatAI } from '@/lib/ai';
import { executerAgent } from '@/lib/agent/boucle';
import { espacePourDemande } from '@/lib/agent/outils';
import { corpusDisponible } from '@/lib/agent/memoire-documents';
import { corrigerIdentite } from '@/lib/identite';

// Calculé à chaque demande : sinon Next fige la réponse au moment de la construction de l'app,
// quand les clés du serveur (deploy/.env) ne sont pas encore chargées, et l'app se croit en démonstration.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      demo: !hasChatAI(),
      agent: agentDisponible(),
      transcription: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  // Des images (capture d'écran, images d'une vidéo) peuvent accompagner le message : le corps peut alors être plus gros, mais le texte de la
  // discussion garde sa limite habituelle (CHAT_MAX_BYTES).
  const b = await readJson(req, CHAT_MAX_BYTES_AVEC_IMAGE);
  if (!b) return fail(400, 'Requête illisible ou trop volumineuse. Raccourcis ton message.');
  const parsed = ChatBodySchema.safeParse(b);
  if (!parsed.success) return fail(400, 'Les messages du chat sont invalides.');
  const tailleTexte = new TextEncoder().encode(
    JSON.stringify({ messages: parsed.data.messages }),
  ).length;
  if (tailleTexte > CHAT_MAX_BYTES)
    return fail(400, 'Requête illisible ou trop volumineuse. Raccourcis ton message.');
  const a = await appelant(req);
  if (!a.illimite && (await depasse('messages', a.cle, limitesGratuites().messages)))
    return fail(402, MESSAGE_LIMITE.messages);
  // Cosinus avec une IA capable d'agir (Claude ou IA locale) : l'agent utilise ses outils et la réponse arrive en
  // flux NDJSON, une ligne par étape ({type:'etape'}), puis la fin ({type:'fin'}) ou une erreur ({type:'erreur'}).
  if (parsed.data.mode === 'sixtouch' && agentDisponible()) {
    const messages = parsed.data.messages;
    const derniere = messages[messages.length - 1];
    const encodeur = new TextEncoder();
    // Fichiers et anciens documents de la personne : seulement en local (voir lib/agent/outils.ts).
    const espace = espacePourDemande(req);
    const flux = new ReadableStream<Uint8Array>({
      async start(c) {
        const envoyer = (o: unknown) => c.enqueue(encodeur.encode(`${JSON.stringify(o)}\n`));
        try {
          const r = await executerAgent({
            historique: messages.slice(0, -1),
            question: derniere.content,
            images: parsed.data.images,
            premium: a.illimite,
            ctx: {
              espace,
              corpus: Boolean(espace) && (await corpusDisponible()),
              ...(espace && !process.env.VERCEL
                ? {
                    navigateur: {
                      session: parsed.data.navigateurSession,
                      surEtat: (etat: { session: string; url: string }) =>
                        envoyer({ type: 'navigateur', ...etat }),
                    },
                  }
                : {}),
            },
            surEtape: (texte) => envoyer({ type: 'etape', texte }),
            annulation: req.signal,
            projet: parsed.data.projet,
          });
          envoyer({
            type: 'fin',
            reponse:
              corrigerIdentite(r.reponse) ||
              'Travail terminé, mais Six n’a pas écrit de résumé. Regarde tes fichiers.',
            etapes: r.etapes,
            fichiers: r.fichiers,
          });
        } catch (e) {
          envoyer({
            type: 'erreur',
            error: e instanceof ProviderError ? e.message : 'Erreur inattendue. Réessaie.',
          });
        }
        c.close();
      },
    });
    return new Response(flux, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    });
  }
  try {
    return NextResponse.json(
      await chat(
        parsed.data.messages,
        a.illimite,
        parsed.data.images,
        parsed.data.mode,
        parsed.data.projet,
      ),
    );
  } catch (e) {
    return providerFail(e);
  }
}
