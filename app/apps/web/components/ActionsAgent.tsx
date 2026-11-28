'use client';

import { Icon } from './Icon';
import { grouperActions, type ActionAgent, type GenreAction } from '@/lib/actions-agent';

const ICONES: Record<
  GenreAction,
  'liste' | 'pencil' | 'search' | 'ordinateur' | 'terminal' | 'points'
> = {
  lecture: 'liste',
  modification: 'pencil',
  recherche: 'search',
  ordinateur: 'ordinateur',
  commande: 'terminal',
  autre: 'points',
};

/**
 * Ce que Six a fait, en lignes compactes qu'on déplie (comme sur la vidéo du remote) :
 * « 3 lectures », « Modifié plan.docx +12 −3 », « 2 recherches (1 échec) ». Même format sur PC et au téléphone.
 */
export function ActionsAgent({ actions, enCours }: { actions: ActionAgent[]; enCours?: boolean }) {
  const groupes = grouperActions(actions);
  return (
    <div className="six-actions">
      {groupes.map((g, i) => {
        const a = g.actions[0];
        const dernier = enCours && i === groupes.length - 1;
        const resume =
          a.genre === 'modification' ? (
            <>
              Modifié {a.fichier ?? 'un fichier'}
              {a.ajout ? <span className="six-action-ajout"> +{a.ajout}</span> : null}
              {a.retrait ? <span className="six-action-retrait"> −{a.retrait}</span> : null}
              {g.echecs ? ' (échec)' : null}
            </>
          ) : (
            g.resume
          );
        return (
          <details key={i} className="six-action" data-echec={g.echecs > 0 || undefined}>
            <summary>
              <Icon name={ICONES[a.genre]} size={15} stroke={1.8} />
              <span className="six-action-resume">{resume}</span>
              {g.echecs > 0 && <Icon name="alert" size={13} stroke={2} />}
              {dernier && <span className="six-action-encours">en cours</span>}
              <Icon name="chevron" size={13} stroke={2} />
            </summary>
            <ol>
              {g.actions.map((x, k) => (
                <li key={k} data-echec={x.echec || undefined}>
                  {x.texte}
                  {x.echec ? ' — échec' : ''}
                  {(x.code || x.sortie) && (
                    <div className="six-action-code">
                      {x.code && <pre aria-label="Code lancé">{x.code}</pre>}
                      {x.sortie && <pre aria-label="Résultat">{x.sortie}</pre>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </details>
        );
      })}
    </div>
  );
}
