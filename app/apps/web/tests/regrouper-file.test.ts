import { describe, expect, it } from 'vitest';
import { regrouperFile } from '@/lib/file-messages';

describe('file de messages → liste de tâches', () => {
  it('un seul message part tel quel', () => {
    expect(regrouperFile([{ id: 'a', texte: 'Bonjour', pieces: [] }])).toEqual({
      texte: 'Bonjour',
      pieces: [],
    });
  });
  it('plusieurs messages deviennent une liste numérotée avec la consigne de cocher', () => {
    const g = regrouperFile([
      { id: 'a', texte: 'Fais le plan', pieces: [1] },
      { id: 'b', texte: 'Ajoute une conclusion', pieces: [2] },
    ]);
    expect(g.affichage).toBe('1. Fais le plan\n2. Ajoute une conclusion');
    expect(g.texte).toContain('liste de tâches');
    expect(g.texte).toContain('2. Ajoute une conclusion');
    expect(g.pieces).toEqual([1, 2]);
  });
});
