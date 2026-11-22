import { useEffect, useRef, useState } from 'react';
import LevelMap from './components/LevelMap.jsx';
import Level from './components/Level.jsx';
import Feedback from './components/Feedback.jsx';
import ProgressBar from './components/ProgressBar.jsx';
import Icon from './components/Icon.jsx';
import RiddleScreen from './components/RiddleScreen.jsx';
import { ALL_LEVELS as LEVELS, STARS_TO_WIN, TOTAL_LEVELS } from './data/levels.js';
import { computeOutcome } from './engine/probability.js';
import { jouerSon } from './engine/sons.js';
import {
  comparerRecord,
  computeRank,
  computeStars,
  getPlayerRank,
  isLevelUnlocked,
} from './engine/rewards.js';
import { useSave } from './hooks/useSave.js';

// Dans Six, la note vient de la route /api/ton-juste de l'application ; seul, du serveur du jeu.
const DANS_SIX = import.meta.env.MODE === 'six';
const EVALUATE_URL = DANS_SIX
  ? '/api/ton-juste'
  : `${import.meta.env.VITE_API_URL || ''}/api/evaluate`;
const HORS_LIGNE = DANS_SIX
  ? 'Six ne répond pas. Vérifie ta connexion, puis réessaie.'
  : "Le serveur d'évaluation ne répond pas. Vérifie qu'il est lancé, puis réessaie.";

/** Demande la note de Six au serveur, qui retrouve lui-même la situation du niveau. */
async function evaluer(levelId, playerAnswer) {
  let res;
  try {
    res = await fetch(EVALUATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ levelId, playerAnswer }),
      // 90 s : toujours plus que le pire cas du serveur (30 s + une nouvelle tentative), sinon le
      // joueur voit un abandon du client alors que le serveur allait répondre (audit du 17/10/2026).
      signal: AbortSignal.timeout(90_000),
    });
  } catch (e) {
    throw new Error(
      e?.name === 'TimeoutError'
        ? 'Six met trop de temps à répondre. Réessaie dans un instant.'
        : HORS_LIGNE,
      { cause: e },
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "L'évaluation a échoué. Réessaie.");
  return data;
}

