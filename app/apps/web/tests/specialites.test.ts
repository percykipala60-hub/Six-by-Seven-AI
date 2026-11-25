import { describe, expect, it } from 'vitest';
import { listeSpecialites, specialitesPour, SPECIALITES } from '@/lib/agent/specialites';
import { sevenAiSystem } from '@/lib/prompt';

describe('spécialités de Cosinus', () => {
  it('active la spécialité rapports seulement quand la tâche la concerne', () => {
    expect(specialitesPour('Rédige un rapport de 3 pages sur le solaire').map((s) => s.id)).toEqual(
      ['rapports'],
    );
    expect(specialitesPour('Mets la conclusion en bleu dans le rapport')).toHaveLength(1);
    expect(specialitesPour('Mets-le en rouge', 'Enregistré : resultats/solaire.docx')).toHaveLength(
      1,
    );
    expect(specialitesPour('Range mes photos par date')).toEqual([]);
    expect(specialitesPour('Quelle heure est-il à Kinshasa ?')).toEqual([]);
  });

  it('Cosinus reste généraliste : ses domaines sont listés, sans les consignes détaillées', () => {
    const consignes = sevenAiSystem('sixtouch', true);
    expect(consignes).toContain('agent de travail polyvalent');
    expect(consignes).toContain(listeSpecialites());
    expect(consignes).not.toContain('Générer un rapport');
    expect(SPECIALITES[0].consignes).toContain('Générer un rapport');
  });
});
