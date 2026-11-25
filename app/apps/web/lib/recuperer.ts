'use client';

import { useEffect, useState } from 'react';
import { entetesCompte } from './premium-client';

/**
 * Lecture des fichiers de l'explorateur. Les fichiers du Cloud (/api/cloud/…) demandent la session du compte :
 * l'en-tête est ajouté ici. Une image, une vidéo ou un son du Cloud ne peut pas porter d'en-tête dans « src » : il
 * est d'abord téléchargé, puis affiché depuis une adresse locale (blob:).
 */
export const estCloud = (url: string) => url.startsWith('/api/cloud/');

export async function recuperer(url: string, init: RequestInit = {}): Promise<Response> {
  const auth = estCloud(url) ? await entetesCompte() : {};
  return fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { ...auth, ...(init.headers as Record<string, string> | undefined) },
  });
}

/** Adresse utilisable dans src/href : telle quelle en local, en blob: pour le Cloud (libérée ensuite). */
export function useSourceMedia(url: string): string {
  const [source, setSource] = useState(estCloud(url) ? '' : url);
  useEffect(() => {
    if (!estCloud(url)) {
      setSource(url);
      return;
    }
    let lien = '';
    let annule = false;
    setSource('');
    recuperer(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b || annule) return;
        lien = URL.createObjectURL(b);
        setSource(lien);
      })
      .catch(() => {});
    return () => {
      annule = true;
      if (lien) URL.revokeObjectURL(lien);
    };
  }, [url]);
  return source;
}
