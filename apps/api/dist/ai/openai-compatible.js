import { ReplySuggestionsSchema } from '@six/shared';
import { buildMessages } from './prompt.js';
/** Version d'API exigée par Anthropic (docs : platform.claude.com/docs/en/api/messages). */
export const ANTHROPIC_VERSION = '2023-06-01';
/** Erreur classée : l'app pourra afficher un message clair et basculer sur un autre fournisseur. */
export class ProviderError extends Error {
    kind;
    status;
    constructor(kind, message, status) {
        super(message);
        this.kind = kind;
        this.status = status;
        this.name = 'ProviderError';
    }
}
/**
 * Extrait l'objet JSON d'une réponse de modèle. Les petits modèles ajoutent souvent
 * des balises ```json ou une phrase avant : on prend le premier « { » jusqu'au dernier « } ».
 */
export function extractJson(raw) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start)
        throw new ProviderError('bad_output', 'Aucun JSON dans la réponse');
    try {
        return JSON.parse(raw.slice(start, end + 1));
    }
    catch {
        throw new ProviderError('bad_output', 'JSON illisible dans la réponse');
    }
}
function classifyHttp(status, body, contentType) {
    // Un pare-feu, un proxy ou un portail Wi-Fi répond souvent 403 en texte ou en HTML :
    // ce n'est pas la clé qui est en cause, c'est le réseau.
    if (status === 403 && !contentType.includes('json')) {
        return new ProviderError('network', 'Accès bloqué par le réseau (pare-feu, proxy ou Wi-Fi)', status);
    }
    if (status === 401 || status === 403)
        return new ProviderError('auth', 'Clé API refusée', status);
    if (status === 429)
        return new ProviderError('rate_limit', 'Limite de requêtes atteinte', status);
    // 529 : Claude surchargé, réessayable comme une limite de débit.
    if (status === 529)
        return new ProviderError('rate_limit', 'Service surchargé', status);
    if (status === 404 && /model/i.test(body)) {
        return new ProviderError('model_missing', 'Modèle introuvable (vérifie le nom)', status);
    }
    return new ProviderError('http', `Erreur HTTP ${status}`, status);
}
/**
 * Appel brut au format OpenAI : envoie les messages, renvoie le texte du modèle et le temps.
 * Toutes les erreurs sont converties en ProviderError classées.
 */
export async function callChat(config, messages, fetchImpl = fetch, options = {}) {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 60_000);
    const base = config.baseUrl.replace(/\/$/, '');
    const anthropic = config.format === 'anthropic';
    // Claude : le message système est un champ à part ; les autres rôles restent dans l'ordre.
    const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');
    const request = anthropic
        ? {
            url: `${base}/v1/messages`,
            headers: {
                'content-type': 'application/json',
                'anthropic-version': ANTHROPIC_VERSION,
                ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
            },
            body: {
                model: config.model,
                max_tokens: options.maxTokens ?? 1024,
                temperature: options.temperature ?? 0.5,
                ...(system ? { system } : {}),
                messages: messages.filter((m) => m.role !== 'system'),
            },
        }
        : undefined;
    let response;
    try {
        response = await fetchImpl(request?.url ?? `${base}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: request?.headers ?? {
                'content-type': 'application/json',
                ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
            },
            body: JSON.stringify(request?.body ?? {
                model: config.model,
                messages,
                temperature: options.temperature ?? 0.5,
                ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
                // Respecté par Ollama, Groq et Mistral ; ignoré sans erreur par Gemini.
                response_format: { type: 'json_object' },
            }),
        });
    }
    catch (error) {
        clearTimeout(timer);
        if (controller.signal.aborted)
            throw new ProviderError('timeout', 'Pas de réponse à temps');
        throw new ProviderError('network', `Injoignable (${error instanceof Error ? error.message : 'erreur réseau'})`);
    }
    try {
        const text = await response.text();
        if (!response.ok) {
            throw classifyHttp(response.status, text, response.headers.get('content-type') ?? '');
        }
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            throw new ProviderError('bad_output', 'Réponse du fournisseur illisible');
        }
        const content = anthropic
            ? parsed.content
                ?.filter((block) => block.type === 'text')
                .map((block) => block.text ?? '')
                .join('')
            : parsed.choices?.[0]?.message?.content;
        if (!content)
            throw new ProviderError('bad_output', 'Réponse vide');
        return { content, latencyMs: Math.round(performance.now() - started) };
    }
    catch (error) {
        if (controller.signal.aborted)
            throw new ProviderError('timeout', 'Pas de réponse à temps');
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Un seul adaptateur pour tous les fournisseurs qui parlent le format OpenAI :
 * Ollama (local), Groq, Gemini, Mistral. Changer de fournisseur = changer la config.
 */
export async function generateReplies(config, request, fetchImpl = fetch) {
    const { content, latencyMs } = await callChat(config, buildMessages(request), fetchImpl);
    const parsed = ReplySuggestionsSchema.safeParse(extractJson(content));
    if (!parsed.success) {
        throw new ProviderError('bad_output', 'Le modèle n’a pas renvoyé exactement 3 réponses valides');
    }
    return { provider: config.name, model: config.model, latencyMs, suggestions: parsed.data };
}
//# sourceMappingURL=openai-compatible.js.map