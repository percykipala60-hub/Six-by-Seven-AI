import { useState } from 'react';
import { ALL_LEVELS as LEVELS } from '../data/levels.js';
import { TOTAL_DEVINETTES } from '../data/riddles.js';
import { TOTAL_ENIGMES } from '../data/enigmas.js';
import {
  RANGS_JOUEUR,
  isLevelUnlocked,
  previousLevelPassed,
  starsNeededToUnlock,
} from '../engine/rewards.js';
import StarsDisplay from './StarsDisplay.jsx';
import Icon from './Icon.jsx';

export default function LevelMap({
  completedLevels,
  totalStars,
  onSelect,
  onRiddles,
  hintPoints,
  solvedRiddles,
  solvedEnigmas = 0,
}) {
  const [zone, setZone] = useState(0);
  const levelsNormaux = LEVELS.filter((level) => level.kind !== 'quest');
  const zones = [
    ...RANGS_JOUEUR.map((rang, i) => {
      const debut = Math.floor((i * levelsNormaux.length) / RANGS_JOUEUR.length);
      const fin = Math.floor(((i + 1) * levelsNormaux.length) / RANGS_JOUEUR.length);
      return { ...rang, levels: levelsNormaux.slice(debut, fin) };
    }),
    { nom: 'Quêtes spéciales', min: 0, levels: LEVELS.filter((level) => level.kind === 'quest') },
  ];
  const levels = zones[zone].levels;
  return (
    <div className="level-map">
      <div className="level-map-header treasure-heading">
        <h2 className="level-map-title with-icon">
          <Icon name="map" size={22} /> Carte des niveaux
        </h2>
        <span className="treasure-map-caption">15 niveaux · 30 sous-niveaux · 5 quêtes</span>
      </div>
      <div className="treasure-regions" role="group" aria-label="Choisir une contrée">
        {zones.map((item, i) => (
          <button
            className={`treasure-region${zone === i ? ' selected' : ''}`}
            key={item.nom}
            type="button"
            aria-pressed={zone === i}
            onClick={() => setZone(i)}
          >
            <span className="treasure-region-mark" aria-hidden="true">
              {i === zones.length - 1 ? '✦' : '◆'}
            </span>
            <span className="treasure-region-name">{item.nom}</span>
            <span className="treasure-region-count">{item.levels.length} étapes</span>
          </button>
        ))}
      </div>
      <section className="treasure-map" aria-label={`Étapes de la contrée ${zones[zone].nom}`}>
        <div className="treasure-route" aria-hidden="true" />
        {levels.map((level, index) => {
          const data = completedLevels[level.id] || {};
          const unlocked = isLevelUnlocked(level.id, totalStars, LEVELS, completedLevels);
          const precedentReussi = previousLevelPassed(level.id, LEVELS, completedLevels);
          const starsNeeded = starsNeededToUnlock(level.id, totalStars, LEVELS);
          const isCompleted = Boolean(data.reussi); // réussi au moins une fois, même si la dernière partie a échoué
          const isTrapped = Boolean(level.piege);
          let starsBorderClass = '';
          if (isCompleted) {
            if ((data.stars || 0) >= 3) starsBorderClass = 'border-gold';
            else if ((data.stars || 0) >= 2) starsBorderClass = 'border-silver';
            else if ((data.stars || 0) >= 1) starsBorderClass = 'border-bronze';
            else starsBorderClass = 'border-completed';
          }
          return (
            <button
              key={level.id}
              className={[
                'level-card',
                'treasure-stop',
                unlocked ? 'level-unlocked' : 'level-locked',
                isCompleted ? `level-completed ${starsBorderClass}` : '',
                isTrapped ? 'level-trapped' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => unlocked && onSelect(level.id)}
              disabled={!unlocked}
              type="button"
            >
              <div className="level-card-header">
                <span className="treasure-step">{index + 1}</span>
                {isTrapped && (
                  <span className="level-trap-icon" title="Niveau piégé">
                    <Icon name="alert" />
                  </span>
                )}
                {!unlocked && (
                  <span className="level-lock-icon" title="Verrouillé">
                    <Icon name="lock" />
                  </span>
                )}
              </div>
              <div className="level-card-title">{level.title}</div>
              {level.kind === 'sublevel' && (
                <span className="level-kind">Sous-niveau {level.sequence}/30</span>
              )}
              {level.kind === 'quest' && (
                <span className="level-kind quest-kind">
                  Quête spéciale {level.sequence}/5 · +{level.questReward} points d’indice
                </span>
              )}
              {isCompleted && <StarsDisplay stars={data.stars || 0} size="sm" />}
              {!unlocked && (
                <div className="level-card-locked-info">
                  <span className="level-locked-text">
                    {precedentReussi
                      ? `Encore ${starsNeeded} étoile${starsNeeded > 1 ? 's' : ''} pour débloquer`
                      : `Réussis d'abord le niveau ${level.id - 1}`}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </section>
      <div className="bonus-entry-card">
        <div>
          <strong>Devinettes &amp; énigmes</strong>
          <p>
            {TOTAL_DEVINETTES - solvedRiddles} devinette
            {TOTAL_DEVINETTES - solvedRiddles === 1 ? '' : 's'} et {TOTAL_ENIGMES - solvedEnigmas}{' '}
            énigme{TOTAL_ENIGMES - solvedEnigmas === 1 ? '' : 's'} à résoudre pour gagner des
            indices.
          </p>
        </div>
        <span className="hint-balance">
          <Icon name="lightbulb" size={17} /> {hintPoints}
        </span>
        <button className="submit-button" type="button" onClick={onRiddles}>
          Jouer
        </button>
      </div>
      <p className="treasure-map-hint">Choisis une étape ouverte pour continuer ton voyage.</p>
    </div>
  );
}
