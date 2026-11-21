/**
 * Compte de l'utilisateur, côté interface (décision du 2026-10-10 : structure + mode invité, aucun serveur).
 *
 * Aujourd'hui : toujours « invité ». Le prénom choisi reste sur le téléphone et sert à saluer.
 * Plus tard : un fournisseur de connexion (à choisir par l'équipe) remplira `connecte`, et le compte servira
 * à synchroniser la mémoire de Six entre appareils (il faudra alors réécrire la page Confidentialité).
 * L'interface (avatar, écran Compte) lit seulement ce module : brancher le fournisseur ne la change pas.
 */

const KEY = "six-compte";
const EVT = "six-compte";

export type Compte =
  | { statut: "invite"; prenom: string }
  | { statut: "connecte"; prenom: string; email: string; photo?: string };

/** Vrai quand un fournisseur de connexion est branché. Faux tant que l'équipe n'en a pas choisi. */
export const CONNEXION_DISPONIBLE = false;

export function lireCompte(): Compte {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { prenom?: unknown };
    const prenom = typeof o.prenom === "string" ? o.prenom.trim().slice(0, 30) : "";
    return { statut: "invite", prenom };
  } catch {
    return { statut: "invite", prenom: "" };
  }
}

export function ecrirePrenom(prenom: string): void {
  try {
    const p = prenom.trim().slice(0, 30);
    if (p) localStorage.setItem(KEY, JSON.stringify({ prenom: p }));
    else localStorage.removeItem(KEY);
  } catch {
    /* stockage bloqué : le prénom vaut pour cette visite */
  }
  window.dispatchEvent(new Event(EVT));
}

/** S'abonne aux changements de compte (autre écran, autre onglet). */
export function ecouterCompte(f: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && f();
  window.addEventListener(EVT, f);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVT, f);
    window.removeEventListener("storage", onStorage);
  };
}

export function initiale(c: Compte): string {
  return c.prenom ? c.prenom.charAt(0).toLocaleUpperCase("fr-FR") : "";
}

/** Salutation selon l'heure du téléphone. */
export function salutation(d = new Date()): string {
  const h = d.getHours();
  return h >= 5 && h < 12 ? "Bonjour" : h >= 12 && h < 18 ? "Bon après-midi" : "Bonsoir";
}
