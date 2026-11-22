import { describe, expect, it } from 'vitest';
import { detecterOrdre } from '@/lib/seven-ordres';

describe('pilotage de Six par ordres (Seven AI)', () => {
  it('reconnaît les ordres vers les pages principales', () => {
    expect(detecterOrdre('ouvre les réglages')?.cible).toBe('/reglages');
    expect(detecterOrdre('Lance Kin Rush')?.cible).toBe('/jeu');
    expect(detecterOrdre('je veux jouer au jeu du ton juste')?.cible).toBe('/ton-juste');
    expect(detecterOrdre('montre-moi coupe l’arnaque')?.cible).toBe('/coupe-arnaque');
    expect(detecterOrdre('va sur la page des devinettes')?.cible).toBe('/ton-juste');
    expect(detecterOrdre('accède à la mémoire')?.cible).toBe('/reglages?v=memoire');
    expect(detecterOrdre('emmène-moi à l’accueil')?.cible).toBe('/');
  });

  it('confirme avec un message lisible', () => {
    const ordre = detecterOrdre('ouvre les réglages');
    expect(ordre?.reponse).toMatch(/C'est parti/);
    expect(ordre?.reponse).toContain('réglages');
  });

  it('laisse passer les questions (pas de navigation)', () => {
    expect(detecterOrdre('c’est quoi la mémoire ?')).toBeNull();
    expect(detecterOrdre('comment gagner à Kin Rush ?')).toBeNull();
    expect(detecterOrdre('aide-moi à répondre à un message')).toBeNull();
  });

  it('ignore les textes longs et les ordres sans destination connue', () => {
    expect(detecterOrdre('ouvre les réglages, '.repeat(30))).toBeNull();
    expect(detecterOrdre('ouvre la fenêtre')).toBeNull(); // verbe d'ordre mais destination inconnue
  });
});
