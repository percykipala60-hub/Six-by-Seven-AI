import { describe, expect, it } from 'vitest';
import {
  AdjustBodySchema,
  AnalyseBodySchema,
  RepliesBodySchema,
  TopicsBodySchema,
} from '@/lib/api-schemas';
import { MAX_CHARS } from '@/lib/types';

const valide = {
  conversation: 'Bonjour',
  objectif: 'Répondre poliment',
  ton: 'amical',
  longueur: 'courte',
  precision: 'plus chaleureux',
  style: { decontracte: 50, detaille: 40, emojis: false, expressions: ['ça marche'] },
  canal: 'whatsapp',
};

describe('schémas des entrées API du frontend', () => {
  it('borne la conversation et refuse un corps vide', () => {
    expect(AnalyseBodySchema.parse({ conversation: '  bonjour  ' }).conversation).toBe('bonjour');
    expect(AnalyseBodySchema.safeParse({ conversation: '   ' }).success).toBe(false);
    expect(AnalyseBodySchema.safeParse({ conversation: 'x'.repeat(MAX_CHARS + 1) }).success).toBe(
      false,
    );
    expect(AnalyseBodySchema.safeParse(null).success).toBe(false);
  });

  it('refuse un ton ou une longueur inconnus', () => {
    expect(RepliesBodySchema.safeParse(valide).success).toBe(true);
    expect(RepliesBodySchema.safeParse({ ...valide, ton: 'inconnu' }).success).toBe(false);
    expect(RepliesBodySchema.safeParse({ ...valide, longueur: 'infinie' }).success).toBe(false);
    expect(RepliesBodySchema.safeParse({ ...valide, objectif: '  ' }).success).toBe(false);
  });

  it('tronque les consignes longues et normalise le style au lieu de bloquer la rédaction', () => {
    const r = RepliesBodySchema.parse({
      ...valide,
      precision: 'x'.repeat(500),
      style: { decontracte: 101, detaille: -3, emojis: true, expressions: ['a'.repeat(60), ''] },
      canal: 'myspace',
    });
    expect(r.precision).toHaveLength(300);
    expect(r.style).toEqual({
      decontracte: 100,
      detaille: 0,
      emojis: true,
      expressions: ['a'.repeat(40)],
    });
    expect(r.canal).toBeUndefined();
    const sansStyle = JSON.parse(JSON.stringify({ ...valide, style: undefined }));
    expect(RepliesBodySchema.parse(sansStyle).style).toBeUndefined();
  });

  it('valide les retouches et les situations', () => {
    expect(
      AdjustBodySchema.parse({ reponse: 'Salut', consigne: 'x'.repeat(250) }).consigne,
    ).toHaveLength(200);
    expect(
      AdjustBodySchema.safeParse({ reponse: 'x'.repeat(1501), consigne: 'Raccourcis' }).success,
    ).toBe(false);
    expect(AdjustBodySchema.safeParse({ reponse: 'Salut', consigne: ' ' }).success).toBe(false);
    expect(TopicsBodySchema.safeParse({ situation: 'Relancer' }).success).toBe(true);
    expect(TopicsBodySchema.safeParse({ situation: 'Insulter' }).success).toBe(false);
    expect(
      TopicsBodySchema.parse({ situation: 'Relancer', contexte: 'x'.repeat(250) }).contexte,
    ).toHaveLength(200);
  });
});
