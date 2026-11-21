import type { MetadataRoute } from 'next';
import { PRODUCT_NAME, TAGLINE } from '@six/shared';

/** share_target n'est pas encore dans les types de Next : on l'ajoute nous-mêmes. */
type ManifestWithShare = MetadataRoute.Manifest & {
  share_target: {
    action: string;
    method: 'POST';
    enctype: 'multipart/form-data';
    params: { title?: string; text?: string; files?: { name: string; accept: string[] }[] };
  };
};

export default function manifest(): ManifestWithShare {
  return {
    id: '/',
    name: `${PRODUCT_NAME} — ${TAGLINE}`,
    short_name: PRODUCT_NAME,
    description: "Six t'aide à répondre à une conversation, sans jamais parler à ta place.",
    lang: 'fr',
    start_url: '/accueil',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0f1c',
    theme_color: '#0a0f1c',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Appui long sur l'icône de Six (Android, et iPhone pour les PWA récentes).
    shortcuts: [
      {
        name: 'Nouvelle conversation',
        url: '/repondre',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      { name: 'Coller et analyser', short_name: 'Coller', url: '/repondre' },
      { name: 'Quoi dire ?', url: '/quoi-dire' },
      { name: 'Vérifier une arnaque', url: '/arnaques' },
    ],
    // « Partager vers Six » depuis WhatsApp (Android, PWA installée). Pas disponible sur iPhone.
    share_target: {
      action: '/partage',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        files: [{ name: 'fichier', accept: ['text/plain', '.txt', 'application/zip', '.zip'] }],
      },
    },
  };
}
