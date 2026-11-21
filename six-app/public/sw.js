// Service worker de Six : l'application s'ouvre sans réseau. Les appels /api ne sont JAMAIS mis en cache
// (ils contiennent la conversation masquée) et rien d'autre que l'application elle-même n'est stocké.
const VERSION = "six-v5"; // Six 3 : nouvelle interface (2026-10-10)
const SHARE_CACHE = "six-share"; // gardé le temps de la redirection, vidé dès que l'app a lu le contenu
const SHELL = ["/", "/sujets", "/reglages", "/confidentialite", "/manifest.json", "/icon-192.png", "/icon-512.png", "/six-glyphe.png", "/six-trait.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl))) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

// Reçoit ce qui est partagé vers Six (export de discussion, texte ou captures d'écran). Rien n'est envoyé à un serveur :
// le contenu reste dans le navigateur, puis l'app le lit et le supprime.
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    await cache.delete("/shared-file");
    await cache.delete("/shared-text");
    const previous = await cache.match("/shared-images");
    if (previous) {
      const n = Number(await previous.text()) || 0;
      for (let i = 0; i < n; i++) await cache.delete(`/shared-image-${i}`);
      await cache.delete("/shared-images");
    }
    const file = form.get("chat");
    const text = [form.get("title"), form.get("text")].filter((v) => typeof v === "string" && v).join("\n");
    // Captures d'écran partagées depuis la galerie : gardées dans l'ordre, 4 au maximum, lues ensuite sur le téléphone.
    const images = form
      .getAll("captures")
      .filter((f) => f && typeof f !== "string" && f.size > 0 && (f.type || "").startsWith("image/"))
      .slice(0, 4);
    if (images.length) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        await cache.put(
          `/shared-image-${i}`,
          new Response(img, { headers: { "x-name": encodeURIComponent(img.name || `capture-${i + 1}.png`), "x-time": String(img.lastModified || i), "content-type": img.type } }),
        );
      }
      await cache.put("/shared-images", new Response(String(images.length)));
    } else if (file && typeof file !== "string" && file.size > 0) {
      await cache.put("/shared-file", new Response(file, { headers: { "x-name": encodeURIComponent(file.name || "discussion.txt"), "content-type": file.type || "text/plain" } }));
    } else if (text) {
      await cache.put("/shared-text", new Response(text));
    }
  } catch {
    /* l'app affichera l'écran WhatsApp pour choisir le fichier à la main */
  }
  return Response.redirect("/?shared=1", 303);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === "POST" && url.origin === self.location.origin && url.pathname === "/share-target") {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/ocr/") || /\.(png|ico|json)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
