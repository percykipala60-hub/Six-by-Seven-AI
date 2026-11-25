import { describe, expect, it } from 'vitest';
import {
  SANS_DOSSIER,
  dossiersConnus,
  grouperParEnvironnement,
  memeDossier,
  nomDossier,
  normaliserEnvironnement,
  type Environnement,
} from '@/lib/environnements';

const env = (id: string, nom: string, dossiers: string[], maj: number): Environnement => ({
  id,
  nom,
  dossiers,
  maj,
});

describe('environnements de Cosinus (un nom, un ou plusieurs dossiers)', () => {
  it('nomme un dossier par son dernier élément', () => {
    expect(nomDossier('C:\\Users\\omen\\Mémoire\\')).toBe('Mémoire');
    expect(nomDossier('/home/omen/projets/six')).toBe('six');
  });

  it('reconnaît le même dossier écrit différemment', () => {
    expect(memeDossier('C:\\Users\\Omen\\Six\\', 'c:/users/omen/six')).toBe(true);
    expect(memeDossier('/home/a/Six', '/home/a/six')).toBe(false);
  });

  it('reprend les anciens environnements (un seul dossier)', () => {
    expect(normaliserEnvironnement({ dossier: 'C:\\Cours', maj: 3 })).toEqual({
      id: 'd:C:\\Cours',
      nom: 'Cours',
      dossiers: ['C:\\Cours'],
      maj: 3,
    });
    expect(
      normaliserEnvironnement({ id: 'e1', nom: ' ', dossiers: ['D:\\Six'], maj: 1 })?.nom,
    ).toBe('Six');
    expect(normaliserEnvironnement({ nom: 'x' })).toBeNull();
  });

  it('groupe les discussions sous leur environnement, le plus récent en tête', () => {
    const envs = [
      env('e1', 'Mémoire', ['C:\\Travail\\Memoire', 'D:\\Sources'], 5),
      env('e2', 'Vide', ['D:\\Vide'], 1),
    ];
    const chats = [
      { id: '1', maj: 10, environnement: 'e1' },
      { id: '2', maj: 30, dossier: 'C:\\Travail\\Compta' },
      { id: '3', maj: 20, dossier: 'c:/travail/memoire' }, // ancienne discussion : rejoint « Mémoire »
      { id: '4', maj: 40 },
    ];
    const groupes = grouperParEnvironnement(chats, envs);
    expect(groupes.map((g) => [g.nom, g.chats.map((c) => c.id)])).toEqual([
      ['Compta', ['2']],
      ['Mémoire', ['3', '1']],
      ['Vide', []],
      [SANS_DOSSIER, ['4']],
    ]);
    expect(groupes[1].dossier).toBe('C:\\Travail\\Memoire');
    expect(groupes[0].environnement).toBeUndefined();
  });

  it('propose les dossiers déjà utilisés, sans doublon', () => {
    expect(
      dossiersConnus([
        env('a', 'A', ['C:\\X', 'C:\\Y'], 2),
        env('b', 'B', ['c:\\x\\', 'C:\\Z'], 1),
      ]),
    ).toEqual(['C:\\X', 'C:\\Y', 'C:\\Z']);
  });
});
