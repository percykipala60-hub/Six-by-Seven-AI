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
};
export const PROVIDER_NAMES = Object.keys(PRESETS);
/**
 * Configurations d'un fournisseur. Plusieurs modèles possibles, séparés par des virgules :
 * OLLAMA_MODEL=llama3.2:3b,mistral:7b → deux configurations, comparées côte à côte.
 * Ollama est toujours proposé (local) ; les autres seulement si leur clé est présente.
 */
export function providerConfigs(name, env) {
    const preset = PRESETS[name];
    const apiKey = preset.keyVar ? env[preset.keyVar]?.trim() : undefined;
    if (preset.keyVar && !apiKey)
        return [];
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
export function providerFromEnv(name, env) {
    return providerConfigs(name, env)[0];
}
/**
 * Désigne un modèle précis, par exemple pour le vérificateur :
 *   « mistral:7b »                 → modèle Ollama local
 *   « groq/llama-3.3-70b-versatile » → modèle d'un fournisseur en ligne (clé requise)
 */
export function modelRef(ref, env) {
    const slash = ref.indexOf('/');
    const prefix = slash > 0 ? ref.slice(0, slash) : '';
    const isProvider = PROVIDER_NAMES.includes(prefix) && prefix !== 'ollama';
    const name = isProvider ? prefix : 'ollama';
    const model = isProvider ? ref.slice(slash + 1) : ref.replace(/^ollama\//, '');
    const base = providerFromEnv(name, env);
    return base ? { ...base, model } : undefined;
}
//# sourceMappingURL=providers.js.map