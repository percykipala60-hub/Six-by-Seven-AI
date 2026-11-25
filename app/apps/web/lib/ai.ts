import Anthropic from '@anthropic-ai/sdk';
import type { MessageAgent, OutilSchema, ReponseAgent } from './agent/types';

// Fournisseurs d'IA (Claude, OpenAI/ChatGPT). Les clés ne vivent QUE dans les variables d'environnement du serveur :
// jamais dans le code, jamais dans le navigateur (aucune variable NEXT_PUBLIC_), jamais dans les logs.

export class ProviderError extends Error {}

export type Role = 'analyse' | 'redaction';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Image jointe au dernier message (capture du navigateur de Six, image d'une vidéo), en base64. */
export type ImageJointe = { type: 'image/jpeg' | 'image/png'; data: string };

interface Provider {
  id: string;
  label: string;
  configured(role: Role): boolean;
  /** premium : le meilleur modèle de rédaction ; sinon le modèle de la version gratuite. */
  model(role: Role, premium?: boolean): string;
  call(
    model: string,
    system: string,
    user: string,
    maxTokens: number,
    signal: AbortSignal,
    history?: ChatMessage[],
    images?: ImageJointe[],
  ): Promise<string>;
}

const env = (name: string): string => (process.env[name] ?? '').trim();

// Modèles capables de basculer côté serveur vers un autre modèle en cas de refus (paramètre `fallbacks`).
const FALLBACK_MODELS = new Set([
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
]);

/** Journal technique des jetons (nombres seulement, jamais de contenu) pour vérifier que le cache est relu. */
function logUsage(model: string, u: Anthropic.Beta.BetaUsage): void {
  console.info(
    `[ia] ${model} : entrée ${u.input_tokens}, cache écrit ${u.cache_creation_input_tokens ?? 0}, cache lu ${u.cache_read_input_tokens ?? 0}, sortie ${u.output_tokens}`,
  );
}

const claude: Provider = {
  id: 'claude',
  label: 'Claude',
  configured: () => Boolean(env('ANTHROPIC_API_KEY')),
  // Analyse et retouches : petit modèle, rapide et économe. Rédaction : modèle principal.
  // Rédaction : modèle principal pour le premium, modèle plus léger (CLAUDE_MODEL_REDACTION_GRATUIT) sinon.
  model: (role, premium = true) =>
    role === 'analyse'
      ? env('CLAUDE_MODEL_ANALYSE') || 'claude-haiku-4-5-20251001'
      : premium
        ? env('CLAUDE_MODEL_REDACTION') || 'claude-sonnet-5-5'
        : env('CLAUDE_MODEL_REDACTION_GRATUIT') || 'claude-haiku-4-5-20251001',
  async call(model, system, user, maxTokens, signal, history, images) {
    const client = new Anthropic({
      apiKey: env('ANTHROPIC_API_KEY'),
      maxRetries: 0, // la bascule et la nouvelle tentative sont gérées par callAI et providers.ts
      fetch: (input, init) => globalThis.fetch(input, init),
    });
    const fallback = FALLBACK_MODELS.has(model);
    try {
      const msg = await client.beta.messages.create(
        {
          model,
          max_tokens: maxTokens,
          // Cache sur le prompt système, identique pour tous : relu à ~0,1x du prix pendant 5 min.
          // En dessous du minimum du modèle (512 tokens pour Sonnet 5.5, 4096 pour Haiku 4.5), l'API l'ignore sans frais.
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [
            ...(history ?? []),
            {
              role: 'user' as const,
              content: images?.length
                ? [
                    ...images.map((image) => ({
                      type: 'image' as const,
                      source: { type: 'base64' as const, media_type: image.type, data: image.data },
                    })),
                    { type: 'text' as const, text: user },
                  ]
                : user,
            },
          ],
          // En cas de refus par les protections du modèle, l'API relance la demande sur un modèle de repli.
          ...(fallback
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        },
        { signal },
      );
      logUsage(msg.model, msg.usage);
      if (msg.stop_reason === 'refusal') throw new HttpFailure(451);
      return msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e) {
      if (e instanceof HttpFailure) throw e;
      if (e instanceof Anthropic.APIError && typeof e.status === 'number')
        throw new HttpFailure(e.status);
      throw new HttpFailure(0); // réseau, délai dépassé ou annulation
    }
  },
};

const openai: Provider = {
  id: 'openai',
  label: 'ChatGPT (OpenAI)',
  // Pas de nom de modèle par défaut : à choisir dans la doc OpenAI, puis à mettre dans .env.local.
  configured: (role) => Boolean(env('OPENAI_API_KEY') && openai.model(role)),
  model: (role, premium = true) =>
    (role === 'analyse'
      ? env('OPENAI_MODEL_ANALYSE')
      : (!premium && env('OPENAI_MODEL_REDACTION_GRATUIT')) || env('OPENAI_MODEL_REDACTION')) ||
    env('OPENAI_MODEL'),
  async call(model, system, user, maxTokens, signal, history, images) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          ...(history ?? []),
          {
            role: 'user',
            content: images?.length
              ? [
                  { type: 'text', text: user },
                  ...images.map((image) => ({
                    type: 'image_url',
                    image_url: { url: `data:${image.type};base64,${image.data}` },
                  })),
                ]
              : user,
          },
        ],
      }),
    });
    if (!res.ok) throw new HttpFailure(res.status);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new HttpFailure(502);
    return text;
  },
};

