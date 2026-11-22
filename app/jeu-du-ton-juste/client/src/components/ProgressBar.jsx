import Icon from './Icon.jsx';

export default function ProgressBar({ currentStars, goalStars, unlocked, previousLevel }) {
  const percent = Math.min(100, Math.round((currentStars / goalStars) * 100));
  const isComplete = currentStars >= goalStars;
  return (
    <div className="progress-bar-container">
      <div className="progress-bar-header">
        {isComplete && unlocked ? (
          <span className="progress-complete with-icon">
            <Icon name="trophy" /> Quête finale débloquée !
          </span>
        ) : isComplete ? (
          <span className="progress-label with-icon">
            <Icon name="star" fill className="icon-star" /> {goalStars} étoiles réunies : réussis le
            niveau {previousLevel} pour ouvrir la quête finale
          </span>
        ) : (
          <span className="progress-label with-icon">
            <Icon name="star" fill className="icon-star" /> {currentStars} / {goalStars} étoiles
            pour la quête finale
          </span>
        )}
        <span className="progress-percent">{percent}%</span>
      </div>
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progression vers la quête finale"
      >
        <div
          className={`progress-bar-fill ${isComplete && unlocked ? 'progress-bar-complete' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
