'use client';

import { useEffect, useState } from 'react';

/** Retire l'ancien service worker PWA et signale les coupures réseau de l'application mobile. */
export function NetworkStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    async function removeLegacyPwa() {
      if (!('serviceWorker' in navigator)) return;
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) =>
            [registration.active, registration.waiting, registration.installing].some(
              (worker) => worker?.scriptURL === new URL('/sw.js', location.origin).href,
            ),
          )
          .map((registration) => registration.unregister()),
      );
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key === 'six-share' || key.startsWith('six-v'))
            .map((key) => caches.delete(key)),
        );
      }
    }
    void removeLegacyPwa().catch((error: unknown) => {
      console.error("[native-app] impossible de supprimer l'ancien service worker", error);
    });
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="demo" role="status" style={{ margin: '8px 16px 0' }}>
      Pas de réseau. Vous pouvez continuer à préparer votre texte, l&apos;analyse reprendra au
      retour du réseau.
    </div>
  );
}
