'use client';

import { entetesCompte } from './premium-client';

/**
 * Outil « ordinateur » côté page : l'agent de Six (sur le serveur) demande une action ; l'app de bureau l'exécute
 * (elle demande l'accord de la personne pour chaque application et applique ses interdits) ; le résultat repart vers
 * l'agent par POST /api/chat/ordinateur. Hors de l'app de bureau, l'outil n'est jamais proposé.
 */
type PontOrdinateur = {
  piloter: (
    commande: Record<string, unknown>,
  ) => Promise<{ ok: true; resultat: unknown } | { ok: false; erreur: string }>;
};

export function pontOrdinateur(): PontOrdinateur | null {
  if (typeof window === 'undefined') return null;
  const p = (window as unknown as { sixBureau?: { ordinateur?: PontOrdinateur } }).sixBureau
    ?.ordinateur;
  return p?.piloter ? p : null;
}

/** Les captures d'écran ne repartent pas vers l'agent en entier : seulement leur présence (le texte suffit). */
function texteDuResultat(r: unknown): string {
  if (r && typeof r === 'object' && 'image' in r) {
    const { image, ...reste } = r as { image?: string };
    return JSON.stringify({
      ...reste,
      capture: image ? 'prise (image gardée sur l’ordinateur)' : 'absente',
    });
  }
  return JSON.stringify(r);
}

export async function executerOrdinateur(id: string, args: unknown): Promise<void> {
  const pont = pontOrdinateur();
  let resultat: string;
  if (!pont)
    resultat = 'Contrôle de l’ordinateur indisponible ici (seulement dans l’app de bureau).';
  else if (!args || typeof args !== 'object') resultat = 'Demande illisible.';
  else {
    try {
      const r = await pont.piloter(args as Record<string, unknown>);
      resultat = r.ok ? texteDuResultat(r.resultat) : `Action non accomplie : ${r.erreur}`;
    } catch (e) {
      resultat = `Action non accomplie : ${e instanceof Error ? e.message : 'échec'}`;
    }
  }
  try {
    await fetch('/api/chat/ordinateur', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
      body: JSON.stringify({ id, resultat: resultat.slice(0, 60_000) }),
    });
  } catch {
    /* hors ligne : l'agent conclura après son délai d'attente */
  }
}
