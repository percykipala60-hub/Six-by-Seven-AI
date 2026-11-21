import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError, activeProviders, callAI, hasAI } from '@/lib/ai';
import { analyze } from '@/lib/providers';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const okClaude = () =>
  json({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text: 'réponse claude' }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 12,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 700,
    },
  });
const okOpenAI = () => json({ choices: [{ message: { content: 'réponse openai' } }] });

beforeEach(() => {
  for (const k of [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'OPENAI_MODEL_ANALYSE',
    'OPENAI_MODEL_REDACTION',
    'AI_PROVIDERS',
  ]) {
    vi.stubEnv(k, '');
  }
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fournisseurs d'IA", () => {
  it('compte chaque fournisseur appelé dans le plafond quotidien, y compris un repli', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    vi.stubEnv('OPENAI_API_KEY', 'b');
    vi.stubEnv('OPENAI_MODEL', 'm');
    vi.stubEnv('AI_DAILY_LIMIT', '1');
    const fetchMock = vi.fn(async () =>
      json({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }, 529),
    );
    vi.stubGlobal('fetch', fetchMock);
    const error = await callAI('analyse', 'sys', 'user', 100).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.message).toContain("limite d'utilisation");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("n'est pas actif sans clé", () => {
    expect(hasAI()).toBe(false);
    expect(activeProviders()).toEqual([]);
  });

  it('OpenAI exige un nom de modèle en plus de la clé', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    expect(hasAI()).toBe(false);
    vi.stubEnv('OPENAI_MODEL', 'modele-choisi');
    expect(hasAI()).toBe(true);
  });

  it("utilise Claude en premier et envoie la clé dans l'en-tête seulement", async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'cle-claude-secrete');
    const fetchMock = vi.fn(async () => okClaude());
    vi.stubGlobal('fetch', fetchMock);
    expect(await callAI('redaction', 'sys', 'user', 100)).toBe('réponse claude');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit];
    expect(String(url)).toContain('anthropic.com');
    expect(new Headers(init.headers).get('x-api-key')).toBe('cle-claude-secrete');
    expect(String(init.body)).not.toContain('cle-claude-secrete');
  });

  it('bascule sur ChatGPT quand Claude échoue', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    vi.stubEnv('OPENAI_API_KEY', 'b');
    vi.stubEnv('OPENAI_MODEL', 'm');
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes('anthropic')
        ? json({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }, 529)
        : okOpenAI(),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await callAI('analyse', 'sys', 'user', 100)).toBe('réponse openai');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ne relance pas une panne fournisseur comme si le JSON était invalide', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    const fetchMock = vi.fn(async () =>
      json({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }, 529),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(analyze('Autre: Salut')).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respecte l'ordre AI_PROVIDERS", async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    vi.stubEnv('OPENAI_API_KEY', 'b');
    vi.stubEnv('OPENAI_MODEL', 'm');
    vi.stubEnv('AI_PROVIDERS', 'openai,claude');
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes('openai') ? okOpenAI() : okClaude(),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await callAI('analyse', 'sys', 'user', 100)).toBe('réponse openai');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renvoie un message clair, sans clé ni détail technique, quand tout échoue', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'cle-claude-secrete');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ type: 'error', error: { type: 'authentication_error', message: 'x' } }, 401),
      ),
    );
    const err = await callAI('analyse', 'sys', 'user', 100).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).not.toMatch(/cle-claude-secrete|401|anthropic/i);
  });

  it('met le prompt système en cache et active le repli serveur pour Sonnet 5.5', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    const fetchMock = vi.fn(async () => okClaude());
    vi.stubGlobal('fetch', fetchMock);
    await callAI('redaction', 'PROMPT SYSTÈME STABLE', 'conversation variable', 100);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.system).toEqual([
      { type: 'text', text: 'PROMPT SYSTÈME STABLE', cache_control: { type: 'ephemeral' } },
    ]);
    expect(body.messages).toEqual([{ role: 'user', content: 'conversation variable' }]);
    expect(body.cache_control).toBeUndefined(); // pas de cache automatique sur la conversation, qui change à chaque fois
    expect(body.fallbacks).toBe('default');
    expect(new Headers(init.headers).get('anthropic-beta')).toContain(
      'server-side-fallback-2026-07-01',
    );
  });

  it('ne demande pas de repli serveur pour Haiku (analyse)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    const fetchMock = vi.fn(async () => okClaude());
    vi.stubGlobal('fetch', fetchMock);
    await callAI('analyse', 'sys', 'user', 100);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit];
    expect(JSON.parse(String(init.body)).fallbacks).toBeUndefined();
  });

  it('traite un refus du modèle comme un échec et bascule', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'a');
    vi.stubEnv('OPENAI_API_KEY', 'b');
    vi.stubEnv('OPENAI_MODEL', 'm');
    const refus = () =>
      json({
        id: 'm',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5',
        content: [],
        stop_reason: 'refusal',
        usage: { input_tokens: 1, output_tokens: 0 },
      });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) =>
        String(url).includes('anthropic') ? refus() : okOpenAI(),
      ),
    );
    expect(await callAI('analyse', 'sys', 'user', 100)).toBe('réponse openai');
  });
});
