import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const appelAgent = vi.fn();
vi.mock('@/lib/ai', () => ({ appelAgent: (...a: unknown[]) => appelAgent(...a) }));

const { executerAgent, annonceEnregistrement } = await import('@/lib/agent/boucle');
const { ipInterdite, urlAutorisee, texteDeHtml, definitionsOutils } =
  await import('@/lib/agent/outils');

let espace = '';
beforeAll(async () => {
  espace = await mkdtemp(path.join(tmpdir(), 'six-agent-'));
});
afterAll(async () => {
  await rm(espace, { recursive: true, force: true });
});
beforeEach(() => appelAgent.mockReset());

describe("outils de l'agent", () => {
  it('refuse les adresses du réseau interne (protection SSRF)', async () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '172.20.0.1',
      '169.254.169.254',
      '::1',
      'fd00::1',
      '::ffff:127.0.0.1',
      '0.0.0.0',
    ])
      expect(ipInterdite(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) expect(ipInterdite(ip)).toBe(false);
    for (const u of [
      'http://localhost/admin',
      'http://127.0.0.1:3000/api',
      'http://[::1]/',
      'http://169.254.169.254/latest/meta-data',
      'file:///etc/passwd',
      'https://user:pass@example.com/',
      'https://example.com:8443/',
      'ftp://example.com/',
      'pas une adresse',
    ])
      expect(await urlAutorisee(u)).toBeNull();
    expect((await urlAutorisee('https://1.1.1.1/'))?.hostname).toBe('1.1.1.1');
  });

  it('tire le texte lisible d’une page HTML', () => {
    const t = texteDeHtml(
      '<html><head><style>x{}</style><script>alert(1)</script></head><body><nav>menu</nav><h1>Titre</h1><p>Un &amp; deux</p></body></html>',
    );
    expect(t).toContain('Titre');
    expect(t).toContain('Un & deux');
    expect(t).not.toContain('alert');
    expect(t).not.toContain('menu');
  });

  it("n'offre les outils de fichiers que si l'espace de travail existe", () => {
    expect(definitionsOutils({ espace: '' }).map((o) => o.nom)).toEqual([
      'chercher_sources',
      'lire_page',
      'chercher_lieu_rdc',
      'lieux_proches_rdc',
    ]);
    expect(definitionsOutils({ espace }).map((o) => o.nom)).toContain('ecrire_resultat');
  });
});

describe("boucle de l'agent", () => {
  it('exécute les outils demandés puis rend la réponse, avec les étapes et le fichier créé', async () => {
    appelAgent
      .mockResolvedValueOnce({
        texte: '',
        appels: [
          { id: 'a1', nom: 'ecrire_resultat', args: { nom: 'plan.md', contenu: '# Plan' } },
          { id: 'p1', nom: 'planifier', args: { taches: 'Rédiger le plan\nL’enregistrer' } },
        ],
      })
      .mockResolvedValueOnce({ texte: 'Plan enregistré : resultats/plan.md', appels: [] });
    const etapes: string[] = [];
    const r = await executerAgent({
      historique: [],
      question: 'Fais un plan',
      premium: true,
      ctx: { espace },
      surEtape: (e) => etapes.push(e),
    });
    // Le Word est toujours produit avec le texte ; le PDF seulement sur demande.
    expect(r.fichiers).toEqual(['resultats/plan.md', 'resultats/plan.docx']);
    expect(etapes).toEqual(['Six enregistre « plan.md »']);
    expect(await readFile(path.join(espace, 'resultats', 'plan.md'), 'utf8')).toBe('# Plan');
    // Le résultat de l'outil est rendu au modèle au tour suivant.
    const messagesTour2 = appelAgent.mock.calls[1][1] as { role: string; content: string }[];
    expect(messagesTour2.at(-1)).toMatchObject({
      role: 'tool',
      content: 'Enregistré : resultats/plan.md, resultats/plan.docx',
    });
  });

  it("relance Six s'il prétend avoir enregistré un fichier sans l'avoir fait", async () => {
    appelAgent
      .mockResolvedValueOnce({
        texte: 'Le fichier est enregistré dans resultats/synthese.md.',
        appels: [],
      })
      .mockResolvedValueOnce({
        texte: '',
        appels: [
          { id: 'a2', nom: 'ecrire_resultat', args: { nom: 'synthese.md', contenu: 'Synthèse' } },
        ],
      })
      .mockResolvedValueOnce({ texte: 'Enregistré : resultats/synthese.md', appels: [] });
    const r = await executerAgent({
      historique: [],
      question: 'Synthèse',
      premium: true,
      ctx: { espace },
      surEtape: () => {},
    });
    expect(appelAgent).toHaveBeenCalledTimes(3);
    expect(r.fichiers).toEqual(['resultats/synthese.md', 'resultats/synthese.docx']);
  });

  it('reconnaît une annonce d’enregistrement', () => {
    expect(annonceEnregistrement('Fichier enregistré : synthese.md')).toBe(true);
    expect(annonceEnregistrement('Voici trois conseils pour ta présentation.')).toBe(false);
  });
});

