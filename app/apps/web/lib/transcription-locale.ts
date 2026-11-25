export function urlTranscriptionLocale(): string {
  return (process.env.SIX_TRANSCRIPTION_LOCALE ?? '').trim().replace(/\/$/, '');
}

export async function transcriptionLocaleDisponible(): Promise<boolean> {
  const url = urlTranscriptionLocale();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    return res.ok && (await res.json()).ready === true;
  } catch {
    return false;
  }
}