export default function App() {
  const {
    state,
    recordAttempt,
    recordRiddle,
    recordEnigma,
    resetHintPoints,
    revealHint,
    resetProgress,
    totalStars,
  } = useSave();
  const [screen, setScreen] = useState('map'); // map | level | feedback | riddles
  const [levelId, setLevelId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState(null);
  const mainRef = useRef(null);

  const level = LEVELS.find((l) => l.id === levelId);

  // À chaque changement d'écran, l'utilisateur au clavier doit être déposé sur le titre du nouvel
  // écran (sinon le focus retombe sur le document et il faut re-tabuler depuis le début).
  useEffect(() => {
    if (screen === 'map') return;
    const titre = mainRef.current?.querySelector('h1, h2');
    if (!titre) return;
    titre.setAttribute('tabindex', '-1');
    titre.focus({ preventScroll: true });
  }, [screen]);

  // Une évaluation ou une réponse en cours ne doit pas disparaître sur un rechargement accidentel.
  useEffect(() => {
    const enCours = loading || (screen === 'level' && answer.trim().length > 0);
    if (!enCours) return;
    const prevenir = (e) => e.preventDefault();
    window.addEventListener('beforeunload', prevenir);
    return () => window.removeEventListener('beforeunload', prevenir);
  }, [loading, screen, answer]);

  function allerCarte() {
    if (!loading) setScreen('map'); // pendant une évaluation, on reste sur le niveau
  }

  function ouvrir(id) {
    if (loading) return;
    if (!isLevelUnlocked(id, totalStars, LEVELS, state.completedLevels)) return; // jamais un niveau verrouillé
    setLevelId(id);
    setAnswer('');
    setError('');
    setResult(null);
    setScreen('level');
    window.scrollTo(0, 0);
  }

  async function soumettre(texte) {
    setAnswer(texte);
    setLoading(true);
    setError('');
    try {
      const evaluation = await evaluer(levelId, texte);
      const outcome = computeOutcome({
        score: evaluation.score,
        minScore: level.minScore,
        successRate: level.successRate,
      });
      const stars = outcome.success ? computeStars(evaluation.score) : 0;
      const rank = outcome.success ? computeRank(evaluation.score) : null;
      const avant = state.completedLevels[levelId];
      const record = comparerRecord(avant?.bestScore || 0, evaluation.score, !avant?.attempts);
      const { bonuses, questReward } = recordAttempt(level, {
        score: evaluation.score,
        success: outcome.success,
        stars,
        rank,
      });
      setResult({ evaluation, outcome, stars, rank, bonuses, record, questReward });
      setScreen('feedback');
      jouerSon(outcome.success ? 'bonne-reponse' : 'mauvaise-reponse');
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const prochain = LEVELS.find((l) => l.id === levelId + 1);
  const prochainOuvert = prochain
    ? isLevelUnlocked(prochain.id, totalStars, LEVELS, state.completedLevels)
    : false;

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="app-brand"
          onClick={allerCarte}
          disabled={loading}
          aria-label="Retour à la carte des niveaux"
        >
          <img
            className="app-logo"
            src={`${import.meta.env.BASE_URL}six-icone.png`}
            alt=""
            width="40"
            height="40"
          />
          <span>
            <span className="app-title">Le jeu du ton juste</span>
            <span className="app-subtitle">par Six · Seven.AI</span>
          </span>
        </button>
        <span className="player-rank" title="Ton rang de joueur">
          {getPlayerRank(totalStars)}
        </span>
      </header>

      <ProgressBar
        currentStars={totalStars}
        goalStars={STARS_TO_WIN}
        unlocked={isLevelUnlocked(TOTAL_LEVELS, totalStars, LEVELS, state.completedLevels)}
        previousLevel={TOTAL_LEVELS - 1}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? 'Six évalue ta réponse, quelques secondes.' : ''}
        {!loading && screen === 'feedback' && result
          ? result.outcome.success
            ? 'Résultat : niveau réussi.'
            : 'Résultat : niveau échoué.'
          : ''}
      </p>

      <main className="app-main" ref={mainRef}>
        {screen !== 'map' && screen !== 'riddles' && (
          <button className="link-back" onClick={allerCarte} disabled={loading}>
            <Icon name="arrowLeft" /> Carte des niveaux
          </button>
        )}

        {screen === 'map' && (
          <>
            <section className="intro">
              <h1>Trouve les mots justes</h1>
              <p>
                15 situations principales, 30 sous-niveaux et 5 quêtes spéciales. Écris ce que tu
                dirais : Six (l&apos;IA de Seven.AI) note ta réponse sur l&apos;empathie, la clarté,
                l&apos;assertivité et le respect. Gagne des étoiles pour débloquer la suite et des
                points d&apos;indice dans les devinettes et les énigmes bonus.
              </p>
            </section>
            <LevelMap
              completedLevels={state.completedLevels}
              totalStars={totalStars}
              onSelect={ouvrir}
              onRiddles={() => setScreen('riddles')}
              hintPoints={state.hintPoints}
              solvedRiddles={state.solvedRiddles.length}
              solvedEnigmas={state.solvedEnigmas.length}
            />
            <div className="reset-zone">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (window.confirm('Effacer toute ta progression (étoiles, rangs, historique) ?'))
                    resetProgress();
                }}
              >
                Recommencer depuis le début
              </button>
              <p className="small">
                Ta progression reste sur cet appareil. Tes réponses sont notées par l'IA de Six et
                ne sont pas gardées par le serveur.
              </p>
            </div>
          </>
        )}

        {screen === 'riddles' && (
          <RiddleScreen
            solved={state.solvedRiddles}
            solvedEnigmas={state.solvedEnigmas}
            hintPoints={state.hintPoints}
            onSolve={recordRiddle}
            onSolveEnigma={recordEnigma}
            onLoseAll={resetHintPoints}
            onBack={allerCarte}
          />
        )}

        {screen === 'level' && level && (
          <>
            <Level
              key={`${levelId}-${result ? 'r' : 'n'}`}
              level={level}
              progres={state.completedLevels[levelId]}
              onSubmit={soumettre}
              loading={loading}
              initialAnswer={answer}
              hintPoints={state.hintPoints}
              revealedHints={state.revealedHints[levelId] || 0}
              onRevealHint={() => revealHint(level)}
            />
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
          </>
        )}

        {screen === 'feedback' && result && (
          <Feedback
            evaluation={result.evaluation}
            answer={answer}
            outcome={result.outcome}
            stars={result.stars}
            rank={result.rank}
            bonuses={result.bonuses}
            record={result.record}
            isTrapped={Boolean(level?.piege)}
            minScore={level?.minScore}
            isLast={levelId === TOTAL_LEVELS}
            nextUnlocked={prochainOuvert}
            isQuest={level?.kind === 'quest'}
            questReward={result.questReward}
            onRetry={() => {
              setError('');
              setScreen('level');
              window.scrollTo(0, 0);
            }}
            onNext={() => prochain && ouvrir(prochain.id)}
          />
        )}
      </main>
    </div>
  );
}
