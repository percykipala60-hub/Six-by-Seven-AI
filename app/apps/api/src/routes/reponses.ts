import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  applyMask,
  AjusterRequestSchema,
  AnalyseRequestSchema,
  CoachRequestSchema,
  FeedbackSchema,
  SujetsRequestSchema,
  TonRequestSchema,
  findSensitive,
  ReplyApiRequestSchema,
  type Moteur,
  type ReplyApiResponse,
} from '@six/shared';
import { AGENT_VERSION, runAgent } from '../agent/agent.js';
import { ajuster, analyse, coach, sujets, verifierTon } from '../agent/outils.js';
import type { ProviderConfig } from '../ai/openai-compatible.js';

export interface ReponsesOptions {
  /** Le modèle à utiliser pour le moteur demandé (« auto », « qualite »…). */
  provider: (moteur: Moteur) => ProviderConfig | undefined;
  fetchImpl?: typeof fetch;
}

/**
 * POST /v1/reponses : une conversation masquée → 3 brouillons, l'alerte arnaque et la réflexion.
 * POST /v1/retour : « utile oui/non », sans aucun texte.
 *
 * Rien n'est stocké. Les logs ne contiennent que des compteurs (niveau d'arnaque, durée,
 * nombre de corrections), jamais un mot de la conversation ni des brouillons.
 */
function noModel(reply: FastifyReply) {
  return reply.code(503).send({
    statusCode: 503,
    error: 'Service Unavailable',
    message: 'Aucun modèle disponible pour ce moteur sur le serveur.',
  });
}

function badRequest(reply: FastifyReply, issues: { path: PropertyKey[] }[]) {
  // Seulement les champs en cause, jamais leur contenu.
  const fields = [...new Set(issues.map((i) => String(i.path[0] ?? 'corps')))].join(', ');
  return reply
    .code(400)
    .send({ statusCode: 400, error: 'Bad Request', message: `Requête invalide : ${fields}` });
}

/** 2e passe de masquage serveur : numéros et e-mails oubliés. Table jetée. */
function serverMask(text: string): string {
  return applyMask(text, findSensitive(text, { patternsOnly: true })).masked;
}

