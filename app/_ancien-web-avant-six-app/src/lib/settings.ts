/**
 * Réglages de Six, gardés sur le téléphone seulement (aucun compte, aucun serveur).
 * Aucun texte de conversation ici : seulement des préférences.
 */
import { useSyncExternalStore } from 'react';
import type { Language, Longueur, Moteur, Tone } from '@six/shared';
import { SETTINGS_KEY as KEY } from './settings-boot';

export const ACCENTS = {
  bleu: { nom: 'Bleu Seven.AI', fort: '#4d7cfe', doux: '#8fadff', clair: '#2f5fe0' },
  vert: { nom: 'Vert', fort: '#22b07d', doux: '#7fdcb8', clair: '#137a55' },
  orange: { nom: 'Orange', fort: '#f0a03c', doux: '#f7c98a', clair: '#a8620b' },
  gris: { nom: 'Gris', fort: '#8a94a8', doux: '#c3cad8', clair: '#4a5670' },
} as const;
export type Accent = keyof typeof ACCENTS;

export interface Settings {
  theme: 'sombre' | 'clair' | 'auto';
  accent: Accent;
  contraste: boolean;
  grandTexte: boolean;
  ton: Tone;
  longueur: Longueur;
  langue: Language;
  moteur: Moteur;
  remettreNoms: boolean;
  /** Moins de messages envoyés, une seule demande au serveur (pas d'étape d'analyse). */
  economie: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'sombre',
  accent: 'bleu',
  contraste: false,
  grandTexte: false,
  ton: 'naturel',
  longueur: 'moyen',
  langue: 'fr',
  moteur: 'auto',
  remettreNoms: true,
  economie: false,
};

const listeners = new Set<() => void>();
let cache: Settings | undefined;

function read(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    cache = { ...DEFAULT_SETTINGS, ...pick(parsed) };
  } catch {
    cache = DEFAULT_SETTINGS;
  }
  return cache;
}

/** Ne garde que des valeurs connues : un stockage abîmé ne casse jamais l'app. */
function pick(input: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (input.theme && ['sombre', 'clair', 'auto'].includes(input.theme)) out.theme = input.theme;
  if (input.accent && input.accent in ACCENTS) out.accent = input.accent;
  for (const key of ['contraste', 'grandTexte', 'remettreNoms', 'economie'] as const) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  if (typeof input.ton === 'string') out.ton = input.ton;
  if (input.longueur && ['court', 'moyen', 'detaille'].includes(input.longueur))
    out.longueur = input.longueur;
  if (input.langue && ['fr', 'en', 'ln'].includes(input.langue)) out.langue = input.langue;
  if (input.moteur && ['auto', 'qualite', 'rapide', 'confidentiel'].includes(input.moteur))
    out.moteur = input.moteur;
  return out;
}

export function updateSettings(patch: Partial<Settings>): void {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Stockage bloqué : le réglage vaut pour cette visite.
  }
  applySettings(cache);
  for (const listener of listeners) listener();
}

export function resetAppearance(): void {
  updateSettings({ theme: 'sombre', accent: 'bleu', contraste: false, grandTexte: false });
}

/** Applique thème, accent, contraste et taille de texte sur <html>. */
export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  const dark =
    settings.theme === 'sombre' ||
    (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.contraste = settings.contraste ? 'eleve' : 'normal';
  root.dataset.texte = settings.grandTexte ? 'grand' : 'normal';
  const accent = ACCENTS[settings.accent];
  root.style.setProperty('--color-accent', dark ? accent.fort : accent.clair);
  root.style.setProperty('--color-accent-soft', dark ? accent.doux : accent.clair);
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => DEFAULT_SETTINGS,
  );
}
