import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dropRepeatedWord, mergeRepair, relationHint, runAgent } from '../src/agent/agent.js';
import { checkDrafts } from '../src/agent/check.js';
import { extractFacts } from '../src/agent/facts.js';
import { detectScam, looksLikePhoneNumber } from '../src/agent/scam.js';
import { parseThread } from '../src/agent/thread.js';

describe('détecteur d’arnaques (règles)', () => {
  it.each([
    [
      'faux agent Mobile Money',
      'Cher client, votre compte Mobile Money sera bloqué dans 1 heure. Envoyez votre code PIN pour le réactiver.',
    ],
    [
      'code reçu par SMS',
      'Bonjour, je me suis trompé, je t’ai envoyé un code par erreur. Donne-moi le code reçu par SMS stp, urgent',
    ],
    [
      'faux recrutement',
      'Félicitations, offre d’emploi chez nous. Payez d’abord 20 $ de frais de dossier pour valider.',
    ],
    [
      'bourse fictive',
      'Bourse d’études au Canada : frais d’inscription de 50 000 FC à envoyer aujourd’hui.',
    ],
  ])('%s → risque élevé', (_name, message) => {
    expect(detectScam([message]).niveau).toBe('eleve');
  });

  it('donne des raisons lisibles, jamais un pourcentage', () => {
    const report = detectScam([
      'Faites vite ! Ne parlez de ce message à personne. Votre code PIN svp.',
    ]);
    expect(report.raisons.join(' ')).toMatch(/code PIN/);
    expect(report.raisons.join(' ')).toMatch(/secret/);
    expect(report.raisons.join(' ')).not.toMatch(/%/);
  });

  it.each([
    'Tu as fini ta partie du rapport ? Le prof veut tout demain à 8h.',
    'On se voit à l’église dimanche ?',
    'Mon code pour le projet ne compile pas, tu peux regarder ?',
    'Maman demande si tu peux passer ce soir.',
  ])('message normal → aucun risque : « %s »', (message) => {
    expect(detectScam([message]).niveau).toBe('aucun');
  });

  it('reconnaît un expéditeur qui s’affiche comme un numéro', () => {
    expect(looksLikePhoneNumber('+243 81 234 5647')).toBe(true);
    expect(looksLikePhoneNumber('Christelle')).toBe(false);
  });
});

describe('arnaques : retour du banc', () => {
  it('faux gain avec frais à payer d’abord : risque élevé', () => {
    const r = detectScam(
      ['Vous avez gagné 500 000 FC. Pour recevoir votre gain, envoyez d’abord 10 000 FC de frais.'],
      true,
    );
    expect(r.niveau).toBe('eleve');
  });

  it('« j’ai changé de numéro, envoie-moi 20$ » : élevé, avec le bon conseil', () => {
    const r = detectScam(
      ['Salut c’est moi, j’ai changé de numéro. Je suis bloqué, envoie-moi 20$ stp.'],
      true,
    );
    expect(r.niveau).toBe('eleve');
    expect(r.raisons.join(' ')).toMatch(/ancien numéro/);
    // « Je suis bloqué » n'est pas une menace sur ton compte.
    expect(r.raisons.join(' ')).not.toMatch(/menace/);
  });

  it('pas d’alerte pour un ami bloqué dans les embouteillages ou des frais de scolarité', () => {
    expect(detectScam(['Je suis bloqué dans les embouteillages']).niveau).toBe('aucun');
    expect(detectScam(['Papa a payé les frais de scolarité']).niveau).toBe('aucun');
  });
});

describe('lecture du fil', () => {
  it('lit un export Android avec message sur plusieurs lignes, lignes système et médias', () => {
    const thread = parseThread(
      [
        '01/10/2026 21:00 - Les messages et les appels sont chiffrés de bout en bout.',
        '01/10/2026 21:02 - Christelle: Tu as fini ta partie ?',
        'Le prof veut tout demain',
        '01/10/2026 21:03 - Damien: <Médias omis>',
        '01/10/2026 21:10 - Damien: Pas encore',
      ].join('\n'),
    );
    expect(thread).toEqual([
      {
        author: 'Christelle',
        date: '01/10/2026',
        time: '21:02',
        text: 'Tu as fini ta partie ?\nLe prof veut tout demain',
      },
      { author: 'Damien', date: '01/10/2026', time: '21:10', text: 'Pas encore' },
    ]);
  });

  it('lit un texte collé « Nom: message »', () => {
    expect(parseThread('Paul: tu viens ?\nMoi: oui').map((m) => m.author)).toEqual(['Paul', 'Moi']);
  });
});

