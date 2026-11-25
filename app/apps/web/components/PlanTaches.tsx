'use client';

import { Icon } from './Icon';

type Tache = { texte: string; faite: boolean };

/**
 * Liste de tâches de Cosinus (lib/agent/plan.ts) : écrite avant d'agir, cochée une à une dans l'ordre.
 * « enCours » : pendant le travail, la tâche en cours est mise en avant. « replie » : dans le fil, après coup.
 */
export function PlanTaches({
  taches,
  enCours,
  replie,
}: {
  taches: Tache[];
  enCours?: boolean;
  replie?: boolean;
}) {
  const faites = taches.filter((t) => t.faite).length;
  const courante = enCours ? taches.findIndex((t) => !t.faite) : -1;
  const liste = (
    <ol className="plan-taches-liste">
      {taches.map((t, i) => (
        <li
          key={i}
          className={t.faite ? 'faite' : i === courante ? 'courante' : undefined}
          aria-current={i === courante ? 'step' : undefined}
        >
          <span className="plan-case" aria-hidden="true">
            {t.faite && <Icon name="check" size={11} stroke={2.6} />}
          </span>
          <span className="plan-texte">{t.texte}</span>
          <span className="sr">{t.faite ? ' (faite)' : i === courante ? ' (en cours)' : ''}</span>
        </li>
      ))}
    </ol>
  );
  const titre = `Plan · ${faites}/${taches.length} tâche${taches.length > 1 ? 's' : ''} faite${faites > 1 ? 's' : ''}`;
  if (replie)
    return (
      <details className="plan-taches">
        <summary>{titre}</summary>
        {liste}
      </details>
    );
  return (
    <section className="plan-taches ouvert" aria-label={titre}>
      <p className="plan-taches-titre">{titre}</p>
      {liste}
    </section>
  );
}
