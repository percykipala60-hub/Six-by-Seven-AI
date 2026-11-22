import { useEffect, useState } from 'react';
import { RIDDLES, TOTAL_DEVINETTES } from '../data/riddles.js';
import { ENIGMAS, TOTAL_ENIGMES } from '../data/enigmas.js';
import { jouerSon } from '../engine/sons.js';
import Icon from './Icon.jsx';

const CATEGORIES = {
  devinettes: {
    liste: RIDDLES,
    total: TOTAL_DEVINETTES,
    un: 'Devinette',
    nom: 'devinettes',
    onglet: `${TOTAL_DEVINETTES} devinettes`,
  },
  enigmes: {
    liste: ENIGMAS,
    total: TOTAL_ENIGMES,
    un: 'Énigme',
    nom: 'énigmes',
    onglet: `${TOTAL_ENIGMES} énigmes`,
  },
};

// Tentatives autorisées par niveau : les classiques restent sans limite d'essais,
// les difficiles offrent une seconde chance, les expertes se jouent en un coup.
// Le minuteur tranche les classiques : à zéro, la partie est perdue.
const ESSAIS_PAR_NIVEAU = { classique: Infinity, difficile: 2, experte: 1 };
const LIBELLE_DIFFICULTE = { classique: 'Classique', difficile: 'Difficile', experte: 'Expert' };

// Temps de base (secondes) pour répondre, par niveau de difficulté.
const TEMPS_PAR_NIVEAU = { classique: 45, difficile: 60, experte: 75 };
// À chaque recommencement, la difficulté grimpe de 15 % : le temps fond d'autant.
const HAUSSE_DIFFICULTE = 1.15;
const TEMPS_MINI = 15;
// Nombre de défis par série : recommencer tire une série différente.
const TAILLE_SERIE = 10;

