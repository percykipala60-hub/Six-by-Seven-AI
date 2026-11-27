'use client';

import type { UsageJetons } from '@/lib/types';

const format = new Intl.NumberFormat('fr-FR');

export function UtilisationSix({
  usage,
  emplacement,
}: {
  usage?: UsageJetons;
  emplacement: 'saisie' | 'panneau';
}) {
  const total = usage ? usage.entree + usage.sortie : 0;
  const partSortie = total && usage ? (usage.sortie / total) * 100 : 0;
  return (
    <details className={`six-utilisation six-utilisation-${emplacement}`}>
      <summary
        aria-label="Utilisation des jetons"
        title={usage ? `${format.format(total)} jetons` : 'Utilisation des jetons'}
      >
        <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".25"
          />
          {total > 0 && (
            <circle
              cx="12"
              cy="12"
              r="8.5"
              pathLength="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={`${partSortie} 100`}
              transform="rotate(-90 12 12)"
            />
          )}
        </svg>
      </summary>
      <div className="six-utilisation-details">
        <strong>Jetons de cette discussion</strong>
        {usage ? (
          <dl>
            <div>
              <dt>Total des réponses affichées</dt>
              <dd>{format.format(total)}</dd>
            </div>
            <div>
              <dt>Entrée</dt>
              <dd>{format.format(usage.entree)}</dd>
            </div>
            <div>
              <dt>
                Sortie <small>(arc du cercle)</small>
              </dt>
              <dd>{format.format(usage.sortie)}</dd>
            </div>
          </dl>
        ) : (
          <p>Aucun relevé pour cette discussion.</p>
        )}
      </div>
    </details>
  );
}