describe('faits et contrôle des brouillons', () => {
  it('extrait heures, dates et montants', () => {
    expect(extractFacts('Avant 17h30, le 3/10, envoie 5 000 FC')).toEqual(
      expect.arrayContaining(['17h30', '3/10', '5000 fc']),
    );
  });

  const base = { resume: 'Elle attend ta partie.' };
  it('repère le ton de conseiller, l’heure inventée, le code et le doublon', () => {
    const issues = checkDrafts(
      {
        ...base,
        reponses: [
          { style: 'A', texte: 'Je vais t’aider à identifier tes préoccupations.' },
          { style: 'B', texte: 'Je t’envoie ma partie avant 23h.' },
          { style: 'C', texte: 'Mon code est 4821.' },
        ],
      },
      { source: 'Tu as fini ? Le prof veut tout demain à 8h.', scam: 'aucun' },
    );
    expect(issues.map((i) => `${i.index}:${i.code}`)).toEqual(
      expect.arrayContaining(['0:conseiller', '1:fait-invente', '2:secret']),
    );
  });

  it('accepte des brouillons corrects', () => {
    const issues = checkDrafts(
      {
        ...base,
        reponses: [
          { style: 'A', texte: 'Je finis les calculs et je t’envoie ma partie avant 8h.' },
          { style: 'B', texte: 'Ma partie arrive ce soir, promis.' },
          { style: 'C', texte: 'Désolé pour le stress, je m’y mets tout de suite.' },
        ],
      },
      { source: 'Le prof veut tout demain à 8h.', scam: 'aucun' },
    );
    expect(issues).toEqual([]);
  });
});

/** Faux modèle : chaque scénario renvoie une suite de réponses, comme un vrai modèle qui se corrige. */
let server: Server;
let base = '';
const calls: Record<string, number> = {};
const scripts: Record<string, string[]> = {
  corrige: [
    JSON.stringify({
      resume: 'Christelle attend ta partie.',
      reponses: [
        { style: 'A', texte: 'Je vais t’aider à identifier tes préoccupations.' },
        { style: 'B', texte: 'Je t’envoie tout avant 23h.' },
        { style: 'C', texte: 'Désolé pour le stress, j’y suis presque.' },
      ],
    }),
    JSON.stringify({
      resume: 'Christelle attend ta partie avant 8h.',
      reponses: [
        { style: 'A', texte: 'Je termine les calculs, tu as ma partie ce soir.' },
        { style: 'B', texte: 'Ma partie arrive avant 8h, promis.' },
        { style: 'C', texte: 'Désolé pour le stress, j’y suis presque.' },
      ],
    }),
  ],
  cible: [
    JSON.stringify({
      reflexion: { relation: 'amie proche', registre: 'tu' },
      resume: 'Mariane demande des nouvelles.',
      reponses: [
        { style: 'A', texte: 'Ça va, j’ai vu un film génial récemment, je te raconte.' },
        { style: 'B', texte: 'Ça va bien et toi ?' },
        { style: 'C', texte: 'Je peux passer, mais je ne peux pas passer.' },
      ],
    }),
    JSON.stringify({
      corrections: [
        { n: 1, texte: 'Ça va, et toi ma belle ?' },
        { n: 3, texte: 'On se voit ce week-end ?' },
      ],
    }),
  ],
  bavard: ['Voici mes idées sans JSON', 'Toujours pas de JSON', 'Encore raté'],
  cede: [
    JSON.stringify({
      resume: 'Il demande ton code.',
      reponses: [
        { style: 'A', texte: 'D’accord, mon code est 4821.' },
        { style: 'B', texte: 'Je ne donne pas mes codes.' },
        { style: 'C', texte: 'Je vais vérifier auprès de mon opérateur.' },
      ],
    }),
  ],
};

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const scenario = req.url?.split('/')[1] ?? '';
      const i = (calls[scenario] = (calls[scenario] ?? 0) + 1) - 1;
      const script = scripts[scenario] ?? [];
      const content = script[Math.min(i, script.length - 1)] ?? '';
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const cfg = (scenario: string) => ({
  name: 'test',
  baseUrl: `${base}/${scenario}`,
  model: 'm',
  cloud: false,
});
const conversation = [
  '01/10/2026 21:02 - Christelle: Tu as fini ta partie du rapport ?',
  '01/10/2026 21:03 - Christelle: Le prof veut tout demain à 8h',
  '01/10/2026 21:10 - Damien: Pas encore',
  '01/10/2026 21:14 - Christelle: Sérieux ? Toute l’équipe va prendre zéro',
].join('\n');

