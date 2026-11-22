/* global self, caches */
/*
 * Service worker de Six.
 * 1. Partage depuis WhatsApp (Android) : reçoit le texte ou le fichier, le dépose dans le cache
 *    du téléphone, ouvre /repondre?partage=1. Rien ne part sur le réseau.
 * 2. Hors ligne : les pages et fichiers de l'app restent disponibles sans réseau.
 *    Les appels à l'API (conversations) ne sont JAMAIS mis en cache.
 */
const APP_CACHE = 'six-app-v1';
const SHARE_CACHE = 'six-partage';
const SHARE_KEY = '/__partage-en-attente';
const PAGES = [
  '/',
  '/accueil',
  '/repondre',
  '/outils',
  '/ton',
  '/quoi-dire',
  '/arnaques',
  '/reglages',
  '/confidentialite',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PAGES))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('six-app-') && k !== APP_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function receiveShare(request) {
  const data = await request.formData();
  const file = data.get('fichier');
  const text = [data.get('title'), data.get('text')]
    .filter((v) => typeof v === 'string' && v.trim())
    .join('\n');
  const cache = await caches.open(SHARE_CACHE);
  if (file && typeof file === 'object' && file.size > 0) {
    await cache.put(
      SHARE_KEY,
      new Response(file, { headers: { 'content-type': file.type || 'text/plain' } }),
    );
  } else {
    await cache.put(
      SHARE_KEY,
      new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } }),
    );
  }
  return Response.redirect('/repondre?partage=1', 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname === '/partage'
  ) {
    event.respondWith(receiveShare(request));
    return;
  }
  // Seulement les GET de l'app elle-même ; jamais l'API, jamais une autre origine.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          (request.mode === 'navigate' ||
            url.pathname.startsWith('/_next/static/') ||
            url.pathname.startsWith('/icons/'))
        ) {
          const copy = response.clone();
          void caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
        return cached ?? (await caches.match('/accueil')) ?? Response.error();
      }),
  );
});
