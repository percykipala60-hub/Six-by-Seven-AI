/**
 * Les trois sons du jeu du ton juste, synthétisés en WebAudio : aucun fichier à charger,
 * aucune dépendance, le jeu reste jouable hors-ligne (mode six).
 *
 * - `bonne-reponse` : une montée franche, quand une réponse est juste (défi ou niveau).
 * - `mauvaise-reponse` : un recul grave, quand la réponse est ratée (il reste des essais).
 * - `defaite` : une chute marquée, quand tout est perdu (points d'indice à zéro, niveau raté).
 *
 * Le contexte audio n'est créé qu'au premier son joué (il faut un geste de l'utilisateur,
 * la plupart des navigateurs bloquent l'audio avant). Tout est silencieux en cas de refus.
 */

// [fréquence (Hz), délai de départ (s), durée (s), type d'onde, volume (0-1)]
const SEQUENCES = {
  'bonne-reponse': [
    [659.25, 0, 0.12, 'sine', 0.22],
    [880.0, 0.1, 0.2, 'sine', 0.22],
  ],
  'mauvaise-reponse': [
    [220.0, 0, 0.14, 'triangle', 0.25],
    [164.81, 0.12, 0.22, 'triangle', 0.25],
  ],
  defaite: [
    [293.66, 0, 0.18, 'triangle', 0.26],
    [233.08, 0.16, 0.18, 'triangle', 0.26],
    [174.61, 0.32, 0.34, 'triangle', 0.26],
  ],
};

let contexte = null;

function audio() {
  if (contexte) return contexte;
  const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return null;
  contexte = new Ctor();
  return contexte;
}

/** Joue un des trois sons du jeu. Ignore les noms inconnus et les erreurs audio. */
export function jouerSon(nom) {
  const notes = SEQUENCES[nom];
  const ctx = audio();
  if (!notes || !ctx) return;
  try {
    if (ctx.state === 'suspended') void ctx.resume();
    const debut = ctx.currentTime;
    for (const [frequence, attente, duree, type, volume] of notes) {
      const oscillateur = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillateur.type = type;
      oscillateur.frequency.value = frequence;
      // Enveloppe : montée très rapide puis descente douce, pour éviter le clic.
      const t0 = debut + attente;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
      oscillateur.connect(gain);
      gain.connect(ctx.destination);
      oscillateur.start(t0);
      oscillateur.stop(t0 + duree + 0.05);
    }
  } catch {
    /* audio refusé ou indisponible : le jeu reste silencieux */
  }
}

export const SONS = Object.keys(SEQUENCES);
export { SEQUENCES };
