import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  tensionSignals,
  toneSignals,
  AnalyseResponseSchema,
  CoachResponseSchema,
  SujetsResponseSchema,
  TexteResponseSchema,
  TonResponseSchema,
} from '@six/shared';
import { buildApp } from '../src/app.js';
import type { ProviderConfig } from '../src/ai/openai-compatible.js';
import { providerFor } from '../src/ai/server-provider.js';
import { ajuster, analyse, coach, coachByCode, sujets, verifierTon } from '../src/agent/outils.js';
import { testEnv } from './helpers.js';

const config: ProviderConfig = { name: 'faux', baseUrl: 'http://faux', model: 'm', cloud: false };

/** Faux modèle : renvoie les réponses dans l'ordre, et garde ce qu'il a reçu. */
function script(...answers: (unknown | Error)[]) {
  const received: string[] = [];
  let i = 0;
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    received.push(String(init?.body ?? ''));
    const answer = answers[Math.min(i++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    const content = typeof answer === 'string' ? answer : JSON.stringify(answer);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, received, calls: () => received.length };
}

const fil = [
  '01/10/2026 21:02 - [NOM 1]: Tu peux m’envoyer le dossier avant 17h ?',
  '01/10/2026 21:03 - Vous: je regarde',
  '01/10/2026 21:10 - [NOM 1]: Sérieux ??? Le chef me met la pression !!!',
].join('\n');

describe('analyse (compréhension et objectifs)', () => {
  it('donne tension, intention, objectifs et une question utile', async () => {
    const model = script({
      resume: '[NOM 1] veut le dossier avant 17h.',
      tension: 'calme',
      intention: 'Recevoir le dossier',
      ton: 'Pressé',
      objectifs: ['Gagner du temps', 'Promettre une heure', 'Dire non poliment'],
      question: { texte: 'Le dossier est-il prêt ?', options: ['Oui', 'Presque', 'Non'] },
    });
    const result = AnalyseResponseSchema.parse(
      await analyse(config, { conversation: fil, moi: 'Vous', langue: 'fr' }, model),
    );
    // « Sérieux ??? … !!! » : le code impose au moins « tendu », même si le modèle dit « calme ».
    expect(result.tension).toBe('tendu');
    expect(result.objectifs[0]).toBe('Gagner du temps');
    expect(result.question?.options).toEqual(['Oui', 'Presque', 'Non']);
    expect(result.interlocuteur).toBe('[NOM 1]');
  });

  it('refuse un résumé qui invente une heure', async () => {
    const model = script({
      resume: '[NOM 1] veut le dossier avant 9h.',
      objectifs: ['A', 'B'],
    });
    const result = await analyse(config, { conversation: fil, moi: 'Vous', langue: 'fr' }, model);
    expect(result.resume).not.toContain('9h');
  });

  it('arnaque certaine : bouclier, aucun appel au modèle', async () => {
    const model = script({});
    const result = await analyse(
      config,
      {
        conversation: '[TEL 1]: Votre compte M-Pesa sera bloqué. Envoyez votre code PIN.',
        langue: 'fr',
      },
      model,
    );
    expect(model.calls()).toBe(0);
    expect(result.bouclier).toBe(true);
    expect(result.objectifs[0]).toMatch(/Refuser/);
  });

  it('modèle en panne : objectifs par défaut, jamais d’écran vide', async () => {
    const model = script(new Error('réseau'));
    const result = await analyse(config, { conversation: fil, moi: 'Vous', langue: 'fr' }, model);
    expect(result.secours).toBe(true);
    expect(result.objectifs.length).toBeGreaterThanOrEqual(2);
  });

  it('repère la tension par des règles', () => {
    expect(tensionSignals(['ok merci'])).toBe('calme');
    expect(tensionSignals(['Tu réponds ?? c’est urgent'])).toBe('pressant');
    expect(tensionSignals(['Sérieux, n’importe quoi'])).toBe('tendu');
  });
});

describe('ajuster un brouillon', () => {
  it('applique la retouche demandée', async () => {
    const model = script({ texte: 'Ok, je t’envoie le dossier avant 17h.' });
    const result = TexteResponseSchema.parse(
      await ajuster(
        config,
        {
          conversation: fil,
          texte: 'Je vais voir pour le dossier.',
          consigne: 'plus-ferme',
          langue: 'fr',
        },
        model,
      ),
    );
    expect(result.texte).toBe('Ok, je t’envoie le dossier avant 17h.');
    expect(result.avertissements).toEqual([]);
  });

  it('une retouche qui invente une heure est renvoyée en correction', async () => {
    const model = script({ texte: 'Je te l’envoie à 9h.' }, { texte: 'Je te l’envoie avant 17h.' });
    const result = await ajuster(
      config,
      { conversation: fil, texte: 'Je te l’envoie.', consigne: 'plus-court', langue: 'fr' },
      model,
    );
    expect(model.calls()).toBe(2);
    expect(result.texte).toContain('17h');
  });

  it('modèle en panne : l’emoji est ajouté par le code', async () => {
    const model = script(new Error('réseau'));
    const result = await ajuster(
      config,
      { conversation: fil, texte: 'Ok je m’en occupe.', consigne: 'emoji', langue: 'fr' },
      model,
    );
    expect(result.texte).toBe('Ok je m’en occupe. 🙂');
    expect(result.secours).toBe(true);
  });
});

describe('mode Coach', () => {
  it('explique le brouillon', async () => {
    const model = script({
      points: [
        { type: 'empathique', titre: 'Tu le rassures', explication: 'Tu reconnais sa pression.' },
        { type: 'inconnu', titre: 'x', explication: 'type invalide, ignoré' },
      ],
    });
    const result = CoachResponseSchema.parse(
      await coach(config, { conversation: fil, texte: 'Désolé, tu l’as avant 17h.' }, model),
    );
    expect(result.points).toHaveLength(1);
    expect(result.points[0]?.type).toBe('empathique');
  });

  it('sans modèle, des repères vrais tirés du texte', () => {
    const points = coachByCode('Désolé, je t’envoie ça avant 17h, promis.');
    expect(points.map((p) => p.type)).toEqual(expect.arrayContaining(['empathique', 'assertif']));
  });
});

describe('vérificateur de ton', () => {
  it('majuscules et insulte : jamais « neutre », même si le modèle le dit', async () => {
    const model = script({ percu: 'neutre', explication: 'Ça va.', version: null });
    const result = TonResponseSchema.parse(
      await verifierTon(config, { texte: 'TU ES NUL, RÉPONDS !!', langue: 'fr' }, model),
    );
    expect(result.percu).toBe('agressif');
    expect(result.signaux.length).toBeGreaterThanOrEqual(2);
  });

  it('propose une version plus juste quand le ton est sec', async () => {
    const model = script({
      percu: 'sec',
      explication: 'Ça peut sonner comme un reproche.',
      version: 'Je te l’envoie à 17h30, promis. Merci de ta patience.',
    });
    const result = await verifierTon(
      config,
      { texte: 'Je t’ai dit que j’envoie à 17h30, arrête de me harceler.', langue: 'fr' },
      model,
    );
    expect(result.percu).toBe('sec');
    expect(result.version).toContain('Merci');
  });

  it('les signaux du code se lisent sans IA', () => {
    expect(toneSignals('Merci beaucoup, à demain').minimum).toBe('neutre');
    expect(toneSignals('Tu es toujours en retard !!').minimum).toBe('sec');
  });
});

describe('Quoi dire ?', () => {
  it('modèle en panne : des idées prêtes quand même', async () => {
    const model = script(new Error('réseau'));
    const result = SujetsResponseSchema.parse(
      await sujets(config, { categorie: 'reprendre-contact', langue: 'fr' }, model),
    );
    expect(result.secours).toBe(true);
    expect(result.sujets).toHaveLength(3);
  });
});

describe('moteur de Six', () => {
  it('« confidentiel » n’utilise jamais Claude, même avec une clé', () => {
    const env = testEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    expect(providerFor(env, 'confidentiel')?.name).toBe('ollama');
    expect(providerFor(env, 'qualite')?.model).toBe('claude-sonnet-5-5');
    expect(providerFor(env, 'auto')?.name).toBe('claude');
  });

  it('sans clé, « qualité » se replie sur le serveur local', () => {
    expect(providerFor(testEnv(), 'qualite')?.name).toBe('ollama');
  });
});

describe('routes des outils', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('/v1/ajuster exige une consigne ou des mots', async () => {
    app = await buildApp(testEnv(), { provider: config });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/ajuster',
      payload: { conversation: fil, texte: 'ok' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('aucun texte dans les logs des outils, numéro masqué avant le modèle', async () => {
    let logs = '';
    const stream = new Writable({
      write(chunk, _e, done) {
        logs += String(chunk);
        done();
      },
    });
    const model = script({ percu: 'neutre', explication: 'Neutre.', version: null });
    app = await buildApp(testEnv({ LOG_LEVEL: 'info' }), {
      provider: config,
      fetchImpl: model.fetchImpl,
      logStream: stream,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verifier-ton',
      payload: { texte: 'Rendez-vous à Gambela, appelle le 0998765432' },
    });
    expect(res.statusCode).toBe(200);
    expect(model.received.join('')).not.toContain('0998765432');
    expect(logs).toContain('"outil":"ton"');
    expect(logs).not.toContain('Gambela');
  });
});