class HttpFailure extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/**
 * IA locale : le modèle de Seven.AI qui tourne sur l'ordinateur avec Ollama (dossier ia/ du projet), sans clé ni
 * service extérieur. Activée par IA_LOCALE_MODELE (ex. qwen3.5:9b) ; IA_LOCALE_URL vaut http://127.0.0.1:11434 par
 * défaut. API native d'Ollama (/api/chat) : elle accepte les images et permet de couper la « réflexion » du modèle,
 * qui sinon rallonge beaucoup chaque réponse.
 */
const local: Provider = {
  id: 'local',
  label: 'IA locale (Ollama)',
  configured: () => Boolean(env('IA_LOCALE_MODELE')),
  model: (role) =>
    (role === 'analyse' && env('IA_LOCALE_MODELE_ANALYSE')) || env('IA_LOCALE_MODELE'),
  async call(model, system, user, maxTokens, signal, history, images) {
    const base = (env('IA_LOCALE_URL') || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          // Garde le modèle chargé sur la carte graphique entre deux messages (sinon ~15 s de rechargement).
          keep_alive: env('IA_LOCALE_GARDER') || '30m',
          options: { num_predict: maxTokens, num_ctx: Number(env('IA_LOCALE_CONTEXTE')) || 8192 },
          messages: [
            { role: 'system', content: system },
            ...(history ?? []),
            {
              role: 'user',
              content: user,
              ...(images?.length ? { images: images.map((i) => i.data) } : {}),
            },
          ],
        }),
      });
    } catch {
      throw new HttpFailure(0); // Ollama arrêté, délai dépassé ou annulation
    }
    if (!res.ok) throw new HttpFailure(res.status);
    const data = (await res.json()) as { message?: { content?: string } };
    const text = data.message?.content;
    if (typeof text !== 'string') throw new HttpFailure(502);
    return text;
  },
};

const ALL: Record<string, Provider> = { claude, openai, local };

/**
 * Ordre d'essai : AI_PROVIDERS=claude,openai,local (défaut). Le suivant prend le relais si le premier échoue.
 * Seuls les fournisseurs configurés comptent : sans clé Claude ni OpenAI, l'IA locale répond seule.
 */
function chain(role: Role): Provider[] {
  const order = (env('AI_PROVIDERS') || 'claude,openai,local')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s in ALL);
  return [...new Set(order)].map((id) => ALL[id]).filter((p) => p.configured(role));
}

