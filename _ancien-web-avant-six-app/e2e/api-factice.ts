import type { Route } from '@playwright/test';

/**
 * Fausse API pour les tests navigateur. L'app (port 3100) appelle l'API sur un autre port :
 * c'est du « cross-origin ». WebKit (iPhone) envoie alors une requête préalable OPTIONS et
 * exige les en-têtes CORS, même sur une réponse simulée ; Chromium est plus permissif.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST',
  'access-control-allow-headers': 'content-type, x-six-pro',
};

/** Répond à la requête préalable OPTIONS. Renvoie true si c'en était une. */
export async function preflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') return false;
  await route.fulfill({ status: 204, headers: CORS });
  return true;
}

/** Réponse JSON simulée, lisible par Chromium ET WebKit. */
export async function json(route: Route, body: unknown, status = 200): Promise<void> {
  if (await preflight(route)) return;
  await route.fulfill({ status, json: body, headers: CORS });
}