describe('recherche de sources', () => {
  it('fusionne les bases sans doublons, complète les champs et alterne les bases', async () => {
    const { fusionner, formaterSources } = await import('@/lib/agent/sources');
    const a = {
      titre: 'Solar mini-grids in Goma',
      auteurs: ['J. Thompson'],
      annee: 2024,
      doi: 'https://doi.org/10.1/ABC',
      base: 'OpenAlex',
    };
    const b = {
      titre: 'Solar Mini-Grids in Goma!',
      auteurs: ['J. Thompson'],
      editeur: 'Elsevier',
      doi: 'https://doi.org/10.1/abc',
      base: 'Crossref',
    };
    const c = { titre: 'Micro-réseaux au Kasaï', auteurs: ['A. Mushi'], annee: 2022, base: 'HAL' };
    const d = { titre: 'Autre travail', auteurs: [], base: 'OpenAlex' };
    const r = fusionner([[a, d], [b], [c]]);
    expect(r.map((s) => s.titre)).toEqual([
      'Solar mini-grids in Goma',
      'Micro-réseaux au Kasaï',
      'Autre travail',
    ]);
    expect(r[0]).toMatchObject({ editeur: 'Elsevier', base: 'OpenAlex, Crossref' });
    const texte = formaterSources(r, 'solar mini-grids DRC');
    expect(texte).toContain('[via OpenAlex, Crossref]');
    expect(texte).toContain('https://scholar.google.com/scholar?q=solar%20mini-grids%20DRC');
    expect(texte).not.toMatch(/wikipedia/i);
  });
});

describe('mise en forme de la réponse', () => {
  it('retire le Markdown de la bulle sans abîmer le texte', async () => {
    const { sansMarkdown } = await import('@/lib/agent/boucle');
    expect(
      sansMarkdown(
        '## Synthèse\n**Important** : voir *Energy Policy* et `resultats/plan.md`.\n- point un\n* point deux\n1. étape',
      ),
    ).toBe(
      'Synthèse\nImportant : voir Energy Policy et resultats/plan.md.\n• point un\n• point deux\n1. étape',
    );
    expect(sansMarkdown('3 * 4 = 12 et snake_case_nom')).toBe('3 * 4 = 12 et snake_case_nom');
    expect(sansMarkdown('**你好，世界。**')).toBe('你好，世界。');
    expect(sansMarkdown('« 拼 » est un caractère chinois.')).toBe(
      '« 拼 » est un caractère chinois.',
    );
  });
});

describe('mémoire des documents de la personne', () => {
  it('retrouve le document le plus proche par son titre et son plan', async () => {
    const { indexer, classer } = await import('@/lib/agent/memoire-documents');
    const doc = (titre: string, plan: string[], texte: string) => ({
      titre,
      type: 'rapport',
      plan,
      texte,
      mots: 100,
    });
    const index = indexer([
      doc(
        'Rapport PBL feu de circulation',
        ['Analyse du problème', 'Conception électronique'],
        'Le feu tricolore…',
      ),
      doc('Business plan Six', ['Marché', 'Concurrence'], 'Notre startup…'),
      doc('TP mesure de tension', ['Montage', 'Résultats'], 'Oscilloscope et multimètre…'),
    ]);
    const r = classer(index, 'plan de rapport sur un feu de circulation');
    expect(r[0].doc.titre).toBe('Rapport PBL feu de circulation');
    expect(classer(index, 'cuisine italienne')).toEqual([]);
  });
});