export function hasChatAI(): boolean {
  return chain('redaction').length > 0;
}

export function hasAI(): boolean {
  return chain('analyse').length > 0 && chain('redaction').length > 0;
}

/** Fournisseurs actifs, pour les outils de contrôle (jamais pour le navigateur). */
export function activeProviders(): {
  id: string;
  label: string;
  analyse: string;
  redaction: string;
}[] {
  return Object.values(ALL)
    .filter((p) => p.configured('analyse') || p.configured('redaction'))
    .map((p) => ({
      id: p.id,
      label: p.label,
      analyse: p.model('analyse'),
      redaction: p.model('redaction'),
    }));
}

function friendly(status: number): string {
  if (status === 429) return "Le service d'IA est très demandé. Réessaie dans un instant.";
  return "Le service d'IA ne répond pas pour le moment. Réessaie dans un instant.";
}

/**
 * Compteur quotidien (par serveur, remis à zéro chaque jour UTC). Renvoie true quand le plafond lu dans
 * la variable d'environnement est atteint ; sinon compte la demande. Un plafond à 0 désactive le compteur.
 */
export function dailyCounter(envName: string, fallback: number): () => boolean {
  const daily = { day: '', count: 0 };
  return () => {
    const limit = Number(process.env[envName] ?? fallback);
    if (!Number.isFinite(limit) || limit <= 0) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (daily.day !== today) {
      daily.day = today;
      daily.count = 0;
    }
    if (daily.count >= limit) return true;
    daily.count++;
    return false;
  };
}

// Plafond quotidien de tentatives fournisseur : filet de sécurité pour le budget, même si quelqu'un
// contourne les autres protections. AI_DAILY_LIMIT=0 désactive le plafond.
export const dailyLimitReached = dailyCounter('AI_DAILY_LIMIT', 1000);

