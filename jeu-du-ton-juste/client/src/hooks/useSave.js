// hooks/useSave.js — Progression du joueur, gardée dans le navigateur (localStorage). Aucune réponse n'y est écrite.
import { useCallback, useState } from 'react';
import { ETAT_VIDE, appliquerTentative, lireSauvegarde } from '../engine/progression.js';
import { computeTotalStars } from '../engine/rewards.js';

const STORAGE_KEY = 'social-game-save-v1';

function charger() {
  try {
    return lireSauvegarde(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return { ...ETAT_VIDE };
  }
}

function sauver(etat) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(etat));
  } catch {
    /* stockage plein ou bloqué : la partie continue sans être gardée */
  }
}

export function useSave() {
  const [state, setState] = useState(charger);

  /** Enregistre une tentative et renvoie les bonus gagnés, pour les afficher. */
  const recordAttempt = useCallback(
    (level, tentative) => {
      const { etat, bonuses } = appliquerTentative(state, level, tentative);
      const questRewards = [...(etat.questRewards || [])];
      let hintPoints = etat.hintPoints || 0;
      let questReward = 0;
      if (level.kind === 'quest' && tentative.success && !questRewards.includes(level.id)) {
        questRewards.push(level.id);
        questReward = level.questReward || 10;
        hintPoints += questReward;
      }
      const next = { ...etat, questRewards, hintPoints };
      sauver(next);
      setState(next);
      return { bonuses, questReward };
    },
    [state],
  );

  const recordRiddle = useCallback(
    (id, reward) => {
      if (state.solvedRiddles.includes(id)) return false;
      const next = {
        ...state,
        solvedRiddles: [...state.solvedRiddles, id],
        hintPoints: Math.min(5000, state.hintPoints + reward),
      };
      sauver(next);
      setState(next);
      return true;
    },
    [state],
  );

  const recordEnigma = useCallback(
    (id, reward) => {
      if (state.solvedEnigmas.includes(id)) return false;
      const next = {
        ...state,
        solvedEnigmas: [...state.solvedEnigmas, id],
        hintPoints: Math.min(5000, state.hintPoints + reward),
      };
      sauver(next);
      setState(next);
      return true;
    },
    [state],
  );

  // Échec à une devinette ou une énigme : tout ce qui a été gagné part en fumée.
  const resetHintPoints = useCallback(() => {
    if (!state.hintPoints) return;
    const next = { ...state, hintPoints: 0 };
    sauver(next);
    setState(next);
  }, [state]);

  const revealHint = useCallback(
    (level) => {
      const revealed = state.revealedHints[level.id] || 0;
      const hints = String(level.criteria || '')
        .split('\n')
        .filter((line) => line.trim().startsWith('•'));
      if (state.hintPoints < 5 || revealed >= hints.length) return false;
      const next = {
        ...state,
        hintPoints: state.hintPoints - 5,
        revealedHints: { ...state.revealedHints, [level.id]: revealed + 1 },
      };
      sauver(next);
      setState(next);
      return true;
    },
    [state],
  );

  const resetProgress = useCallback(() => {
    sauver(ETAT_VIDE);
    setState({ ...ETAT_VIDE });
  }, []);

  return {
    state,
    recordAttempt,
    recordRiddle,
    recordEnigma,
    resetHintPoints,
    revealHint,
    resetProgress,
    totalStars: computeTotalStars(state.completedLevels, state.serieBonus),
  };
}
