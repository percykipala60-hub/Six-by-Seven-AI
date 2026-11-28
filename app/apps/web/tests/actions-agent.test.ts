import { describe, expect, it } from 'vitest';
import { actionDe, grouperActions } from '@/lib/actions-agent';

describe('actions de Six', () => {
  it('reconnaît une modification et compte les lignes', () => {
    const a = actionDe(
      'ecrire_resultat',
      { nom: 'dossier/plan.md', contenu: 'a\nb\nc' },
      'Six enregistre',
      'ok',
    );
    expect(a).toMatchObject({ genre: 'modification', fichier: 'plan.md', ajout: 3 });
    expect(a.echec).toBeUndefined();
  });
  it('repère un échec', () => {
    expect(actionDe('lire_fichier', {}, 'Six lit', 'Fichier introuvable : x').echec).toBe(true);
  });
  it('groupe les actions qui se suivent, pas les modifications', () => {
    const l = actionDe('lire_fichier', {}, 'Six lit a', 'ok');
    const e = actionDe('lire_fichier', {}, 'Six lit b', 'Erreur');
    const m = actionDe(
      'modifier_document',
      { chemin: 'r.docx', ancien: 'x', nouveau: 'y\nz' },
      'Six modifie',
      'ok',
    );
    const g = grouperActions([l, e, m, l]);
    expect(g.map((x) => x.resume)).toEqual([
      '2 lectures (1 échec)',
      'Modifié r.docx +2 −1',
      'Six lit a',
    ]);
  });
});