export async function callAI(
  role: Role,
  system: string,
  user: string,
  maxTokens: number,
  premium = true,
): Promise<string> {
  const providers = chain(role);
  if (!providers.length) throw new ProviderError("Aucun service d'IA n'est configuré.");
  const timeout = Number(process.env.PROVIDER_TIMEOUT_MS) || 30000;
  let lastStatus = 0;

  for (const p of providers) {
    // Compte chaque requête envoyée à un fournisseur, y compris les replis après erreur.
    if (dailyLimitReached()) {
      console.error('[ia] plafond quotidien AI_DAILY_LIMIT atteint');
      throw new ProviderError(
        "Six a atteint sa limite d'utilisation pour aujourd'hui. Réessaie demain.",
      );
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      return await p.call(p.model(role, premium), system, user, maxTokens, ctl.signal);
    } catch (e) {
      lastStatus = e instanceof HttpFailure ? e.status : 0;
      // Journal technique sans aucun contenu de conversation ni clé.
      console.error(`[ia] ${p.id} (${role}) a échoué : ${lastStatus || 'réseau ou délai'}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ProviderError(friendly(lastStatus));
}

/**
 * Appel multi-tours pour le chat Seven AI : le même prompt système, puis l'historique de la
 * conversation et le nouveau message de l'utilisateur. Mêmes fournisseurs, même bascule,
 * même plafond quotidien que callAI.
 */
export async function callChat(
  system: string,
  user: string,
  history: ChatMessage[],
  maxTokens: number,
  premium = true,
  images?: ImageJointe[],
): Promise<string> {
  const providers = chain('redaction');
  if (!providers.length) throw new ProviderError("Aucun service d'IA n'est configuré.");
  // Une réponse longue (rapport de Cosinus) prend plus de temps à écrire : le délai suit la longueur demandée
  // (environ 18 ms par jeton), sans descendre sous PROVIDER_TIMEOUT_MS. L'app attend 120 s au plus.
  const timeout = Math.max(
    Number(process.env.PROVIDER_TIMEOUT_MS) || 30000,
    Math.min(80000, maxTokens * 18),
  );
  let lastStatus = 0;

  for (const p of providers) {
    if (dailyLimitReached()) {
      console.error('[ia] plafond quotidien AI_DAILY_LIMIT atteint');
      throw new ProviderError(
        "Six a atteint sa limite d'utilisation pour aujourd'hui. Réessaie demain.",
      );
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      return await p.call(
        p.model('redaction', premium),
        system,
        user,
        maxTokens,
        ctl.signal,
        history,
        images,
      );
    } catch (e) {
      lastStatus = e instanceof HttpFailure ? e.status : 0;
      // Journal technique sans aucun contenu de conversation ni clé.
      console.error(`[ia] ${p.id} (chat) a échoué : ${lastStatus || 'réseau ou délai'}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ProviderError(friendly(lastStatus));
}

/* ---------- Agent Cosinus : appels avec outils (Claude et IA locale) ---------- */

type AppelAvecOutils = (
  model: string,
  system: string,
  messages: MessageAgent[],
  outils: OutilSchema[],
  maxTokens: number,
  signal: AbortSignal,
) => Promise<ReponseAgent>;

const nouvelIdAppel = () => `appel_${Math.random().toString(36).slice(2, 10)}`;

/** Claude : blocs tool_use / tool_result. Les résultats d'outils consécutifs vont dans un seul message « user ». */
const claudeOutils: AppelAvecOutils = async (
  model,
  system,
  messages,
  outils,
  maxTokens,
  signal,
) => {
  const client = new Anthropic({
    apiKey: env('ANTHROPIC_API_KEY'),
    maxRetries: 0,
    fetch: (input, init) => globalThis.fetch(input, init),
  });
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      msgs.push({
        role: 'user',
        content: m.images?.length
          ? [
              ...m.images.map((i) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: i.type, data: i.data },
              })),
              { type: 'text' as const, text: m.content },
            ]
          : m.content,
      });
    } else if (m.role === 'assistant') {
      const blocs: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (m.content.trim()) blocs.push({ type: 'text', text: m.content });
      for (const a of m.appels ?? [])
        blocs.push({ type: 'tool_use', id: a.id, name: a.nom, input: a.args });
      msgs.push({ role: 'assistant', content: blocs.length ? blocs : m.content || '…' });
    } else {
      const bloc: Anthropic.Beta.BetaToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: m.id,
        content: m.content,
      };
      const dernier = msgs.at(-1);
      if (
        dernier?.role === 'user' &&
        Array.isArray(dernier.content) &&
        dernier.content.every((b) => b.type === 'tool_result')
      )
        (dernier.content as Anthropic.Beta.BetaContentBlockParam[]).push(bloc);
      else msgs.push({ role: 'user', content: [bloc] });
    }
  }
  try {
    const msg = await client.beta.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: msgs,
        tools: outils.map((o) => ({
          name: o.nom,
          description: o.description,
          input_schema: o.parametres as Anthropic.Beta.BetaTool.InputSchema,
        })),
      },
      { signal },
    );
    logUsage(msg.model, msg.usage);
    if (msg.stop_reason === 'refusal') throw new HttpFailure(451);
    const texte = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const appels = msg.content.flatMap((b) =>
      b.type === 'tool_use'
        ? [{ id: b.id, nom: b.name, args: (b.input ?? {}) as Record<string, unknown> }]
        : [],
    );
    return { texte, appels };
  } catch (e) {
    if (e instanceof HttpFailure) throw e;
    if (e instanceof Anthropic.APIError && typeof e.status === 'number')
      throw new HttpFailure(e.status);
    throw new HttpFailure(0);
  }
};

