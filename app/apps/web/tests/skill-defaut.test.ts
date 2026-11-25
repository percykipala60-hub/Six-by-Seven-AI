import { describe, expect, it, vi } from 'vitest';
import { ecrireSkillDefaut, lireSkillDefaut, nomSkill } from '@/lib/skills-cosinus';

const memoire = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoire.get(k) ?? null,
  setItem: (k: string, v: string) => void memoire.set(k, v),
  removeItem: (k: string) => void memoire.delete(k),
});

describe('skill par défaut (Réglages → Skills)', () => {
  it('garde le choix sur l’appareil, « Automatique » sinon', () => {
    expect(lireSkillDefaut()).toBe('auto');
    ecrireSkillDefaut('presentations');
    expect(lireSkillDefaut()).toBe('presentations');
    ecrireSkillDefaut('auto');
    expect(lireSkillDefaut()).toBe('auto');
  });

  it('ignore une valeur inconnue gardée sur l’appareil', () => {
    memoire.set('six-skill-defaut', 'pirate');
    expect(lireSkillDefaut()).toBe('auto');
  });

  it('nomme les choix', () => {
    expect(nomSkill('auto')).toBe('Automatique');
    expect(nomSkill('documents')).toBe('Documents');
  });
});
