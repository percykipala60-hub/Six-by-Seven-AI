import { bcp47, lirePreferencesVoix } from './voix';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';

/** Ne transmet jamais la voix à un service distant. */
export async function dicterSurTelephone(signal: AbortSignal): Promise<string> {
  const verifierArret = () => {
    if (signal.aborted) throw new Error('Dictée arrêtée.');
  };
  verifierArret();
  if (!Capacitor.isPluginAvailable('SpeechRecognition')) {
    throw new Error('Mets Six à jour pour utiliser le micro natif du téléphone.');
  }
  let permission = await SpeechRecognition.checkPermissions();
  verifierArret();
  if (permission.speechRecognition !== 'granted') {
    permission = await SpeechRecognition.requestPermissions();
  }
  verifierArret();
  if (permission.speechRecognition !== 'granted') throw new Error('refus');
  const options = { language: bcp47(lirePreferencesVoix().langue), preferLegacyRecognizer: true };
  const local = await SpeechRecognition.isOnDeviceRecognitionAvailable(options);
  verifierArret();
  if (!local.available) {
    throw new Error(
      'La reconnaissance vocale locale en français est indisponible sur ce téléphone. Vérifie les langues de dictée téléchargées dans les réglages du téléphone.',
    );
  }
  let arreter: () => void = () => {};
  const interruption = new Promise<never>((_, reject) => {
    arreter = () => reject(new Error('Dictée arrêtée.'));
    signal.addEventListener('abort', arreter, { once: true });
  });
  try {
    verifierArret();
    const resultat = await Promise.race([
      SpeechRecognition.start({
        ...options,
        useOnDeviceRecognition: true,
        partialResults: false,
        popup: false,
        maxResults: 1,
      }),
      interruption,
    ]);
    const texte = resultat.matches?.[0]?.trim();
    if (!texte) throw new Error('dictée vide');
    return texte;
  } finally {
    signal.removeEventListener('abort', arreter);
    await SpeechRecognition.forceStop({ timeout: 1000 }).catch(() => {});
  }
}
