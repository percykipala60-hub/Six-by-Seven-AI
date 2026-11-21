import Anthropic from '@anthropic-ai/sdk';

// Fournisseurs d'IA (Claude, OpenAI/ChatGPT). Les clés ne vivent QUE dans les variables d'environnement du serveur :
// jamais dans le code, jamais dans le navigateur (aucune variable NEXT_PUBLIC_), jamais dans les logs.

export class ProviderError extends Error {}

export type Role = 'analyse' | 'redaction';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Provider {
  id: string;
  label: string;
  configured(role: Role): boolean;
  model(role: Role): string;
  call(
    model: string,
    system: string,
    user: string,
    maxTokens: number,
    signal: AbortSignal,
    history?: ChatMessage[],
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
  model: (role) =>
    role === 'analyse'
      ? env('CLAUDE_MODEL_ANALYSE') || 'claude-haiku-4-5-20251001'
      : env('CLAUDE_MODEL_REDACTION') || 'claude-sonnet-5-5',
  async call(model, system, user, maxTokens, signal, history) {
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
          messages: [...(history ?? []), { role: 'user' as const, content: user }],
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
  model: (role) =>
    (role === 'analyse' ? env('OPENAI_MODEL_ANALYSE') : env('OPENAI_MODEL_REDACTION')) ||
    env('OPENAI_MODEL'),
  async call(model, system, user, maxTokens, signal, history) {
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
          { role: 'user', content: user },
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

const ALL: Record<string, Provider> = { claude, openai };

/** Ordre d'essai : AI_PROVIDERS=claude,openai (défaut). Le suivant prend le relais si le premier échoue. */
function chain(role: Role): Provider[] {
  const order = (env('AI_PROVIDERS') || 'claude,openai')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s in ALL);
  return [...new Set(order)].map((id) => ALL[id]).filter((p) => p.configured(role));
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
      return await p.call(p.model(role), system, user, maxTokens, ctl.signal);
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
): Promise<string> {
  const providers = chain('redaction');
  if (!providers.length) throw new ProviderError("Aucun service d'IA n'est configuré.");
  const timeout = Number(process.env.PROVIDER_TIMEOUT_MS) || 30000;
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
      return await p.call(p.model('redaction'), system, user, maxTokens, ctl.signal, history);
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