describe('agent Six', () => {
  it('renvoie les fautes au modèle et obtient une version corrigée', async () => {
    const result = await runAgent(cfg('corrige'), {
      conversation,
      ton: 'amical',
      langue: 'fr',
      moi: 'Damien',
    });
    expect(result.interlocuteur).toBe('Christelle');
    expect(result.problemesInitiaux).toBeGreaterThanOrEqual(2);
    expect(result.corrections).toBe(1);
    expect(result.problemes).toEqual([]);
    expect(result.suggestions.reponses[1]?.texte).toContain('8h');
  });

  it('fournit des brouillons sûrs quand le modèle n’arrive jamais à répondre correctement', async () => {
    const result = await runAgent(cfg('bavard'), {
      conversation,
      ton: 'amical',
      langue: 'fr',
      moi: 'Damien',
    });
    expect(result.secours).toBe(true);
    expect(result.suggestions.reponses).toHaveLength(3);
    expect(result.suggestions.reponses[0]?.texte).toContain('Christelle');
  });

  it('remplace un brouillon qui donnerait un code à un arnaqueur (sans bouclier)', async () => {
    const scam =
      '01/10/2026 09:41 - +243 81 234 5647: Votre compte Mobile Money sera bloqué. Envoyez votre code PIN.';
    const result = await runAgent(
      cfg('cede'),
      { conversation: scam, ton: 'ferme', langue: 'fr' },
      { maxCorrections: 0, sansBouclier: true },
    );
    expect(result.scam.niveau).toBe('eleve');
    expect(result.suggestions.reponses.map((r) => r.texte).join(' ')).not.toMatch(/4821/);
    expect(result.secours).toBe(true);
  });

  it('bouclier : arnaque certaine → réponses sûres immédiates, sans appeler l’IA', async () => {
    const before = calls.cede ?? 0;
    const proche =
      "01/10/2026 11:15 - +243 82 111 2233: Salut c'est moi, j'ai changé de numéro. Je suis bloqué, envoie-moi 20$ par M-Pesa stp c'est urgent, n'en parle à personne.";
    const result = await runAgent(cfg('cede'), {
      conversation: proche,
      ton: 'naturel',
      langue: 'fr',
      moi: 'Vous',
    });
    expect(calls.cede ?? 0).toBe(before);
    expect(result.bouclier).toBe(true);
    expect(result.latencyMs).toBeLessThan(200);
    expect(result.suggestions.reponses[0]?.texte).toMatch(/ancien numéro/);
    expect(result.scam.raisons.join(' ')).not.toMatch(/menace/);
  });

  it('ne plante pas quand le serveur est éteint', async () => {
    const result = await runAgent(
      { name: 'x', baseUrl: 'http://127.0.0.1:1', model: 'm', cloud: false },
      { conversation, ton: 'amical', langue: 'fr', moi: 'Damien' },
    );
    expect(result.secours).toBe(true);
    expect(result.etapes.some((e) => e.detail.includes('network'))).toBe(true);
  });
});

describe('apprentissage du style (sans garder de texte)', () => {
  const own = [
    'mbote frère, nakoma',
    'ok stp attends',
    'frère eza malamu',
    'nayebi, merci frère',
    'tika, ngai nakoma lobi',
    'ok ok',
  ];

  it('apprend la façon d’écrire et la décrit au modèle', async () => {
    const { emptyProfile, learnStyle, describeStyle } = await import('../src/agent/style.js');
    const profile = learnStyle(emptyProfile(), own);
    expect(profile.messages).toBe(6);
    const description = describeStyle(profile, 'Damien');
    expect(description).toMatch(/lingala/);
    expect(description).toMatch(/« frere »/);
    expect(description).toMatch(/très courts/);
  });

  it('ne garde aucune phrase dans la fiche', async () => {
    const { emptyProfile, learnStyle, learnChoice } = await import('../src/agent/style.js');
    const profile = learnChoice(
      learnStyle(emptyProfile(), [...own, 'Mon secret : Kabongo 0812345678']),
      'Rassurante',
    );
    const saved = JSON.stringify(profile);
    for (const forbidden of ['Kabongo', '0812345678', 'secret', 'attends']) {
      expect(saved).not.toContain(forbidden);
    }
    expect(profile.choix).toEqual({ rassurante: 1 });
  });

  it('n’apprend pas deux fois les mêmes messages', async () => {
    const { newOwnMessages } = await import('../src/agent/profile-store.js');
    const thread = parseThread(
      '01/10/2026 21:02 - Christelle: tu as fini ?\n01/10/2026 21:10 - Damien: pas encore\n02/10/2026 08:00 - Damien: c’est envoyé',
    );
    const first = newOwnMessages(
      { profil: {} as never, appris: {} },
      thread,
      'Damien',
      'Christelle',
    );
    expect(first.messages).toHaveLength(2);
    const key = (await import('../src/agent/profile-store.js')).interlocutorKey('Christelle');
    const again = newOwnMessages(
      { profil: {} as never, appris: { [key]: first.lastStamp ?? '' } },
      thread,
      'Damien',
      'Christelle',
    );
    expect(again.messages).toHaveLength(0);
  });
});

