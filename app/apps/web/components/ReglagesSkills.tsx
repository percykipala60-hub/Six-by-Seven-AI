'use client';

import { useEffect, useState } from 'react';
import { Groupe, LigneChoix } from './Liste';
import {
  SKILLS,
  ecrireSkillDefaut,
  lireSkillDefaut,
  nomSkill,
  type ChoixSkill,
} from '@/lib/skills-cosinus';

/**
 * Réglages → Focus : la méthode de travail que Cosinus prend par défaut au début d'une discussion. On peut
 * toujours en changer pour une discussion, sous la barre de saisie (à côté du modèle).
 */
export function ReglagesSkills() {
  const [choix, setChoix] = useState<ChoixSkill>('auto');
  useEffect(() => setChoix(lireSkillDefaut()), []);

  const choisir = (c: ChoixSkill) => {
    setChoix(c);
    ecrireSkillDefaut(c);
  };

  return (
    <Groupe
      titre="Focus par défaut de Cosinus"
      pied="Pour une discussion, changez de focus sous la barre de saisie, à côté du modèle. D’autres focus arriveront avec les prochains modèles."
    >
      <div role="radiogroup" aria-label="Focus par défaut">
        {(['auto', ...SKILLS.map((s) => s.id)] as ChoixSkill[]).map((id) => (
          <LigneChoix
            key={id}
            choisi={choix === id}
            label={nomSkill(id)}
            sous={
              id === 'auto'
                ? 'Cosinus choisit la méthode selon votre demande'
                : SKILLS.find((s) => s.id === id)?.description
            }
            onClick={() => choisir(id)}
          />
        ))}
      </div>
    </Groupe>
  );
}
