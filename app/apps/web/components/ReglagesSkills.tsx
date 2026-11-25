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
 * Réglages → Skills : la méthode de travail que Cosinus prend par défaut au début d'une discussion. On peut
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
      titre="Skill par défaut de Cosinus"
      pied="Pour une discussion, changez de skill sous la barre de saisie, à côté du modèle. D’autres skills arriveront avec les prochains modèles."
    >
      <div role="radiogroup" aria-label="Skill par défaut">
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
