import { NextResponse } from 'next/server';
import { fail, guard, providerFail, readJson } from '@/lib/http';
import { CHAT_MAX_BYTES, CHAT_MAX_BYTES_AVEC_IMAGE, ChatBodySchema } from '@/lib/api-schemas';
import { chat } from '@/lib/providers';
import { appelant, limitesGratuites, MESSAGE_LIMITE } from '@/lib/premium';
import { depasse } from '@/lib/quotas';

import { ProviderError, agentDisponible, hasChatAI } from '@/lib/ai';
import { executerAgent } from '@/lib/agent/boucle';
import { espacePourDemande } from '@/lib/agent/outils';
import { dossierChoisi } from '@/lib/espace-travail';
import { utilisateurDeRequete } from '@/lib/supabase-serveur';
import {
  ErreurCloud,
  choisirAuto,
  environnementsCloud,
  materialiser,
  synchroniser,
  type EnvironnementCloud,
} from '@/lib/cloud-cosinus';
import { corpusDisponible } from '@/lib/agent/memoire-documents';
import { corrigerIdentite } from '@/lib/identite';
import { transcriptionLocaleDisponible } from '@/lib/transcription-locale';
import { modifierTravail } from '@/lib/travail-serveur';
import { contexteDuProjet } from '@/lib/travail';

// Calculé à chaque demande : sinon Next fige la réponse au moment de la construction de l'app,
// quand les clés du serveur (deploy/.env) ne sont pas encore chargées, et l'app se croit en démonstration.
export const dynamic = 'force-dynamic';

const SANS_ENVIRONNEMENT =
  'Choisis d’abord l’environnement de cette discussion : un dossier de l’ordinateur, ou ton Cloud.';
const DOSSIER_REFUSE =
  'Ce dossier de travail est introuvable ou inaccessible. Choisis un autre dossier pour cette discussion.';

export async function GET() {
  return NextResponse.json(
    {
      demo: !hasChatAI(),
      agent: agentDisponible(),
      transcription:
        Boolean(process.env.OPENAI_API_KEY?.trim()) || (await transcriptionLocaleDisponible()),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  const blocked = await guard(req, true);
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
  // Projet (Chat et Cosinus) : son contexte et ses documents, lus sur le serveur, précèdent la demande.
  if (parsed.data.projetId) {
    if (!a.utilisateur) return fail(401, 'Connecte-toi pour utiliser ce projet.');
    const proprietaire = a.utilisateur.id;
    try {
      const projet = await modifierTravail((e) =>
        e.projets.find((p) => p.id === parsed.data.projetId && p.proprietaire === proprietaire),
      );
      if (!projet) return fail(404, 'Projet introuvable.');
      const dernier = parsed.data.messages.at(-1);
      if (!dernier) return fail(400, 'Demande vide.');
      dernier.content = `${contexteDuProjet(projet)}\n\nDemande actuelle :\n${dernier.content}`;
    } catch {
      return fail(503, 'Le contexte du projet est temporairement indisponible.');
    }
  }
  if (!a.illimite && (await depasse('messages', a.cle, limitesGratuites().messages)))
    return fail(402, MESSAGE_LIMITE.messages);
  // Cosinus avec une IA capable d'agir (Claude ou IA locale) : l'agent utilise ses outils et la réponse arrive en
  // flux NDJSON, une ligne par étape ({type:'etape'}), puis la fin ({type:'fin'}) ou une erreur ({type:'erreur'}).
  if (parsed.data.mode === 'sixtouch' && agentDisponible()) {
    const messages = parsed.data.messages;
    const derniere = messages[messages.length - 1];
    const encodeur = new TextEncoder();
    // Environnement cloud : ses fichiers sont copiés dans un dossier temporaire, l'agent y travaille, puis ce qui
    // a changé repart dans le Cloud (lib/cloud-cosinus.ts). Demande un compte connecté.
    let cloud: {
      jeton: string;
      userId: string;
      env: EnvironnementCloud;
      dossier: string;
      avant: Map<string, string>;
    } | null = null;
    if (parsed.data.cloud) {
      const u = await utilisateurDeRequete(req);
      const jeton = /^Bearer\s+(\S+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
      if (!u || !jeton)
        return fail(401, 'Connecte-toi à ton compte Six pour travailler dans le Cloud.');
      try {
        const envs = await environnementsCloud(jeton, u.id);
        const env =
          parsed.data.cloud === 'auto'
            ? choisirAuto(envs, derniere.content)
            : envs.find((e) => e.id === parsed.data.cloud);
        if (!env) return fail(404, 'Environnement cloud introuvable.');
        cloud = { jeton, userId: u.id, env, ...(await materialiser(jeton, env.id)) };
      } catch (e) {
        return fail(400, e instanceof ErreurCloud ? e.message : 'Cloud indisponible.');
      }
    }
    // Fichiers et anciens documents de la personne : seulement en local (voir lib/agent/outils.ts).
    const espace = cloud ? cloud.dossier : await espacePourDemande(req, parsed.data.dossier);
    if (!cloud && parsed.data.dossier && !espace) return fail(400, DOSSIER_REFUSE);
    // Cosinus ne travaille jamais sans environnement (dossier de l'ordinateur ou Cloud).
    if (!cloud && !parsed.data.dossier) return fail(400, SANS_ENVIRONNEMENT);
    // Autres dossiers de l'environnement : lisibles par Six (jamais modifiés), seulement en local.
    const lecture =
      espace && !cloud
        ? (await Promise.all((parsed.data.dossiersLecture ?? []).map(dossierChoisi))).filter(
            Boolean,
          )
        : [];
    const flux = new ReadableStream<Uint8Array>({
      async start(c) {
        const envoyer = (o: unknown) => c.enqueue(encodeur.encode(`${JSON.stringify(o)}\n`));
        try {
          if (cloud)
            envoyer({
              type: 'etape',
              texte: `Six travaille dans le Cloud : « ${cloud.env.nom} »${cloud.env.depot_github ? ` (${cloud.env.depot_github})` : ''}`,
            });
          const r = await executerAgent({
            historique: messages.slice(0, -1),
            question: derniere.content,
            skill: parsed.data.skill,
            images: parsed.data.images,
            premium: a.illimite,
            ctx: {
              espace,
              horsDossier: { toutLePc: false, chemins: lecture },
              corpus: !cloud && Boolean(espace) && (await corpusDisponible()),
              ...(espace && !cloud && !process.env.VERCEL
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
            surPlan: (taches) => envoyer({ type: 'plan', taches }),
            annulation: req.signal,
          });
          envoyer({
            type: 'fin',
            reponse:
              corrigerIdentite(r.reponse) ||
              'Travail terminé, mais Six n’a pas écrit de résumé. Regarde tes fichiers.',
            etapes: r.etapes,
            fichiers: r.fichiers,
            plan: r.plan,
          });
        } catch (e) {
          envoyer({
            type: 'erreur',
            error: e instanceof ProviderError ? e.message : 'Erreur inattendue. Réessaie.',
          });
        }
        if (cloud) {
          // Ce que Six a créé ou modifié repart dans le Cloud ; le dossier temporaire est effacé.
          await synchroniser(
            cloud.jeton,
            cloud.userId,
            cloud.env.id,
            cloud.dossier,
            cloud.avant,
          ).catch(() =>
            envoyer({
              type: 'etape',
              texte: 'Attention : la copie des résultats vers le Cloud a échoué.',
            }),
          );
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
        parsed.data.skill,
      ),
    );
  } catch (e) {
    return providerFail(e);
  }
}