describe('vigilance de la boucle', () => {
  it('relit automatiquement les documents avant une tâche de rédaction', async () => {
    appelAgent.mockResolvedValueOnce({ texte: 'Voici le plan…', appels: [] });
    const etapes: string[] = [];
    await executerAgent({
      historique: [],
      question: 'Fais le plan détaillé de mon rapport PBL',
      premium: true,
      ctx: { espace, corpus: true },
      surEtape: (e) => etapes.push(e),
    });
    expect(etapes[0]).toBe('Focus : Documents');
    expect(etapes[1]).toBe('Six consulte vos documents');
    const messages = appelAgent.mock.calls[0][1] as { role: string; nom?: string }[];
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(messages[2].nom).toBe('chercher_mes_documents');
  });

  it('ne relit pas les documents pour une simple question', async () => {
    appelAgent.mockResolvedValueOnce({ texte: 'Bonjour !', appels: [] });
    const etapes: string[] = [];
    await executerAgent({
      historique: [],
      question: 'Salut, ça va ?',
      premium: true,
      ctx: { espace, corpus: true },
      surEtape: (e) => etapes.push(e),
    });
    expect(etapes).toEqual([]);
  });

  it('relance une fois Six quand il annonce une action sans la faire', async () => {
    appelAgent
      .mockResolvedValueOnce({ texte: 'Je vais chercher des sources sur ce sujet.', appels: [] })
      .mockResolvedValueOnce({ texte: 'Je vais encore chercher.', appels: [] });
    const r = await executerAgent({
      historique: [],
      question: 'Quelles sources sur le solaire ?',
      premium: true,
      ctx: { espace: '' },
      surEtape: () => {},
    });
    expect(appelAgent).toHaveBeenCalledTimes(2); // une seule relance, pas de boucle infinie
    expect(r.reponse).toBe('Je vais encore chercher.');
  });

  it('ne prend pas une longue réponse finale pour une annonce', async () => {
    const { annonceAction, demandeRedaction } = await import('@/lib/agent/boucle');
    expect(annonceAction('Je vais chercher des sources.')).toBe(true);
    expect(
      annonceAction(
        `Voici le rapport complet. ${'Texte du rapport. '.repeat(60)} Je vais te laisser relire.`,
      ),
    ).toBe(false);
    expect(demandeRedaction('Rédige l’introduction de mon mémoire')).toBe(true);
    expect(demandeRedaction('Quelle heure est-il ?')).toBe(false);
    expect(demandeRedaction('Écris-moi un texte sur le solaire')).toBe(true);
    expect(demandeRedaction('Explique-moi la planète Mars')).toBe(false);
  });
});

describe("respect de « ne l'enregistre pas »", () => {
  it("retire l'outil d'enregistrement quand la personne refuse l'enregistrement", async () => {
    const { refusEnregistrement } = await import('@/lib/agent/boucle');
    for (const q of [
      "Rédige la conclusion, ne l'enregistre pas.",
      'Fais le plan sans l’enregistrer',
      'Pas besoin d’enregistrer, montre-le moi',
      'Juste montre le résultat',
    ])
      expect(refusEnregistrement(q)).toBe(true);
    for (const q of ['Rédige la conclusion et enregistre-la', 'Fais le plan détaillé'])
      expect(refusEnregistrement(q)).toBe(false);

    appelAgent.mockResolvedValueOnce({ texte: 'Voici la conclusion.', appels: [] });
    await executerAgent({
      historique: [],
      question: "Rédige la conclusion, ne l'enregistre pas.",
      premium: true,
      ctx: { espace },
      surEtape: () => {},
    });
    const outils = appelAgent.mock.calls[0][2] as { nom: string }[];
    expect(outils.map((o) => o.nom)).not.toContain('ecrire_resultat');
    expect(outils.map((o) => o.nom)).toContain('lire_fichier');
  });
});

