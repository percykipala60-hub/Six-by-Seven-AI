import { describe, expect, it } from 'vitest';
import { evenementPublie, nomAppareil } from '@/lib/remote-direct';
import { actionDe } from '@/lib/actions-agent';

describe('remote en direct', () => {
  it("nomme l'appareil qui publie", () => {
    expect(nomAppareil('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('PC Windows');
    expect(nomAppareil('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('Mac');
    expect(nomAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('Appareil');
  });
  it('coupe les textes trop longs avant publication', () => {
    const e = evenementPublie('fin', { texte: 'x'.repeat(5000) });
    expect(e.donnees.texte).toHaveLength(4001);
  });
  it("garde le code lancé et le résultat de l'action, en taille limitée", () => {
    const a = actionDe('ordinateur', { action: 'cliquer', x: 10, y: 20 }, 'Six clique', 'ok');
    expect(a.code).toContain('ordinateur(');
    expect(a.code).toContain('"action": "cliquer"');
    expect(a.sortie).toBe('ok');
    const long = actionDe('lire_fichier', { chemin: 'a' }, 'Six lit', 'y'.repeat(3000));
    expect(long.sortie?.length ?? 0).toBeLessThanOrEqual(1501);
    expect(JSON.stringify(evenementPublie('action', { action: long })).length).toBeLessThan(20000);
  });
});

import { travailEnCours } from '@/components/RemoteDirect';
describe('écran remote du téléphone', () => {
  it('montre seulement le travail depuis le dernier début', () => {
    const ev = (id: number, genre: 'debut' | 'action' | 'plan' | 'fin', donnees = {}) => ({
      id,
      discussion: 'd',
      genre,
      donnees,
      cree: '',
    });
    const a = { genre: 'lecture' as const, texte: 'Six lit' };
    const t = travailEnCours([
      ev(1, 'debut'),
      ev(2, 'action', { action: a }),
      ev(3, 'fin'),
      ev(4, 'debut'),
      ev(5, 'plan', { taches: [{ texte: 'x', faite: false }] }),
      ev(6, 'action', { action: a }),
    ]);
    expect(t.actions).toHaveLength(1);
    expect(t.plan).toHaveLength(1);
    expect(t.termine).toBe(false);
  });
});

import { terminees } from '@/components/RemoteDirect';
describe('prévenir quand Six a fini', () => {
  it('repère seulement les discussions qui passent de « travaille » à « fini »', () => {
    const avant = new Map([
      ['a', true],
      ['b', false],
      ['c', true],
    ]);
    expect(
      terminees(avant, [
        { discussion: 'a', occupe: false },
        { discussion: 'b', occupe: false },
        { discussion: 'c', occupe: true },
        { discussion: 'd', occupe: false },
      ]),
    ).toEqual(['a']);
  });
});
