import type { ProviderConfig } from './openai-compatible.js';

/**
 * Fournisseurs pour les essais. Chacun est actif seulement si sa variable est remplie dans .env.
 * Les modèles par défaut sont vérifiés au 1er octobre 2026 ; ils se changent dans .env.
 */
interface Preset {
  baseUrl: string;
  defaultModel: string;
  keyVar?: string;
  modelVar: string;
  urlVar?: string;
  cloud: boolean;
}

export const PRESETS = {
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2:3b',
    urlVar: 'OLLAMA_URL',
    modelVar: 'OLLAMA_MODEL',
    cloud: false,
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyVar: 'GROQ_API_KEY',
    modelVar: 'GROQ_MODEL',
    cloud: true,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.5-flash',
    keyVar: 'GEMINI_API_KEY',
    modelVar: 'GEMINI_MODEL',
    cloud: true,
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    keyVar: 'MISTRAL_API_KEY',
    modelVar: 'MISTRAL_MODEL',
    cloud: true,
  },
} as const satisfies Record<string, Preset>;

export type ProviderName = keyof typeof PRESETS;
export const PROVIDER_NAMES = Object.keys(PRESETS) as ProviderName[];

/**
 * Configurations d'un fournisseur. Plusieurs modèles possibles, séparés par des virgules :
 * OLLAMA_MODEL=llama3.2:3b,mistral:7b → deux configurations, comparées côte à côte.
 * Ollama est toujours proposé (local) ; les autres seulement si leur clé est présente.
 */
export function providerConfigs(
  name: ProviderName,
  env: Record<string, string | undefined>,
): ProviderConfig[] {
  const preset: Preset = PRESETS[name];
  const apiKey = preset.keyVar ? env[preset.keyVar]?.trim() : undefined;
  if (preset.keyVar && !apiKey) return [];
  const baseUrl = (preset.urlVar && env[preset.urlVar]?.trim()) || preset.baseUrl;
  const models = (env[preset.modelVar] ?? '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return (models.length > 0 ? models : [preset.defaultModel]).map((model) => ({
    name,
    baseUrl,
    model,
    cloud: preset.cloud,
    // En local sans carte graphique, un modèle 7B peut dépasser 3 minutes.
    timeoutMs: preset.cloud ? 30_000 : Number(env.OLLAMA_TIMEOUT_S ?? 600) * 1000,
    ...(apiKey ? { apiKey } : {}),
  }));
}

/** Premier modèle configuré d'un fournisseur (pratique pour les tests). */
export function providerFromEnv(
  name: ProviderName,
  env: Record<string, string | undefined>,
): ProviderConfig | undefined {
  return providerConfigs(name, env)[0];
}

/**
 * Désigne un modèle précis, par exemple pour le vérificateur :
 *   « mistral:7b »                 → modèle Ollama local
 *   « groq/llama-3.3-70b-versatile » → modèle d'un fournisseur en ligne (clé requise)
 */
export function modelRef(
  ref: string,
  env: Record<string, string | undefined>,
): ProviderConfig | undefined {
  const slash = ref.indexOf('/');
  const prefix = slash > 0 ? ref.slice(0, slash) : '';
  const isProvider = (PROVIDER_NAMES as string[]).includes(prefix) && prefix !== 'ollama';
  const name: ProviderName = isProvider ? (prefix as ProviderName) : 'ollama';
  const model = isProvider ? ref.slice(slash + 1) : ref.replace(/^ollama\//, '');
  const base = providerFromEnv(name, env);
  return base ? { ...base, model } : undefined;
}
