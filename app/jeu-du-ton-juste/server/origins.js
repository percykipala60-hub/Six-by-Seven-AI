// origins.js — Qui a le droit d'appeler le serveur d'évaluation.
//
// Le CORS ne protège que le navigateur : un client qui n'est pas un navigateur (curl, script) reçoit
// la réponse quoi qu'il arrive et consomme la clé API. On refuse donc explicitement :
//   • une origine déclarée mais inconnue (audit du 17/10/2026 : une origine étrangère était traitée) ;
//   • un appel sans en-tête Origin venant d'une autre machine que la machine locale.

// Le jeu en développement (vite, port 5180) et la version construite (vite preview, port 4173).
export const ORIGINES_PAR_DEFAUT = [
  'http://localhost:5180',
  'http://127.0.0.1:5180',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

/** Liste blanche lue dans ALLOWED_ORIGINS (séparées par des virgules), sinon la liste par défaut. */
export function lireListeOrigines(valeur) {
  const liste = String(valeur || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return liste.length ? liste : ORIGINES_PAR_DEFAUT;
}

/** Adresses considérées comme locales (le jeu tourne sur le poste du joueur). */
export function estLocale(ip) {
  if (!ip) return false;
  const propre = String(ip).replace(/^::ffff:/i, '');
  return propre === '127.0.0.1' || propre === '::1' || propre === 'localhost';
}

/**
 * Renvoie { autorise } ou { autorise: false, raison } pour le journal.
 * @param {string|undefined} origin en-tête Origin, absent pour un client non-navigateur
 * @param {string} ip adresse de l'appelant
 * @param {string[]} origines liste blanche (ALLOWED_ORIGINS)
 */
export function lireOrigine(origin, ip, origines) {
  if (origin) {
    return origines.includes(origin)
      ? { autorise: true }
      : { autorise: false, raison: `origine refusée : ${origin}` };
  }
  return estLocale(ip)
    ? { autorise: true }
    : { autorise: false, raison: `appel sans origine depuis ${ip}` };
}
