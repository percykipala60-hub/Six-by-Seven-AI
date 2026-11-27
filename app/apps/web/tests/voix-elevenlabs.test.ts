import { describe, expect, it } from 'vitest';
import { LANGUES_VOIX } from '@/lib/langues-voix';
import { trouverVoixElevenLabs, VOIX_ELEVENLABS } from '@/lib/voix-elevenlabs';

describe('Voix ElevenLabs', () => {
  it('chaque langue parlée a au moins une voix', () => {
    for (const l of LANGUES_VOIX.filter((x) => x.id !== 'auto'))
      expect(VOIX_ELEVENLABS.some((v) => v.langue === l.id)).toBe(true);
  });

  it('le lingala et le swahili passent par eleven_v3 (seul modèle qui les lit)', () => {
    for (const langue of ['ln', 'sw'])
      expect(
        VOIX_ELEVENLABS.filter((v) => v.langue === langue).every((v) => v.modele === 'eleven_v3'),
      ).toBe(true);
  });

  it('identifiants et sélections uniques, format ElevenLabs', () => {
    expect(new Set(VOIX_ELEVENLABS.map((v) => v.selection)).size).toBe(VOIX_ELEVENLABS.length);
    for (const v of VOIX_ELEVENLABS) expect(v.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(trouverVoixElevenLabs('elevenlabs:sarah')?.langue).toBe('en');
    expect(trouverVoixElevenLabs('inconnue')).toBeUndefined();
  });
});
