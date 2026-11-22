import { useState } from 'react';
import Icon from './Icon.jsx';
import { MIN_CHARS, SEUILS_ETOILES, reponseAssezLongue } from '../engine/rewards.js';

export default function Level({
  level,
  progres,
  onSubmit,
  loading,
  initialAnswer = '',
  hintPoints = 0,
  revealedHints = 0,
  onRevealHint,
}) {
  const [answer, setAnswer] = useState(initialAnswer); // on garde la réponse précédente quand on réessaie
  const MAX_CHARS = 4000;
  const hints = String(level.criteria || '')
    .split('\n')
    .filter((line) => line.trim().startsWith('•'))
    .map((line) => line.replace(/^\s*•\s*/, ''));

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!reponseAssezLongue(trimmed) || loading) return;
    onSubmit(trimmed);
  }

  return (
    <div className="level-screen">
      <div className="level-header">
        <div className="level-badges">
          <span className="badge badge-level">
            {level.kind === 'quest'
              ? `Quête ${level.sequence}/5`
              : level.kind === 'sublevel'
                ? `Sous-niveau ${level.sequence}/30`
                : `Niveau ${level.id}`}
          </span>
          <span className="badge badge-difficulty">
            {level.legendaire && <Icon name="crown" size={13} />}
            {level.piege && <Icon name="alert" size={13} />}
            {level.difficulty}
          </span>
          <span className="badge badge-rate">
            <Icon name="dice" size={13} /> {level.successRate}% de chance
          </span>
          <span className="badge badge-score">
            <Icon name="target" size={13} /> Min. {level.minScore}/100
          </span>
        </div>
        <h2 className="level-title">{level.title}</h2>
        {progres?.attempts > 0 && (
          <p className="level-progress">
            Ton meilleur score : <strong>{progres.bestScore || 0}/100</strong> · {progres.attempts}{' '}
            essai{progres.attempts > 1 ? 's' : ''}
          </p>
        )}
        {level.piege && (
          <div className="level-trap-warning">
            <Icon name="alert" /> <strong>Niveau piégé</strong> — Même une excellente réponse peut
            échouer (tirage à {level.successRate} %). Bonus <strong>Cœur fidèle</strong> (+2
            étoiles) si tu réussis au premier essai.
          </div>
        )}
      </div>

      <div className="level-scenario">
        <h3 className="scenario-label with-icon">
          <Icon name="book" /> La situation
        </h3>
        <p className="scenario-text">{level.scenario}</p>
      </div>

      <div className="level-difficulty-warning">
        <strong className="with-icon">
          <Icon name="alert" /> Règles de ce niveau :
        </strong>
        <ul>
          <li>
            Score minimum requis : <strong>{level.minScore}/100</strong> (sinon échec automatique)
          </li>
          <li>
            Tirage favorable requis : <strong>{level.successRate}%</strong> de chance
          </li>
          <li>
            Étoiles :{' '}
            {SEUILS_ETOILES.map((s, i) => (
              <span key={s}>
                {i > 0 && ' · '}
                <strong>
                  {i + 1} dès {s}/100
                </strong>
              </span>
            ))}
          </li>
          <li>En dessous de {SEUILS_ETOILES[0]}, zéro étoile même si le niveau est réussi</li>
        </ul>
      </div>

      <div className="level-criteria">
        <h3 className="criteria-label with-icon">
          <Icon name="lightbulb" /> Tes indices ({revealedHints}/{hints.length})
        </h3>
        {revealedHints > 0 && (
          <ol className="revealed-hints">
            {hints.slice(0, revealedHints).map((hint, index) => (
              <li key={index}>{hint}</li>
            ))}
          </ol>
        )}
        <p className="small">
          Chaque indice coûte 5 points, gagnés dans les devinettes et les quêtes.
        </p>
        {revealedHints < hints.length && (
          <button
            className="btn btn-ghost hint-reveal"
            type="button"
            onClick={onRevealHint}
            disabled={hintPoints < 5}
          >
            <Icon name="lightbulb" /> Révéler un indice · 5 points
            <span>Solde : {hintPoints}</span>
          </button>
        )}
      </div>

      <form className="level-form" onSubmit={handleSubmit}>
        <label htmlFor="player-answer" className="answer-label with-icon">
          <Icon name="pen" /> Ta réponse à la situation :
        </label>
        <textarea
          id="player-answer"
          className="answer-textarea"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit(e);
          }}
          aria-describedby="answer-shortcut"
          maxLength={MAX_CHARS}
          placeholder="Décris précisément ce que tu dirais ou ferais dans cette situation. Sois spécifique, nuancé, authentique. Les clichés et les généralités sont pénalisés."
          disabled={loading}
          rows={8}
        />
        <div
          className={`char-counter ${answer.length > MAX_CHARS * 0.9 ? 'char-counter-warning' : ''}`}
        >
          <span id="answer-shortcut">Ctrl + Entrée pour envoyer · </span>
          {answer.length} / {MAX_CHARS} caractères
          {answer.trim() &&
            !reponseAssezLongue(answer) &&
            ` · encore ${MIN_CHARS - answer.trim().length} pour pouvoir envoyer`}
        </div>
        <button
          type="submit"
          className="submit-button"
          disabled={!reponseAssezLongue(answer) || loading}
        >
          {loading ? (
            <>
              <Icon name="loader" className="spin" /> Évaluation en cours…
            </>
          ) : (
            <>
              <Icon name="send" /> Soumettre ma réponse
            </>
          )}
        </button>
        {loading && (
          <p className="loading-hint">
            Six analyse ta réponse selon 4 critères. Quelques secondes…
          </p>
        )}
      </form>
    </div>
  );
}
