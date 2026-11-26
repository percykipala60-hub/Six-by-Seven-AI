import { describe, expect, it } from 'vitest';
import {
  CAPACITES_DEFAUT,
  consignesCapacites,
  normaliserCapacites,
  outilsRetires,
} from '@/lib/capacites';

describe('Capacités de Cosinus', () => {
  it('par défaut, aucun outil retiré ni consigne ajoutée', () => {
    expect(outilsRetires(CAPACITES_DEFAUT).size).toBe(0);
    expect(consignesCapacites(CAPACITES_DEFAUT)).toBe('');
  });

  it('les fichiers exigent les artéfacts, Internet exige les fichiers', () => {
    const n = normaliserCapacites({ ...CAPACITES_DEFAUT, artefacts: false, fichiers: true });
    expect(n.artefacts).toBe(true);
    const sansFichiers = normaliserCapacites({ ...CAPACITES_DEFAUT, fichiers: false });
    expect(sansFichiers.internet).toBe(false);
  });

  it('sans fichiers : ni enregistrement, ni modification, ni web', () => {
    const r = outilsRetires(normaliserCapacites({ ...CAPACITES_DEFAUT, fichiers: false }));
    for (const o of [
      'ecrire_resultat',
      'modifier_document',
      'chercher_sources',
      'lire_page',
      'naviguer',
    ])
      expect(r.has(o)).toBe(true);
    expect(r.has('lire_fichier')).toBe(false);
  });

  it('sans Internet : les outils web seulement', () => {
    const r = outilsRetires({ ...CAPACITES_DEFAUT, internet: false });
    expect([...r].sort()).toEqual(['chercher_sources', 'lire_page', 'naviguer']);
    expect(consignesCapacites({ ...CAPACITES_DEFAUT, internet: false })).toMatch(/Internet/);
  });
});
