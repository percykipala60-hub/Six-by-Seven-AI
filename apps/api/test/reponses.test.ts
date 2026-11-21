import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { maskConversation, ReplyApiResponseSchema } from '@six/shared';
import { buildApp } from '../src/app.js';
import { callChat, type ProviderConfig } from '../src/ai/openai-compatible.js';
import { serverProvider } from '../src/ai/server-provider.js';
import { testEnv } from './helpers.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const DRAFTS = {
  reflexion: { relation: 'amie proche', registre: 'tu' },
  resume: '[NOM 1] demande si tu viens samedi.',
  reponses: [
    { style: 'Directe', texte: 'Oui [NOM 1], je viens samedi !' },
    { style: 'Question', texte: 'Ça commence à quelle heure ?' },
    { style: 'Prudente', texte: 'Je te confirme demain.' },
  ],
};

/** Faux modèle au format OpenAI ; garde ce qu'il a reçu pour vérifier le masquage. */
function fakeModel(content: unknown) {
  const received: string[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    received.push(String(init?.body ?? ''));
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return { fetchImpl, received };
}

const provider: ProviderConfig = { name: 'faux', baseUrl: 'http://faux', model: 'm', cloud: false };

const conversation = maskConversation(
  [
    '01/10/2026 21:02 - Mariane🤍: Coucou ! Tu viens samedi chez moi ?',
    '01/10/2026 21:03 - Vous: je vois',
    '01/10/2026 21:04 - Mariane🤍: Appelle-moi au 0812345678 pour confirmer',
  ].join('\n'),
).masked;

describe('POST /v1/reponses', () => {
  it('renvoie 3 brouillons conformes au contrat, avec la réflexion', async () => {
    const model = fakeModel(DRAFTS);
    app = await buildApp(testEnv(), { provider, fetchImpl: model.fetchImpl });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reponses',
      payload: { conversation, moi: 'Vous' },
    });
    expect(res.statusCode).toBe(200);
    const body = ReplyApiResponseSchema.parse(res.json());
    expect(body.reponses).toHaveLength(3);
    expect(body.reponses[0]?.texte).toContain('[NOM 1]'); // le téléphone remettra « Mariane »
    // « [NOM 1] » est un auteur du fil : ce n'est pas un remplaçant inventé.
    expect(body.avertissements).toEqual([]);
    expect(body.arnaque.niveau).toBe('aucun');
    expect(body.reflexion?.relation).toBe('amie proche');
    expect(body.bouclier).toBe(false);
  });

  it('le modèle ne reçoit jamais un vrai nom ni un vrai numéro', async () => {
    const model = fakeModel(DRAFTS);
    app = await buildApp(testEnv(), { provider, fetchImpl: model.fetchImpl });
    await app.inject({ method: 'POST', url: '/v1/reponses', payload: { conversation } });
    const sent = model.received.join('\n');
    expect(sent).not.toContain('Mariane');
    expect(sent).not.toContain('0812345678');
  });

  it('2e passe serveur : un numéro oublié par le téléphone est masqué quand même', async () => {
    const model = fakeModel(DRAFTS);
    app = await buildApp(testEnv(), { provider, fetchImpl: model.fetchImpl });
    await app.inject({
      method: 'POST',
      url: '/v1/reponses',
      payload: { conversation: 'Ami: mon nouveau numéro c’est +243 99 876 5432, note-le' },
    });
    expect(model.received.join('\n')).not.toMatch(/876/);
  });

  it('arnaque certaine : bouclier, aucune IA appelée, raisons sans pourcentage', async () => {
    const model = fakeModel(DRAFTS);
    app = await buildApp(testEnv(), { provider, fetchImpl: model.fetchImpl });
    const scam = maskConversation(
      '01/10/2026 09:41 - +243 81 234 5647: Service M-Pesa : votre compte sera bloqué. Envoyez votre code PIN.',
    ).masked;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reponses',
      payload: { conversation: scam },
    });
    const body = ReplyApiResponseSchema.parse(res.json());
    expect(model.received).toHaveLength(0);
    expect(body.bouclier).toBe(true);
    expect(body.arnaque.niveau).toBe('eleve');
    expect(body.arnaque.raisons.join(' ')).not.toMatch(/%/);
    expect(body.reponses.map((r) => r.texte).join(' ')).toMatch(/code/i);
  });

  it('refuse une requête invalide sans répéter son contenu', async () => {
    app = await buildApp(testEnv(), { provider });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reponses',
      payload: { conversation: '', ton: 'SECRET-xyz' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('SECRET-xyz');
  });

  it('refuse une conversation trop longue', async () => {
    app = await buildApp(testEnv(), { provider });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reponses',
      payload: { conversation: 'a'.repeat(6001) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('les logs ne contiennent aucun mot de la conversation ni des brouillons', async () => {
    let logs = '';
    const stream = new Writable({
      write(chunk, _encoding, done) {
        logs += String(chunk);
        done();
      },
    });
    const model = fakeModel(DRAFTS);
    app = await buildApp(testEnv({ LOG_LEVEL: 'info' }), {
      provider,
      fetchImpl: model.fetchImpl,
      logStream: stream,
    });
    await app.inject({
      method: 'POST',
      url: '/v1/reponses',
      payload: { conversation: 'Ami: rendez-vous au marché Gambela demain', moi: 'Vous' },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/retour',
      payload: { utile: true, brouillon: 1, version: 'x' },
    });
    expect(logs).toContain('"reponses"');
    for (const word of ['Gambela', 'rendez-vous', 'samedi', 'Directe'])
      expect(logs).not.toContain(word);
  });
});

describe('POST /v1/retour', () => {
  it('accepte utile oui/non et refuse tout texte en plus', async () => {
    app = await buildApp(testEnv(), { provider });
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/retour',
      payload: { utile: false, version: 'agent-six-v0.4' },
    });
    expect(ok.statusCode).toBe(204);
    const bad = await app.inject({ method: 'POST', url: '/v1/retour', payload: { utile: 'oui' } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('Claude (API Messages d’Anthropic)', () => {
  it('envoie la clé dans x-api-key, la version, et le système à part', async () => {
    let seen:
      { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen = {
        url,
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok":1}' }] }), {
        status: 200,
      });
    }) as typeof fetch;
    const claude = serverProvider(testEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' }));
    expect(claude?.name).toBe('claude');
    const { content } = await callChat(
      claude as ProviderConfig,
      [
        { role: 'system', content: 'règles' },
        { role: 'user', content: 'bonjour' },
      ],
      fetchImpl,
      { maxTokens: 300 },
    );
    expect(content).toBe('{"ok":1}');
    expect(seen?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(seen?.headers['x-api-key']).toBe('sk-ant-test');
    expect(seen?.headers['anthropic-version']).toBe('2023-06-01');
    expect(seen?.headers.authorization).toBeUndefined();
    expect(seen?.body.system).toBe('règles');
    expect(seen?.body.messages).toEqual([{ role: 'user', content: 'bonjour' }]);
    expect(seen?.body.max_tokens).toBe(300);
  });

  it('sans clé, l’app utilise Ollama en local (rien ne sort de la machine)', () => {
    const local = serverProvider(testEnv());
    expect(local?.name).toBe('ollama');
    expect(local?.cloud).toBe(false);
  });
});