describe('étapes automatiques', () => {
  it("liste l'espace quand la demande parle des fichiers, et ne relit pas la mémoire pour un fichier précis", async () => {
    const { demandeFichiers, nommeUnFichier } = await import('@/lib/agent/boucle');
    expect(demandeFichiers('Quels fichiers ai-je dans mon espace de travail ?')).toBe(true);
    expect(demandeFichiers('Liste mes documents')).toBe(true);
    expect(demandeFichiers('Fais le plan de mon rapport')).toBe(false);
    expect(nommeUnFichier('Résume rapport-final.pdf')).toBe(true);
    expect(nommeUnFichier('Fais le plan de mon rapport PBL')).toBe(false);

    appelAgent.mockResolvedValueOnce({ texte: 'Tu as 2 fichiers.', appels: [] });
    const etapes: string[] = [];
    await executerAgent({
      historique: [],
      question: 'Quels fichiers ai-je dans mon espace de travail ?',
      premium: true,
      ctx: { espace, corpus: true },
      surEtape: (e) => etapes.push(e),
    });
    expect(etapes).toEqual(["Six regarde les fichiers de l'espace de travail"]);

    appelAgent.mockResolvedValueOnce({ texte: 'Résumé…', appels: [] });
    const etapes2: string[] = [];
    await executerAgent({
      historique: [],
      question: 'Lis le fichier rapport-final.pdf et rédige un résumé',
      premium: true,
      ctx: { espace, corpus: true },
      surEtape: (e) => etapes2.push(e),
    });
    expect(etapes2).toEqual(['Focus : Documents']);
  });
});

describe('garde-fous d’enregistrement (sans fausse alerte)', () => {
  it('une liste de fichiers n’est pas une annonce d’enregistrement', async () => {
    const { annonceEnregistrement, demandeEnregistrement } = await import('@/lib/agent/boucle');
    expect(annonceEnregistrement('Tu as deux fichiers : plan.md et synthese.md.')).toBe(false);
    expect(annonceEnregistrement("Je n'ai pas enregistré de fichier.")).toBe(false);
    expect(annonceEnregistrement('Le fichier est enregistré sous resultats/plan.md.')).toBe(true);
    expect(annonceEnregistrement("J'ai enregistré la synthèse.")).toBe(true);
    expect(demandeEnregistrement('Fais une synthèse et enregistre-la sous le nom s.md')).toBe(true);
    expect(demandeEnregistrement("Fais une synthèse, ne l'enregistre pas")).toBe(false);
    expect(demandeEnregistrement('Quels fichiers ai-je ?')).toBe(false);
  });

  it('relance Six quand il oublie un enregistrement demandé', async () => {
    appelAgent
      .mockResolvedValueOnce({ texte: 'Voici la synthèse : …', appels: [] })
      .mockResolvedValueOnce({
        texte: '',
        appels: [
          { id: 'e', nom: 'ecrire_resultat', args: { nom: 'oubli.md', contenu: 'Synthèse' } },
        ],
      })
      .mockResolvedValueOnce({ texte: 'Enregistré : resultats/oubli.md', appels: [] });
    const r = await executerAgent({
      historique: [],
      question: 'Fais une synthèse et enregistre-la sous le nom oubli.md',
      premium: true,
      ctx: { espace },
      surEtape: () => {},
    });
    expect(r.fichiers).toEqual(['resultats/oubli.md', 'resultats/oubli.docx']);
  });
});

describe('requêtes de recherche', () => {
  it('retire les mots de type de source et repère une demande de thèses', async () => {
    const { nettoyerRequete } = await import('@/lib/agent/sources');
    expect(nettoyerRequete('thèses francophones électrification rurale Afrique')).toEqual({
      sujet: 'électrification rurale Afrique',
      thesesMemoires: true,
    });
    expect(nettoyerRequete('solar mini-grids DRC').sujet).toBe('solar mini-grids DRC');
    expect(nettoyerRequete('thèse').sujet).toBe('thèse'); // rien d'autre : on garde la requête telle quelle
  });
});
