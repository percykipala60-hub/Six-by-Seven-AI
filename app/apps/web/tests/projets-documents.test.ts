import { beforeEach, describe, expect, it } from 'vitest';
import {
  DOCS_PROJET_MAX,
  DOCS_PROJET_TOTAL,
  DOC_PROJET_MAX,
  ProjetSchema,
  ajouterDocumentProjet,
  contexteDuProjet,
} from '@/lib/travail';
import { chatsDuProjet, garderChat, lireChat, rangerChat, sortirDuProjet } from '@/lib/seven-chats';

// localStorage et window minimaux pour l'environnement Node des tests.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
  window: {
    dispatchEvent: () => true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});
beforeEach(() => store.clear());

describe('documents d’un projet', () => {
  it('ajoute un document, tronqué au besoin, dans les limites du serveur', () => {
    const r = ajouterDocumentProjet([], 'long.txt', 'a'.repeat(DOC_PROJET_MAX * 2));
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.documents[0].texte.length).toBeLessThanOrEqual(DOC_PROJET_MAX);
    expect(r.documents[0].texte).toContain('[… document tronqué]');
    const r2 = ajouterDocumentProjet(r.documents, 'b.txt', 'b'.repeat(DOC_PROJET_MAX));
    if ('erreur' in r2) throw new Error(r2.erreur);
    const total = r2.documents.reduce((n, d) => n + d.texte.length, 0);
    expect(total).toBeLessThanOrEqual(DOCS_PROJET_TOTAL);
    expect(
      ProjetSchema.safeParse({ titre: 'Mémoire', contexte: '', documents: r2.documents }).success,
    ).toBe(true);
  });

  it('refuse un document vide ou de trop', () => {
    expect(ajouterDocumentProjet([], 'vide.txt', '   ')).toEqual({
      erreur: 'Ce fichier ne contient pas de texte lisible.',
    });
    const pleins = Array.from({ length: DOCS_PROJET_MAX }, (_, i) => ({ nom: `${i}`, texte: 'x' }));
    expect(ajouterDocumentProjet(pleins, 'de-trop.txt', 'ok')).toHaveProperty('erreur');
  });

  it('donne à Six le contexte puis les documents, comme des données', () => {
    const c = contexteDuProjet({
      titre: 'Mémoire',
      contexte: 'Sois bref.',
      documents: [{ nom: 'plan.txt', texte: 'Introduction' }],
    });
    expect(c).toContain('Contexte du projet « Mémoire » (données de référence)');
    expect(c).toContain('Sois bref.');
    expect(c).toContain('[Document du projet : plan.txt]\nIntroduction');
    // Un ancien projet, sans documents, garde le format d'avant.
    expect(contexteDuProjet({ titre: 'A', contexte: 'B' })).toBe(
      'Contexte du projet « A » (données de référence) :\n\nB',
    );
  });
});

describe('discussions rangées dans un projet', () => {
  it('garde le projet d’une discussion et permet de la ranger ou de l’en sortir', () => {
    garderChat('c1', [{ role: 'user', content: 'Bonjour' }], 'chat', 'p1');
    garderChat('c1', [
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Salut' },
    ]);
    expect(lireChat('c1')?.projetId).toBe('p1');
    garderChat('c2', [{ role: 'user', content: 'Autre' }], 'sixtouch');
    rangerChat('c2', 'p1');
    expect(chatsDuProjet('p1').map((c) => c.id)).toEqual(['c2', 'c1']);
    rangerChat('c2', '');
    expect(lireChat('c2')?.projetId).toBeUndefined();
    sortirDuProjet('p1');
    expect(chatsDuProjet('p1')).toHaveLength(0);
    expect(lireChat('c1')?.messages).toHaveLength(2);
  });
});