export function registerReponses(app: FastifyInstance, options: ReponsesOptions): void {
  app.post('/v1/reponses', async (request, reply) => {
    const parsed = ReplyApiRequestSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const body = parsed.data;
    const provider = options.provider(body.moteur);
    if (!provider) return noModel(reply);

    // 2e passe de masquage : numéros et e-mails oubliés. Les noms ont été vérifiés par
    // l'utilisateur sur son téléphone ; la table de cette passe est jetée.
    const conversation = serverMask(body.conversation);

    const run = await runAgent(
      provider,
      {
        conversation,
        ton: body.ton,
        langue: body.langue,
        ...(body.moi ? { moi: body.moi } : {}),
        ...(body.objectif ? { objectif: body.objectif } : {}),
        ...(body.precision ? { precision: body.precision } : {}),
        longueur: body.longueur,
      },
      {
        ...(body.style ? { style: body.style } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      },
    );

    request.log.info(
      {
        agent: AGENT_VERSION,
        arnaque: run.scam.niveau,
        bouclier: run.bouclier,
        corrections: run.corrections,
        secours: run.secours,
        restants: run.problemes.length,
        ms: run.latencyMs,
      },
      'reponses',
    );

    const response: ReplyApiResponse = {
      resume: run.suggestions.resume,
      reponses: run.suggestions.reponses,
      ...(run.reflexion ? { reflexion: run.reflexion } : {}),
      arnaque: { niveau: run.scam.niveau, raisons: run.scam.raisons },
      ...(run.interlocuteur ? { interlocuteur: run.interlocuteur } : {}),
      bouclier: run.bouclier,
      secours: run.secours,
      avertissements: run.problemes
        .filter((p) => p.index >= 0)
        .map((p) => ({ brouillon: p.index, message: p.message })),
      version: AGENT_VERSION,
      modele: run.bouclier ? 'aucun (bouclier)' : `${provider.name}/${provider.model}`,
      ms: run.latencyMs,
    };
    return response;
  });

  app.post('/v1/retour', async (request, reply) => {
    const parsed = FeedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ statusCode: 400, error: 'Bad Request', message: 'Retour invalide.' });
    }
    request.log.info(
      { utile: parsed.data.utile, brouillon: parsed.data.brouillon, version: parsed.data.version },
      'retour',
    );
    return reply.code(204).send();
  });

  // Chaque outil : même règle que /v1/reponses. Masquage serveur, aucun contenu dans les logs.
  const fetchOpt = options.fetchImpl ? { fetchImpl: options.fetchImpl } : {};

  app.post('/v1/analyse', async (request, reply) => {
    const parsed = AnalyseRequestSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const body = parsed.data;
    const provider = options.provider(body.moteur);
    if (!provider) return noModel(reply);
    const result = await analyse(
      provider,
      {
        conversation: serverMask(body.conversation),
        langue: body.langue,
        ...(body.moi ? { moi: body.moi } : {}),
      },
      fetchOpt,
    );
    request.log.info(
      {
        outil: 'analyse',
        tension: result.tension,
        arnaque: result.arnaque.niveau,
        secours: result.secours,
        ms: result.ms,
      },
      'outil',
    );
    return result;
  });

  app.post('/v1/ajuster', async (request, reply) => {
    const parsed = AjusterRequestSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const body = parsed.data;
    if (!body.consigne && !body.libre) return badRequest(reply, [{ path: ['consigne'] }]);
    const provider = options.provider(body.moteur);
    if (!provider) return noModel(reply);
    const result = await ajuster(
      provider,
      {
        conversation: serverMask(body.conversation),
        texte: serverMask(body.texte),
        langue: body.langue,
        ...(body.consigne ? { consigne: body.consigne } : {}),
        ...(body.libre ? { libre: serverMask(body.libre) } : {}),
        ...(body.moi ? { moi: body.moi } : {}),
      },
      fetchOpt,
    );
    request.log.info(
      {
        outil: 'ajuster',
        consigne: body.consigne ?? 'libre',
        secours: result.secours,
        ms: result.ms,
      },
      'outil',
    );
    return result;
  });

  app.post('/v1/coach', async (request, reply) => {
    const parsed = CoachRequestSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const body = parsed.data;
    const provider = options.provider(body.moteur);
    if (!provider) return noModel(reply);
    const result = await coach(
      provider,
      {
        conversation: serverMask(body.conversation),
        texte: serverMask(body.texte),
        ...(body.moi ? { moi: body.moi } : {}),
      },
      fetchOpt,
    );
    request.log.info({ outil: 'coach', secours: result.secours, ms: result.ms }, 'outil');
    return result;
  });

  app.post('/v1/verifier-ton', async (request, reply) => {
    const parsed = TonRequestSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const body = parsed.data;
    const provider = options.provider(body.moteur);
    if (!provider) return noModel(reply);
    const result = await verifierTon(
      provider,
      {
        texte: serverMask(body.texte),
        langue: body.langue,
        ...(body.contexte ? { contexte: serverMask(body.contexte) } : {}),
      },
      fetchOpt,
    );
    request.log.info(
      { outil: 'ton', percu: result.percu, secours: result.secours, ms: result.ms },
      'outil',
    );
    return result;
  });

  app.post('/v1/sujets', async (request, reply) => {
    const parsed = SujetsRequestSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const body = parsed.data;
    const provider = options.provider(body.moteur);
    if (!provider) return noModel(reply);
    const result = await sujets(
      provider,
      {
        categorie: body.categorie,
        langue: body.langue,
        ...(body.contexte ? { contexte: serverMask(body.contexte) } : {}),
      },
      fetchOpt,
    );
    request.log.info(
      { outil: 'sujets', categorie: body.categorie, secours: result.secours, ms: result.ms },
      'outil',
    );
    return result;
  });
}
