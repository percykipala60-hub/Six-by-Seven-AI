import { describe, expect, it } from 'vitest';
import { REDACTION_SYSTEM, parseStyle, parseTopics, repliesPrompt, styleHint } from '@/lib/prompt';

describe('style', () => {
  it('décrit le style en consigne de rédaction', () => {
    const hint = styleHint({
      decontracte: 80,
      detaille: 10,
      emojis: false,
      expressions: ['Pas de souci'],
    });
    expect(hint).toContain('décontracté');
    expect(hint).toContain('bref');
    expect(hint).toContain("n'utilise pas d'emojis");
    expect(hint).toContain('« Pas de souci »');
  });

  it('borne et nettoie un style reçu du client', () => {
    const s = parseStyle({
      decontracte: 500,
      detaille: -3,
      emojis: 'oui',
      expressions: ['a'.repeat(100), '', 7, 'b', 'c', 'd', 'e', 'f'],
    });
    expect(s).toEqual({
      decontracte: 100,
      detaille: 0,
      emojis: false,
      expressions: ['a'.repeat(40), 'b', 'c', 'd', 'e'],
    });
    expect(parseStyle("n'importe quoi")).toBeUndefined();
  });

  it("ajoute le style au prompt de rédaction seulement s'il existe", () => {
    const base = {
      conversation: 'Salut',
      objectif: 'x',
      ton: 'amical' as const,
      longueur: 'courte' as const,
    };
    expect(repliesPrompt(base).user).not.toContain("Style d'écriture");
    expect(
      repliesPrompt({
        ...base,
        style: { decontracte: 50, detaille: 50, emojis: true, expressions: [] },
      }).user,
    ).toContain("Style d'écriture");
  });
});

describe('sujets', () => {
  it('lit 3 à 4 sujets et refuse moins', () => {
    expect(parseTopics('{"sujets":["a","b","c","d","e"]}')).toEqual(['a', 'b', 'c', 'd']);
    expect(() => parseTopics('{"sujets":["a","b"]}')).toThrow();
  });
});

describe('prompt de rédaction mis en cache', () => {
  it("garde un prompt système identique quels que soient le ton, la longueur, l'objectif et la conversation", () => {
    const a = repliesPrompt({
      conversation: 'A',
      objectif: 'x',
      ton: 'amical',
      longueur: 'courte',
    });
    const b = repliesPrompt({
      conversation: 'B',
      objectif: 'y',
      ton: 'ferme',
      longueur: 'detaillee',
      precision: 'p',
      style: { decontracte: 10, detaille: 90, emojis: true, expressions: [] },
    });
    expect(a.system).toBe(REDACTION_SYSTEM);
    expect(b.system).toBe(REDACTION_SYSTEM);
    expect(b.user).toContain('Ton demandé : ferme');
    expect(b.user).toContain("Objectif de l'utilisateur : y");
  });
});