describe('raisonnement humain', () => {
  it('signale le tutoiement quand il faut vouvoyer', () => {
    const issues = checkDrafts(
      {
        resume: 'Le professeur attend le rapport.',
        reponses: [
          { style: 'A', texte: 'Bonjour Professeur, je vous l’envoie ce soir.' },
          { style: 'B', texte: 'Ok prof, je te l’envoie ce soir.' },
          { style: 'C', texte: 'Je vous remercie, c’est noté.' },
        ],
      },
      { source: 'Envoyez-moi le rapport.', scam: 'aucun', registre: 'vous' },
    );
    expect(issues.map((i) => `${i.index}:${i.code}`)).toEqual(['1:registre']);
  });

  it('signale un brouillon bien plus long que la façon d’écrire de l’utilisateur', () => {
    const long =
      'Je voulais te dire que je suis vraiment désolé pour ce retard et que je fais tout mon possible pour terminer ma partie du rapport le plus vite possible ce soir.';
    const issues = checkDrafts(
      {
        resume: 'x',
        reponses: [
          { style: 'A', texte: long },
          { style: 'B', texte: 'ok' },
          { style: 'C', texte: 'ça marche frère' },
        ],
      },
      { source: '', scam: 'aucun', motsMoyens: 5 },
    );
    expect(issues.some((i) => i.index === 0 && i.code === 'style')).toBe(true);
  });
});

