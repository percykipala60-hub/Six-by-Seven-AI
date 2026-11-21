import StarsDisplay from './StarsDisplay.jsx';
import RankBadge from './RankBadge.jsx';
import Icon from './Icon.jsx';
import { SEUILS_ETOILES, getRankLabel } from '../engine/rewards.js';

function getEncouragementMessage(stars) {
  if (stars === 3) return 'Exceptionnel ! Une réponse de ce niveau est rarissime.';
  if (stars === 2) return 'Excellent travail. Tu maîtrises vraiment cette situation.';
  if (stars === 1) return "Très bon. Continue à progresser : l'excellence demande de la pratique.";
  return "Niveau réussi, mais les étoiles exigent davantage d'excellence. Rejoue pour viser plus haut !";
}

function getFailMessage(reason, isTrapped, successRate, score, minScore) {
  if (reason === 'score_insuffisant') {
    const manque = minScore - score;
    return {
      title: 'Score insuffisant',
      body: `Il te manquait ${manque} point${manque > 1 ? 's' : ''} : ce niveau exige ${minScore}/100. Six évalue sans complaisance : les clichés et généralités pénalisent fortement.`,
    };
  }
  if (isTrapped)
    return {
      title: "L'injustice a gagné",
      body: `Dans la vraie vie, certaines situations échappent à notre contrôle. Ce niveau est piégé : face à quelqu'un de mauvaise foi, même une excellente réponse peut échouer (réussite si le tirage est ≤ ${successRate}). Réessaie.`,
    };
  return {
    title: 'Échec malgré une bonne réponse',
    body: "Ton score était suffisant, mais le tirage aléatoire ne t'a pas été favorable. Réessaie.",
  };
}

export default function Feedback({
  evaluation,
  answer = '',
  outcome,
  stars,
  rank,
  bonuses = [],
  record = null,
  isTrapped = false,
  minScore = 0,
  onNext,
  onRetry,
  isLast = false,
  nextUnlocked = false,
  isQuest = false,
  questReward = 0,
}) {
  if (!evaluation || !outcome) return null;
  const { success } = outcome;
  const { score, feedback, points_forts = [], axes_amelioration = [] } = evaluation;

  return (
    <div className={`feedback-screen ${success ? 'feedback-success' : 'feedback-fail'}`}>
      <div className="feedback-header">
        <h2 className={`feedback-title ${success ? 'title-success' : 'title-fail'}`}>
          {success ? (
            <>
              <Icon name="checkCircle" size={30} /> Réussi !
            </>
          ) : (
            <>
              <Icon name="xCircle" size={30} /> Échec
            </>
          )}
        </h2>
        {!success &&
          (() => {
            const msg = getFailMessage(
              outcome.reason,
              isTrapped,
              outcome.successRate,
              score,
              minScore,
            );
            return (
              <div className="fail-context">
                <strong>{msg.title}</strong>
                <p>{msg.body}</p>
              </div>
            );
          })()}
      </div>

      {success && (
        <div className="feedback-rewards">
          <div className="reward-stars">
            <StarsDisplay stars={stars} size="lg" animated={true} />
          </div>
          <div className="reward-rank">
            <RankBadge rank={rank} size="lg" />
          </div>
          {bonuses.length > 0 && (
            <div className="reward-bonuses">
              {bonuses.map((bonus) => (
                <div key={bonus.id} className="bonus-item">
                  <span className="bonus-label with-icon">
                    <Icon name="medal" /> {bonus.label}
                  </span>
                  <span className="bonus-stars with-icon">
                    +{bonus.stars} <Icon name="star" fill size={16} />
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="encouragement-message">{getEncouragementMessage(stars)}</p>
          {isQuest && questReward > 0 && (
            <p className="quest-reward">
              Quête accomplie : +{questReward} points d’indice à utiliser dans les niveaux.
            </p>
          )}
          {stars < 3 && (
            <p className="next-star-hint">Prochaine étoile dès {SEUILS_ETOILES[stars]}/100.</p>
          )}
        </div>
      )}

      <div className="feedback-stats">
        <div className="stat-item">
          <span className="stat-label">Score IA</span>
          {record?.type === 'record' && (
            <span className="stat-hint">
              Nouveau record : +{record.gain} point{record.gain > 1 ? 's' : ''}
            </span>
          )}
          <span
            className={`stat-value ${score >= 85 ? 'stat-excellent' : score >= 70 ? 'stat-good' : score >= 55 ? 'stat-medium' : 'stat-low'}`}
          >
            {score}/100
          </span>
        </div>
        {outcome.roll !== null && (
          <div className="stat-item">
            <span className="stat-label">Tirage</span>
            <span className={`stat-value ${outcome.success ? 'stat-good' : 'stat-low'}`}>
              {outcome.roll}
            </span>
            <span className="stat-hint">réussite si ≤ {outcome.successRate ?? 100}</span>
          </div>
        )}
      </div>

      {answer && (
        <div className="feedback-claude">
          <h3 className="feedback-section-title with-icon">
            <Icon name="pen" /> Ta réponse
          </h3>
          <p className="feedback-text feedback-answer">{answer}</p>
        </div>
      )}

      <div className="feedback-claude">
        <h3 className="feedback-section-title with-icon">
          <Icon name="chat" /> Évaluation de Six
        </h3>
        <p className="feedback-text">{feedback}</p>
        {points_forts.length > 0 && (
          <div className="feedback-points">
            <h4 className="points-title points-positive with-icon">
              <Icon name="check" /> Points forts
            </h4>
            <ul className="points-list">
              {points_forts.map((pt, i) => (
                <li key={i} className="point-item point-positive">
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        )}
        {axes_amelioration.length > 0 && (
          <div className="feedback-points">
            <h4 className="points-title points-negative with-icon">
              <Icon name="tool" /> Axes d'amélioration
            </h4>
            <ul className="points-list">
              {axes_amelioration.map((ax, i) => (
                <li key={i} className="point-item point-negative">
                  {ax}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {success && rank && (
        <div className="feedback-rank-recap">
          <span>Rang obtenu : </span>
          <strong>{getRankLabel(rank)}</strong>{' '}
        </div>
      )}

      <div className="feedback-actions">
        {/* 3 étoiles : le maximum du niveau est atteint, il n'y a plus rien à rejouer (cahier des charges). */}
        {!(success && stars === 3) && (
          <button className="btn btn-retry" onClick={onRetry}>
            <Icon name="refresh" /> Réessayer
          </button>
        )}
        {success && !isLast && nextUnlocked && (
          <button className="btn btn-next" onClick={onNext}>
            {isQuest ? 'Quête suivante' : 'Niveau suivant'} <Icon name="arrowRight" />
          </button>
        )}
        {success && !isLast && !nextUnlocked && (
          <p className="next-locked-hint with-icon">
            <Icon name="lock" /> Le niveau suivant n'est pas encore débloqué. Accumule plus
            d'étoiles en rejouant !
          </p>
        )}
        {success && isLast && (
          <div className="game-complete with-icon">
            <Icon name="trophy" /> Tu as terminé les 50 étapes et les 5 quêtes. Félicitations !
          </div>
        )}
      </div>
    </div>
  );
}
