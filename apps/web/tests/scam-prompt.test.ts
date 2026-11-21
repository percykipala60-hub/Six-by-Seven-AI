import { describe, expect, it } from 'vitest';
import { heuristicScam, mergeScam } from '@/lib/scam';
import { parseAdjust, parseAnalysis, parseReplies } from '@/lib/prompt';

describe('scam', () => {
  it('alerte sur une demande de code avec urgence', () => {
    const r = heuristicScam(
      'Votre compte est bloqué. Envoyez votre code PIN immédiatement pour le débloquer.',
    );
    expect(r.score).toBeGreaterThanOrEqual(50);
    expect(r.raisons.length).toBeGreaterThan(1);
  });

  it('laisse passer un message normal', () => {
    expect(heuristicScam("Salut, tu peux m'envoyer le dossier avant 17h ?").score).toBeLessThan(20);
  });

  it('garde le score le plus élevé', () => {
    expect(mergeScam({ score: 10, raisons: ['a'] }, { score: 80, raisons: ['b'] })).toEqual({
      score: 80,
      raisons: ['a', 'b'],
    });
  });
});

describe('parse IA', () => {
  it('extrait le JSON entouré de texte et borne les scores', () => {
    const a = parseAnalysis(
      'Voici : {"resume":"Un collègue demande un dossier.","tension":140,"arnaque":{"score":-5,"raisons":["x"]},"objectifs":["Gagner du temps"],"question":null} fin',
    );
    expect(a.tension).toBe(100);
    expect(a.arnaque.score).toBe(0);
    expect(a.question).toBeNull();
  });

  it('refuse un JSON sans résumé ou sans 3 réponses', () => {
    expect(() => parseAnalysis('{"tension":10}')).toThrow();
    expect(() => parseReplies('{"reponses":["a","b"]}')).toThrow();
    expect(() => parseReplies('pas de json')).toThrow();
    expect(() => parseAdjust('{"reponse":""}')).toThrow();
  });

  it('accepte 3 réponses valides', () => {
    expect(parseReplies('{"reponses":["a","b","c","d"]}')).toEqual(['a', 'b', 'c']);
  });
});
