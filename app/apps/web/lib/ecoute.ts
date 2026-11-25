'use client';

/**
 * Écoute d'une phrase par le micro, pour le mode vocal là où la dictée du navigateur n'existe pas (app de bureau :
 * Electron n'a pas accès à la reconnaissance vocale de Google). On enregistre, on repère la fin de la phrase par le
 * silence (même mesure de volume que la sphère), puis le serveur de Six transcrit (moteur local ou service vocal).
 *
 * Voix et bruits : le bruit de fond de la pièce est mesuré au début ; ne compte comme voix qu'un son nettement plus
 * fort que ce fond ET qui dure (un claquement ou un objet qui tombe ne déclenche rien).
 */

/** Fin de phrase : silence de cette durée après avoir entendu la voix. */
const SILENCE_MS = 900;
/** Une phrase ne dure pas plus de 25 secondes. */
const PHRASE_MAX_MS = 25_000;
/** Personne ne parle pendant ce temps : on arrête cette écoute (le mode vocal en relance une). */
const ATTENTE_MAX_MS = 12_000;
/** Volume (RMS) minimal d'une voix, et marge au-dessus du bruit de fond mesuré. */
const SEUIL_MIN = 0.03;
const MARGE_BRUIT = 2.5;
/** Mesure du bruit de fond au début de l'écoute. */
const CALIBRAGE_MS = 350;
/** Durée minimale d'un son fort pour compter comme une voix (et non un bruit bref). */
const VOIX_MIN_MS = 250;
const PAS_MS = 50;

function volume(analyseur: AnalyserNode, donnees: Uint8Array): number {
  analyseur.getByteTimeDomainData(donnees);
  let somme = 0;
  for (const v of donnees) somme += ((v - 128) / 128) ** 2;
  return Math.sqrt(somme / donnees.length);
}

/** Enregistre une phrase et renvoie son audio (vide si personne n'a parlé). */
export async function enregistrerPhrase(signal?: AbortSignal): Promise<Blob> {
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const contexte = new AudioContext();
  const analyseur = contexte.createAnalyser();
  analyseur.fftSize = 1024;
  contexte.createMediaStreamSource(flux).connect(analyseur);
  const enregistreur = new MediaRecorder(flux);
  const morceaux: Blob[] = [];
  enregistreur.ondataavailable = (e) => {
    if (e.data.size > 0) morceaux.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    const donnees = new Uint8Array(analyseur.fftSize);
    const debut = performance.now();
    const bruits: number[] = [];
    let seuil = SEUIL_MIN;
    let fortDepuis = 0;
    let voixEntendue = false;
    let dernierSon = debut;
    let fini = false;
    let minuterie = 0;

    const terminer = (garder: boolean) => {
      if (fini) return;
      fini = true;
      window.clearInterval(minuterie);
      enregistreur.onstop = () => {
        flux.getTracks().forEach((piste) => piste.stop());
        void contexte.close();
        resolve(
          garder && voixEntendue ? new Blob(morceaux, { type: enregistreur.mimeType }) : new Blob(),
        );
      };
      if (enregistreur.state !== 'inactive') enregistreur.stop();
      else enregistreur.onstop(new Event('stop'));
    };

    signal?.addEventListener('abort', () => terminer(false), { once: true });
    enregistreur.onerror = () => {
      terminer(false);
      reject(new Error('Le micro s’est arrêté. Réessaie.'));
    };
    enregistreur.start(250);

    minuterie = window.setInterval(() => {
      const v = volume(analyseur, donnees);
      const maintenant = performance.now();
      if (maintenant - debut < CALIBRAGE_MS) {
        bruits.push(v);
        return;
      }
      if (bruits.length) {
        const fond = bruits.sort((a, b) => a - b)[Math.floor(bruits.length / 2)] ?? 0;
        seuil = Math.max(SEUIL_MIN, fond * MARGE_BRUIT);
        bruits.length = 0;
      }
      if (v > seuil) {
        fortDepuis = fortDepuis || maintenant;
        if (maintenant - fortDepuis >= VOIX_MIN_MS) voixEntendue = true;
        if (voixEntendue) dernierSon = maintenant;
      } else fortDepuis = 0;
      if (voixEntendue && maintenant - dernierSon > SILENCE_MS) terminer(true);
      else if (!voixEntendue && maintenant - debut > ATTENTE_MAX_MS) terminer(false);
      else if (maintenant - debut > PHRASE_MAX_MS) terminer(true);
    }, PAS_MS);
  });
}

/** Écoute une phrase et la renvoie transcrite (texte vide si personne n'a parlé). */
export async function ecouterPhrase(
  transcrire: (audio: Blob) => Promise<string>,
  signal?: AbortSignal,
): Promise<string> {
  const audio = await enregistrerPhrase(signal);
  if (!audio.size || signal?.aborted) return '';
  return (await transcrire(audio)).trim();
}
