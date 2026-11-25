import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/lib/types';
import { changerVersion, depuis, jusquA, nouvelleVersion, numeroVersion } from '@/lib/versions';

const u = (content: string): ChatMessage => ({ role: 'user', content });
const a = (content: string): ChatMessage => ({ role: 'assistant', content });

describe('versions d’une discussion (rien n’est perdu)', () => {
  const fil = [u('Bonjour'), a('Salut'), u('Fais un plan'), a('Plan A'), u('Merci'), a('De rien')];

  it('modifier une question garde l’ancienne suite et permet d’y revenir', () => {
    const { avant, question } = nouvelleVersion(fil, 2, u('Fais un plan court'));
    expect(avant).toEqual(fil.slice(0, 2));
    const v2 = [...avant, question, a('Plan court')];
    expect(numeroVersion(v2[2])).toEqual({ n: 2, total: 2 });

    const v1 = changerVersion(v2, 2, -1);
    expect(v1.map((m) => m.content)).toEqual(fil.map((m) => m.content));
    expect(numeroVersion(v1[2])).toEqual({ n: 1, total: 2 });

    const retour = changerVersion(v1, 2, 1);
    expect(retour.map((m) => m.content)).toEqual([
      'Bonjour',
      'Salut',
      'Fais un plan court',
      'Plan court',
    ]);
    expect(numeroVersion(retour[2])).toEqual({ n: 2, total: 2 });
  });

  it('une troisième version s’ajoute à la fin, même depuis une ancienne version', () => {
    let f = (() => {
      const { avant, question } = nouvelleVersion(fil, 2, u('v2'));
      return [...avant, question, a('r2')];
    })();
    f = changerVersion(f, 2, -1); // retour à la v1
    const { avant, question } = nouvelleVersion(f, 2, u('v3'));
    f = [...avant, question, a('r3')];
    expect(numeroVersion(f[2])).toEqual({ n: 3, total: 3 });
    expect(changerVersion(f, 2, -1)[2].content).toBe('v2');
    expect(changerVersion(changerVersion(f, 2, -1), 2, -1)[2].content).toBe('Fais un plan');
  });

  it('ne bouge pas au-delà de la première ou de la dernière version', () => {
    expect(changerVersion(fil, 2, -1)).toBe(fil);
    expect(changerVersion(fil, 2, 1)).toBe(fil);
  });

  it('bifurque à partir d’une question en gardant sa réponse', () => {
    expect(jusquA(fil, 2).map((m) => m.content)).toEqual([
      'Bonjour',
      'Salut',
      'Fais un plan',
      'Plan A',
    ]);
    expect(jusquA(fil, 1).map((m) => m.content)).toEqual(['Bonjour', 'Salut']);
  });

  it('dit depuis quand un message a été envoyé', () => {
    const t = 1_000_000_000_000;
    expect(depuis(t, t + 20_000)).toBe("à l'instant");
    expect(depuis(t, t + 52 * 60_000)).toBe('il y a 52 minutes');
    expect(depuis(t, t + 3 * 3_600_000)).toBe('il y a 3 heures');
  });
});
