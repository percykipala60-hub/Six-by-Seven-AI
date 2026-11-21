import type { Moteur } from '@six/shared';
import type { Env } from '../env.js';
import type { ProviderConfig } from './openai-compatible.js';

function claude(env: Env, model: string): ProviderConfig | undefined {
  if (!env.ANTHROPIC_API_KEY) return undefined;
  return {
    name: 'claude',
    format: 'anthropic',
    baseUrl: env.ANTHROPIC_URL,
    model,
    apiKey: env.ANTHROPIC_API_KEY,
    cloud: true,
    timeoutMs: 30_000,
  };
}

function ollama(env: Env, model?: string): ProviderConfig {
  return {
    name: 'ollama',
    baseUrl: env.OLLAMA_URL,
    model: model ?? (env.OLLAMA_MODEL.split(',')[0]?.trim() || 'llama3.2:3b'),
    cloud: false,
    timeoutMs: env.OLLAMA_TIMEOUT_S * 1000,
  };
}

/**
 * Le modèle qui rédige pour l'app. La clé reste sur le serveur : elle n'est jamais envoyée
 * au téléphone ni écrite dans les logs.
 */
export function serverProvider(env: Env): ProviderConfig | undefined {
  if (env.AI_PROVIDER === 'ollama') return ollama(env);
  if (env.AI_PROVIDER === 'anthropic') return claude(env, env.ANTHROPIC_MODEL);
  return claude(env, env.ANTHROPIC_MODEL) ?? ollama(env);
}

/**
 * Moteur choisi par l'utilisateur. « confidentiel » n'utilise QUE le serveur local (Ollama) :
 * jamais de repli vers un service tiers, même s'il est lent ou éteint.
 */
export function providerFor(env: Env, moteur: Moteur = 'auto'): ProviderConfig | undefined {
  if (env.AI_PROVIDER === 'ollama' || moteur === 'confidentiel') {
    return moteur === 'rapide' ? ollama(env, env.OLLAMA_MODEL_RAPIDE) : ollama(env);
  }
  if (moteur === 'qualite') {
    return claude(env, env.ANTHROPIC_MODEL_QUALITE) ?? serverProvider(env);
  }
  if (moteur === 'rapide') {
    return claude(env, env.ANTHROPIC_MODEL) ?? ollama(env, env.OLLAMA_MODEL_RAPIDE);
  }
  return serverProvider(env);
}
