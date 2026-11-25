import { NextResponse } from 'next/server';
import { guard } from '@/lib/http';

/**
 * Mode vocal : charge à l'avance le modèle local (Ollama) sur la carte graphique, pendant que la personne parle.
 * Le premier chargement prend une vingtaine de secondes ; ensuite une réponse courte arrive en deux ou trois.
 * Sans IA locale (serveur en ligne), ne fait rien.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;
  const modele = (process.env.IA_LOCALE_MODELE ?? '').trim();
  if (!modele) return NextResponse.json({ ok: false });
  const base = ((process.env.IA_LOCALE_URL ?? '').trim() || 'http://127.0.0.1:11434').replace(
    /\/+$/,
    '',
  );
  // Une demande sans texte : Ollama charge seulement le modèle et le garde en mémoire.
  void fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modele,
      keep_alive: (process.env.IA_LOCALE_GARDER ?? '').trim() || '30m',
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
