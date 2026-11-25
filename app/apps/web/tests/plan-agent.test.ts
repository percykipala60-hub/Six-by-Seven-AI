import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cocherSuivante, creerPlan, tacheEnCours } from '@/lib/agent/plan';
import type { Tache } from '@/lib/agent/plan';

const appelAgent = vi.fn();
vi.mock('@/lib/ai', () => ({ appelAgent: (...a: unknown[]) => appelAgent(...a) }));
const { executerAgent } = await import('@/lib/agent/boucle');

beforeEach(() => appelAgent.mockReset());

describe('plan de travail', () => {
  it('lit une tâche par ligne, sans puces ni numéros', () => {
    expect(
      creerPlan('1. Lire le PDF\n- Chercher des sources\n\n• Rédiger').map((t) => t.texte),
    ).toEqual(['Lire le PDF', 'Chercher des sources', 'Rédiger']);
    expect(creerPlan('Lire; Résumer').map((t) => t.texte)).toEqual(['Lire', 'Résumer']);
    expect(
      creerPlan('Lister les fichiers, Lire chaque fichier, Calculer la somme').map((t) => t.texte),
    ).toEqual(['Lister les fichiers', 'Lire chaque fichier', 'Calculer la somme']);
    expect(creerPlan('Lire le PDF, le résumer').map((t) => t.texte)).toEqual([
      'Lire le PDF, le résumer',
    ]);
    expect(creerPlan('')).toEqual([]);
  });

  it('coche les tâches une à une, dans l’ordre', () => {
    let p = creerPlan('A\nB\nC');
    expect(tacheEnCours(p)).toBe(0);
    p = cocherSuivante(p);
    p = cocherSuivante(p);
    expect(p.map((t) => t.faite)).toEqual([true, true, false]);
    expect(tacheEnCours(p)).toBe(2);
    expect(tacheEnCours(cocherSuivante(p))).toBe(-1);
  });
});

describe("plan dans la boucle de l'agent", () => {
  it('exige le plan avant le premier outil, puis le montre se cocher', async () => {
    appelAgent
      // Tour 1 : Six agit sans plan → l'outil est refusé (rien n'est exécuté).
      .mockResolvedValueOnce({
        texte: '',
        appels: [{ id: 'l1', nom: 'lire_page', args: { url: 'https://example.com' } }],
      })
      // Tour 2 : le plan, puis la première tâche cochée.
      .mockResolvedValueOnce({
        texte: '',
        appels: [
          { id: 'p', nom: 'planifier', args: { taches: 'Lire la demande\nRédiger la réponse' } },
          { id: 't1', nom: 'tache_faite', args: {} },
        ],
      })
      // Tour 3 : la réponse finale termine la dernière tâche.
      .mockResolvedValueOnce({ texte: 'Voici le résultat.', appels: [] });
    const plans: Tache[][] = [];
    const etapes: string[] = [];
    const r = await executerAgent({
      historique: [],
      question: 'Fais la tâche',
      premium: true,
      ctx: { espace: '' },
      surEtape: (e) => etapes.push(e),
      surPlan: (p) => plans.push(p),
    });
    const messages = appelAgent.mock.calls[1][1] as {
      role: string;
      id?: string;
      content: string;
    }[];
    expect(messages.find((m) => m.id === 'l1')?.content).toMatch(/planifier/);
    expect(etapes).toEqual([]); // l'outil refusé n'a pas été exécuté
    expect(plans.map((p) => p.map((t) => t.faite))).toEqual([
      [false, false],
      [true, false],
      [true, true],
    ]);
    expect(r.plan.map((t) => t.texte)).toEqual(['Lire la demande', 'Rédiger la réponse']);
    expect(r.reponse).toBe('Voici le résultat.');
  });

  it('répond directement à une simple question, sans plan', async () => {
    appelAgent.mockResolvedValueOnce({ texte: 'Bonjour !', appels: [] });
    const r = await executerAgent({
      historique: [],
      question: 'Salut',
      premium: true,
      ctx: { espace: '' },
      surEtape: () => {},
    });
    expect(r.plan).toEqual([]);
  });
});
