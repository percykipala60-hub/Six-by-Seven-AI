import { useSyncExternalStore } from "react";

// Consentement aux cookies et traceurs, dans l'esprit des recommandations de la CNIL :
// - rien d'optionnel n'est déposé avant un choix ;
// - « Tout refuser » est aussi simple que « Tout accepter » ;
// - le choix est fait catégorie par catégorie, il peut être modifié à tout moment (pied de page) ;
// - il est gardé 6 mois, puis la question est reposée.
// Le choix lui-même est rangé sur l'appareil (stockage local), jamais envoyé à un serveur.

export type ConsentCategory = "audience" | "translation";
export type ConsentChoices = Record<ConsentCategory, boolean>;
type Stored = { v: 1; date: number; choices: ConsentChoices };

const KEY = "six:consent";
const MAX_AGE = 1000 * 60 * 60 * 24 * 182; // environ 6 mois

function read(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
    if (!s || s.v !== 1 || Date.now() - s.date > MAX_AGE) return null;
    return s;
  } catch {
    return null;
  }
}

let state = { stored: read(), panelOpen: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function saveConsent(choices: ConsentChoices) {
  const stored: Stored = { v: 1, date: Date.now(), choices };
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* stockage indisponible : le choix vaut pour cette visite */
  }
  state = { stored, panelOpen: false };
  emit();
}

export const acceptAll = () => saveConsent({ audience: true, translation: true });
export const refuseAll = () => saveConsent({ audience: false, translation: false });

// Accord donné par un geste explicite (choisir une langue étrangère vaut accord pour la traduction).
export function grantConsent(c: ConsentCategory) {
  saveConsent({ ...(state.stored?.choices ?? { audience: false, translation: false }), [c]: true });
}

export function openConsentPanel() {
  state = { ...state, panelOpen: true };
  emit();
}
export function closeConsentPanel() {
  state = { ...state, panelOpen: false };
  emit();
}

// Une catégorie est-elle acceptée ? Faux tant que le visiteur n'a pas choisi.
export const hasConsent = (c: ConsentCategory) => state.stored?.choices[c] === true;

// Prévient quand le choix change (pour charger un outil de mesure d'audience, par exemple).
export const onConsentChange = (l: () => void) => subscribe(l);

export function useConsent() {
  return useSyncExternalStore(subscribe, () => state);
}
