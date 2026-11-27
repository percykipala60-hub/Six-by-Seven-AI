import { entetesCompte } from './premium-client';

export async function lireAvecElevenLabs(
  texte: string,
  voix: string,
  vitesse: number,
  signal: AbortSignal,
) {
  const res = await fetch('/api/chat/voix', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
    body: JSON.stringify({ texte, voix }),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'La lecture avec ElevenLabs a échoué.');
  }
  const blob = await res.blob();
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.playbackRate = vitesse;
  try {
    await new Promise<void>((resolve, reject) => {
      const finir = (erreur?: unknown) => {
        signal.removeEventListener('abort', annuler);
        if (erreur) reject(erreur);
        else resolve();
      };
      const annuler = () => {
        audio.pause();
        finir(signal.reason);
      };
      audio.onended = () => finir();
      audio.onerror = () => finir(new Error('Impossible de lire l’audio ElevenLabs.'));
      signal.addEventListener('abort', annuler, { once: true });
      void audio.play().catch(finir);
    });
  } finally {
    audio.onended = audio.onerror = null;
    URL.revokeObjectURL(url);
  }
}
