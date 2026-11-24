'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * App de bureau (apps/bureau) : la barre du haut demande d'aller dans un espace (Chat, Cosinus, Responsive,
 * Réglages). On y va sans recharger la page. Seules ces adresses sont acceptées.
 */
const ESPACES = new Set(['/chat', '/cosinus', '/responsive', '/reglages']);

export function PontBureau() {
  const router = useRouter();
  useEffect(() => {
    const aller = (e: Event) => {
      const d = (e as CustomEvent<{ type?: string; chemin?: string }>).detail;
      if (d?.type === 'aller' && typeof d.chemin === 'string' && ESPACES.has(d.chemin))
        router.push(d.chemin);
    };
    window.addEventListener('six-bureau', aller);
    return () => window.removeEventListener('six-bureau', aller);
  }, [router]);
  return null;
}