function melanger(items) {
  const copie = [...items];
  for (let i = copie.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/** Série de défis : les non résolus jamais vus d'abord, puis les non résolus, mélangés. */
function tirerSerie(liste, solved, vues) {
  const libres = liste.filter((item) => !solved.includes(item.id));
  const frais = melanger(libres.filter((item) => !vues.has(item.id)));
  const revus = melanger(libres.filter((item) => vues.has(item.id)));
  return [...frais, ...revus].slice(0, TAILLE_SERIE).map((item) => item.id);
}

function RiddleCategory({ categorie, solved, onSolve, onLoseAll }) {
  const { liste, total, un, nom } = categorie;
  // Nombre de fois que le joueur a recommencé après avoir tout perdu : +15 % de difficulté par recommencement.
  const [recommencements, setRecommencements] = useState(0);
  const [vues, setVues] = useState(() => new Set());
  const [serie, setSerie] = useState(() => tirerSerie(liste, solved, new Set()));
  const [position, setPosition] = useState(0);
  const [choice, setChoice] = useState(null);
  const [essais, setEssais] = useState(0);
  const [perdu, setPerdu] = useState(false);
  // Chrono de la question en cours : { id, restant }. Un chrono d'une autre question est ignoré.
  const [chrono, setChrono] = useState(null);
  const [relance, setRelance] = useState(0); // bumpé quand le minuteur repart après un essai consommé par le temps
  // Items ratés pendant la session : sautés comme les résolus, mais sans points.
  const [ratees, setRatees] = useState(() => new Set());

  const item = liste.find((entry) => entry.id === serie[position]) ?? null;
  const niveau = item?.difficulte ?? 'classique';
  const essaisMax = ESSAIS_PAR_NIVEAU[niveau] ?? Infinity;
  const restants = essaisMax === Infinity ? Infinity : Math.max(essaisMax - essais, 0);
  const epuise = essaisMax !== Infinity && essais >= essaisMax;
  const correct = choice !== null && choice === item?.bonneReponse;

  // Temps imparti : base par niveau, réduit de 15 % à chaque recommencement (plancher de 15 s).
  const tempsMax = item
    ? Math.max(TEMPS_MINI, Math.round((TEMPS_PAR_NIVEAU[niveau] ?? 45) / HAUSSE_DIFFICULTE ** recommencements))
    : null;
  // Secondes affichées : le chrono s'il appartient à cette question, sinon le temps complet.
  const temps = chrono && chrono.id === item?.id ? chrono.restant : tempsMax;

  // Décompte : une seule pendule par question, arrêtée dès qu'on a répondu ou perdu.
  // `relance` bumpée quand le temps écoulé consume un essai : la pendule repart pour l'essai restant.
  useEffect(() => {
    if (!item || choice !== null || perdu || tempsMax === null) return undefined;
    let restant = tempsMax;
    const id = item.id;
    const pendule = setInterval(() => {
      restant -= 1;
      setChrono({ id, restant });
    }, 1000);
    return () => clearInterval(pendule);
  }, [item?.id, tempsMax, choice === null, perdu, relance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Temps écoulé : une tentative de perdue ; sans essais restants (classique inclus), la partie est perdue.
  useEffect(() => {
    if (temps !== 0 || !item || choice !== null || perdu) return;
    const tentatives = essais + 1;
    /* eslint-disable react-hooks/set-state-in-effect -- conséquences directes du décompte, pas des événements */
    setEssais(tentatives);
    if (essaisMax === Infinity || tentatives >= essaisMax) {
      toutPerdre();
    } else {
      setRelance((r) => r + 1); // une chance restante : le minuteur repart de zéro
      setChrono({ id: item.id, restant: tempsMax }); // l'affichage repart du temps complet sans attendre la 1re tick
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temps]);

  function toutPerdre() {
    jouerSon('defaite');
    setRatees((prev) => new Set(prev).add(item.id));
    setPerdu(true);
    onLoseAll(); // tous les points d'indice gagnés partent en fumée
  }

  function choisir(index) {
    if (choice !== null || solved.includes(item.id) || ratees.has(item.id) || epuise || perdu) return;
    setChoice(index); // le décompte s'arrête : l'effet du minuteur se nettoie tout seul
    if (index === item.bonneReponse) {
      jouerSon('bonne-reponse');
      onSolve(item.id, item.reward);
      setVues((prev) => new Set(prev).add(item.id));
      return;
    }
    const tentatives = essais + 1;
    setEssais(tentatives);
    if (tentatives >= essaisMax) {
      toutPerdre(); // la défaite couvre le mauvais choix final : un seul son
      return;
    }
    jouerSon('mauvaise-reponse');
  }

  function suivante() {
    setPosition((p) => p + 1);
    setChoice(null);
    setEssais(0);
  }

  function serieSuivante() {
    setVues((prev) => new Set([...prev, ...serie]));
    const prochaine = tirerSerie(liste, solved, new Set([...vues, ...serie]));
    setSerie(prochaine.length ? prochaine : serie);
    setPosition(0);
    setChoice(null);
    setEssais(0);
  }

  function recommencer() {
    setRecommencements((n) => n + 1); // +15 % de difficulté
    serieSuivante(); // une série différente
    setPerdu(false);
  }

  const terminees = solved.length + ratees.size;
  const serieFinie = position >= serie.length;
  const fait = terminees >= total;

  if (perdu) {
    return (
      <div className="riddle-card riddle-perdu" role="alert">
        <h2>Tout est perdu !</h2>
        <p>
          Cette {un.toLowerCase()} t&apos;a échappé : tous tes points d&apos;indice sont repartis à
          zéro. En recommençant, les questions changent… et le temps imparti fond de 15 % à chaque
          nouvelle défaite.
        </p>
        <button className="submit-button" onClick={recommencer}>
          Recommencer (difficulté +15 %)
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="riddle-progress" role="status">
        <span>
          {solved.length} / {total} {nom} résolues
          {ratees.size > 0 ? ` · ${ratees.size} ratée${ratees.size > 1 ? 's' : ''}` : ''}
          {recommencements > 0 ? ` · difficulté +${recommencements * 15} %` : ''}
        </span>
        <span className="riddle-progress-bar" aria-hidden="true">
          <span style={{ width: `${Math.round((terminees / total) * 100)}%` }} />
        </span>
      </div>

      {fait && serieFinie ? (
        <div className="riddle-card">
          <h2>Collection terminée !</h2>
          <p>
            Tu as tenté les {total} {nom}. Tes points d’indice peuvent encore t’aider sur la carte.
          </p>
        </div>
      ) : serieFinie ? (
        <div className="riddle-card">
          <h2>Série terminée</h2>
          <p>
            Ces {serie.length} défis sont bouclés. Une nouvelle série te tirera d&apos;autres
            questions.
          </p>
          <button className="submit-button" onClick={serieSuivante}>
            Série suivante
          </button>
        </div>
      ) : item ? (
        <article className="riddle-card">
          <span className="riddle-number">
            {un} {item.id} sur {total}
            {item.titre ? ` · ${item.titre}` : ''}
            <span className={`riddle-badge ${niveau}`}>{LIBELLE_DIFFICULTE[niveau]}</span>
          </span>
          {essaisMax !== Infinity && (
            <p className="riddle-essais">
              {epuise
                ? 'Aucun essai restant'
                : `${restants} essai${restants > 1 ? 's' : ''} restant${restants > 1 ? 's' : ''}`}
            </p>
          )}
          {choice === null && temps !== null && (
            <p className={`riddle-timer${temps <= 10 ? ' urgent' : ''}`} role="status">
              <Icon name="clock" size={15} /> {temps} s
              <span className="riddle-timer-bar" aria-hidden="true">
                <span style={{ width: `${Math.round((temps / tempsMax) * 100)}%` }} />
              </span>
            </p>
          )}
          <h2>{item.question}</h2>
          <div className="riddle-choices">
            {item.choix.map((option, index) => (
              <button
                className={`riddle-choice${choice === index ? (correct ? ' correct' : ' incorrect') : ''}`}
                key={option}
                type="button"
                disabled={choice !== null || epuise}
                onClick={() => choisir(index)}
              >
                {option}
              </button>
            ))}
          </div>
          {choice !== null &&
            (correct ? (
              <div className="riddle-result success" role="status">
                <strong>Bien joué ! +{item.reward} points d’indice</strong>
                {item.explication && <p className="riddle-explanation">{item.explication}</p>}
                <button className="submit-button" onClick={suivante}>
                  {position + 1 >= serie.length ? 'Terminer la série' : `${un} suivante`}
                </button>
              </div>
            ) : epuise ? null : (
              <div className="riddle-result" role="status">
                <strong>
                  Pas tout à fait.{' '}
                  {restants === Infinity
                    ? 'Essaie une autre fois.'
                    : restants > 0
                      ? `Il te reste ${restants} essai${restants > 1 ? 's' : ''}.`
                      : 'Essaie une autre fois.'}
                </strong>
                <button className="btn btn-ghost" onClick={() => setChoice(null)}>
                  Réessayer
                </button>
              </div>
            ))}
        </article>
      ) : null}
    </>
  );
}

export default function RiddleScreen({
  solved = [],
  solvedEnigmas = [],
  hintPoints = 0,
  onSolve,
  onSolveEnigma,
  onLoseAll,
  onBack,
}) {
  const [onglet, setOnglet] = useState('devinettes');
  const categorie = CATEGORIES[onglet];

  return (
    <section className="riddle-screen" aria-labelledby="riddle-title">
      <button className="link-back" onClick={onBack}>
        <Icon name="arrowLeft" /> Carte des niveaux
      </button>
      <header className="riddle-heading">
        <p className="riddle-eyebrow">Défis bonus</p>
        <h1 id="riddle-title">Devinettes &amp; énigmes</h1>
        <p>
          {TOTAL_DEVINETTES} devinettes et {TOTAL_ENIGMES} énigmes, réparties sur trois niveaux :
          classique, difficile et expert. Chaque question est chronométrée : un mauvais choix ou un
          temps écoulé, et <b>tous tes points d’indice repartent à zéro</b>. En recommençant, les
          questions changent et le temps imparti fond de 15 % à chaque défaite. Chaque bonne réponse
          rapporte des points : 5 points révèlent un indice dans un niveau.
        </p>
        <div className="riddle-progress" role="status">
          <span>
            {solved.length} / {TOTAL_DEVINETTES} devinettes · {solvedEnigmas.length} /{' '}
            {TOTAL_ENIGMES} énigmes
          </span>
          <strong>
            <Icon name="lightbulb" size={17} /> {hintPoints} points d’indice
          </strong>
        </div>
      </header>

      <div className="riddle-tabs" role="tablist" aria-label="Choisir un type de défi">
        <button
          type="button"
          role="tab"
          aria-selected={onglet === 'devinettes'}
          className={`riddle-tab${onglet === 'devinettes' ? ' active' : ''}`}
          onClick={() => setOnglet('devinettes')}
        >
          {CATEGORIES.devinettes.onglet}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={onglet === 'enigmes'}
          className={`riddle-tab${onglet === 'enigmes' ? ' active' : ''}`}
          onClick={() => setOnglet('enigmes')}
        >
          {CATEGORIES.enigmes.onglet}
        </button>
      </div>

      <div role="tabpanel" aria-label={categorie.onglet}>
        <RiddleCategory
          key={onglet}
          categorie={categorie}
          solved={onglet === 'devinettes' ? solved : solvedEnigmas}
          onSolve={onglet === 'devinettes' ? onSolve : onSolveEnigma}
          onLoseAll={onLoseAll}
        />
      </div>
    </section>
  );
}