/** IA locale (Ollama) : champ « tools », réponses message.tool_calls, résultats en messages « tool ». */
const localOutils: AppelAvecOutils = async (model, system, messages, outils, maxTokens, signal) => {
  const base = (env('IA_LOCALE_URL') || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const msgs = [
    { role: 'system', content: system },
    ...messages.map((m) =>
      m.role === 'user'
        ? {
            role: 'user',
            content: m.content,
            ...(m.images?.length ? { images: m.images.map((i) => i.data) } : {}),
          }
        : m.role === 'assistant'
          ? {
              role: 'assistant',
              content: m.content,
              ...(m.appels?.length
                ? {
                    tool_calls: m.appels.map((a) => ({
                      function: { name: a.nom, arguments: a.args },
                    })),
                  }
                : {}),
            }
          : { role: 'tool', content: m.content, tool_name: m.nom },
    ),
  ];
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: env('IA_LOCALE_GARDER') || '30m',
        options: { num_predict: maxTokens, num_ctx: Number(env('IA_LOCALE_CONTEXTE')) || 8192 },
        messages: msgs,
        ...(outils.length
          ? {
              tools: outils.map((o) => ({
                type: 'function',
                function: { name: o.nom, description: o.description, parameters: o.parametres },
              })),
            }
          : {}),
      }),
    });
  } catch {
    throw new HttpFailure(0);
  }
  if (!res.ok) throw new HttpFailure(res.status);
  const data = (await res.json()) as {
    message?: {
      content?: string;
      tool_calls?: { function?: { name?: string; arguments?: Record<string, unknown> | string } }[];
    };
  };
  const appels = (data.message?.tool_calls ?? []).flatMap((t) => {
    const nom = t.function?.name;
    if (!nom) return [];
    let args = t.function?.arguments ?? {};
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args) as Record<string, unknown>;
      } catch {
        args = {};
      }
    }
    return [{ id: nouvelIdAppel(), nom, args }];
  });
  return { texte: data.message?.content ?? '', appels };
};

const AVEC_OUTILS: Record<string, AppelAvecOutils> = { claude: claudeOutils, local: localOutils };

/** Un fournisseur capable d'utiliser des outils est configuré (Claude ou IA locale). */
export function agentDisponible(): boolean {
  return chain('redaction').some((p) => p.id in AVEC_OUTILS);
}

/**
 * Un tour de l'agent : le modèle répond, ou demande des outils. Même bascule entre fournisseurs, même plafond
 * quotidien et même délai que callChat.
 */
export async function appelAgent(
  system: string,
  messages: MessageAgent[],
  outils: OutilSchema[],
  maxTokens: number,
  premium = true,
  annulation?: AbortSignal,
): Promise<ReponseAgent> {
  const providers = chain('redaction').filter((p) => p.id in AVEC_OUTILS);
  if (!providers.length) throw new ProviderError("Aucune IA capable d'agir n'est configurée.");
  const timeout = Math.max(
    Number(process.env.PROVIDER_TIMEOUT_MS) || 30000,
    Math.min(120000, maxTokens * 25),
  );
  let lastStatus = 0;
  for (const p of providers) {
    if (dailyLimitReached()) {
      console.error('[ia] plafond quotidien AI_DAILY_LIMIT atteint');
      throw new ProviderError(
        "Six a atteint sa limite d'utilisation pour aujourd'hui. Réessaie demain.",
      );
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    const arreter = () => ctl.abort();
    annulation?.addEventListener('abort', arreter);
    try {
      return await AVEC_OUTILS[p.id](
        p.model('redaction', premium),
        system,
        messages,
        outils,
        maxTokens,
        ctl.signal,
      );
    } catch (e) {
      if (annulation?.aborted) throw new ProviderError('Tâche arrêtée.');
      lastStatus = e instanceof HttpFailure ? e.status : 0;
      console.error(`[ia] ${p.id} (agent) a échoué : ${lastStatus || 'réseau ou délai'}`);
    } finally {
      clearTimeout(timer);
      annulation?.removeEventListener('abort', arreter);
    }
  }
  throw new ProviderError(friendly(lastStatus));
}