describe('agent v0.3 : retour du vrai essai Mistral', () => {
  const amie = [
    '01/10/2026 21:02 - Mariane🤍: Coucou',
    '01/10/2026 21:03 - Vous: hey',
    '01/10/2026 21:04 - Mariane🤍: Ça va ?',
  ].join('\n');

  it('signale une vie inventée et un brouillon incohérent', () => {
    const issues = checkDrafts(
      {
        resume: 'x',
        reponses: [
          { style: 'A', texte: 'Ça va, j’ai regardé une série hier soir.' },
          { style: 'B', texte: 'Je te parle d’un film que j’adore.' },
          { style: 'C', texte: 'Je peux venir mais je ne peux pas venir.' },
        ],
      },
      { source: 'Ça va ?', scam: 'aucun' },
    );
    expect(issues.map((i) => `${i.index}:${i.code}`)).toEqual([
      '0:vie-inventee',
      '1:vie-inventee',
      '2:incoherent',
    ]);
  });

  it('signale un mot répété dans un message court', () => {
    const issues = checkDrafts(
      {
        resume: 'x',
        reponses: [
          { style: 'A', texte: 'ok merci je suis là merci' },
          { style: 'B', texte: 'qu’est-ce que tu veux faire ?' },
          { style: 'C', texte: 'on se voit demain ?' },
        ],
      },
      { source: 'Je m’ennuie', scam: 'aucun' },
    );
    expect(issues.map((i) => `${i.index}:${i.code}`)).toEqual(['0:repetition']);
  });

  it('ne présente jamais « Vous » au modèle comme un prénom', async () => {
    const { isSelfAlias } = await import('../src/agent/thread.js');
    expect(isSelfAlias('Vous')).toBe(true);
    expect(isSelfAlias('Damien')).toBe(false);
    const { emptyProfile, learnStyle, describeStyle } = await import('../src/agent/style.js');
    const profile = learnStyle(emptyProfile(), ['ok', 'merci', 'ok merci', 'oui', 'ça va']);
    expect(describeStyle(profile, 'toi')).toMatch(
      /^Ta façon d'écrire \(apprise de 5 de tes messages\)/,
    );
  });

  it('lit un fichier enregistré par PowerShell ou le Bloc-notes (BOM, CRLF)', async () => {
    const raw =
      '\uFEFF01/10/2026 09:41 - +243 81 234 5647: Bonjour, ici le service M-Pesa. Votre compte sera bloqué. Envoyez votre code PIN.\r\n';
    expect(parseThread(raw)[0]?.author).toBe('+243 81 234 5647');
    const run = await runAgent(
      cfg('cede'),
      { conversation: raw, ton: 'naturel', langue: 'fr', moi: 'Vous' },
      { maxCorrections: 0 },
    );
    expect(run.scam.niveau).toBe('eleve');
  });

  it('cherche l’arnaque même dans un texte collé sans expéditeur', async () => {
    const run = await runAgent(
      cfg('cede'),
      {
        conversation: 'Votre compte M-Pesa sera bloqué. Envoyez votre code PIN.',
        ton: 'naturel',
        langue: 'fr',
      },
      { maxCorrections: 0 },
    );
    expect(run.scam.niveau).not.toBe('aucun');
  });

  it('ne signale pas un film dont la conversation parle', () => {
    const issues = checkDrafts(
      {
        resume: 'x',
        reponses: [
          { style: 'A', texte: 'Le film était top !' },
          { style: 'B', texte: 'Oui grave' },
          { style: 'C', texte: 'On y retourne ?' },
        ],
      },
      { source: 'Tu as aimé le film ?', scam: 'aucun' },
    );
    expect(issues).toEqual([]);
  });

  it('corrige seulement les brouillons fautifs, sans renvoyer toute la conversation', async () => {
    const result = await runAgent(cfg('cible'), {
      conversation: amie,
      ton: 'naturel',
      langue: 'fr',
      moi: 'Damien',
    });
    expect(result.interlocuteur).toBe('Mariane🤍');
    expect(result.problemesInitiaux).toBe(2);
    expect(result.corrections).toBe(1);
    expect(result.problemes).toEqual([]);
    expect(result.suggestions.reponses.map((r) => r.texte)).toEqual([
      'Ça va, et toi ma belle ?',
      'Ça va bien et toi ?',
      'On se voit ce week-end ?',
    ]);
  });

  it('comprend qu’un contact enregistré avec un cœur est un proche', () => {
    expect(relationHint('Mariane🤍')).toMatch(/proche/);
    expect(relationHint('Prof Kabeya')).toMatch(/vouvoiement/);
    expect(relationHint('Christelle')).toBe('');
  });

  it('retire un mot répété sans rappeler le modèle', () => {
    expect(dropRepeatedWord('ok merci je suis là merci', 'merci')).toBe('ok merci je suis là');
    expect(dropRepeatedWord('Merci, merci beaucoup', 'merci')).toBe('Merci beaucoup');
  });

  it('applique une correction ciblée et ignore un numéro hors limites', () => {
    const drafts = {
      resume: 'x',
      reponses: [
        { style: 'A', texte: 'a' },
        { style: 'B', texte: 'b' },
        { style: 'C', texte: 'c' },
      ],
    };
    const merged = mergeRepair(
      drafts,
      '{"corrections":[{"n":2,"texte":"bb"},{"n":9,"texte":"zz"}]}',
    );
    expect(merged?.reponses.map((r) => r.texte)).toEqual(['a', 'bb', 'c']);
    expect(mergeRepair(drafts, 'pas de JSON')).toBeUndefined();
  });
});

describe('« Vous » dans un export WhatsApp', () => {
  const exported = [
    '01/10/2026 21:02 - Mariane: Tu as fini ta partie ?',
    '01/10/2026 21:10 - Vous: pas encore',
    '01/10/2026 21:14 - Mariane: Sérieux ?',
    '01/10/2026 21:15 - Vous: je termine',
  ].join('\n');

  it('reconnaît « Vous » comme l’utilisateur, même avec --moi="Damien"', async () => {
    const { resolveMe } = await import('../src/agent/thread.js');
    const { whoToAnswer } = await import('../src/ai/prompt.js');
    expect(resolveMe(parseThread(exported), 'Damien')).toBe('Vous');
    expect(whoToAnswer(exported, 'Damien')).toBe('Mariane');
    expect(whoToAnswer(exported)).toBe('Mariane');
  });

  it('l’agent répond à Mariane, pas à « Vous »', async () => {
    const result = await runAgent(cfg('corrige'), {
      conversation: exported,
      ton: 'amical',
      langue: 'fr',
      moi: 'Damien',
    });
    expect(result.interlocuteur).toBe('Mariane');
  });
});
