import type { UserStyle } from './types';

const KEY = 'six-style';

export const DEFAULT_STYLE: UserStyle = {
  decontracte: 50,
  detaille: 50,
  emojis: false,
  expressions: [],
};

/** Le style reste sur le téléphone (localStorage). Il n'est envoyé que comme consigne de rédaction. */
export function loadStyle(): UserStyle | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const o = JSON.parse(raw) as Partial<UserStyle>;
    return {
      decontracte: typeof o.decontracte === 'number' ? o.decontracte : 50,
      detaille: typeof o.detaille === 'number' ? o.detaille : 50,
      emojis: o.emojis === true,
      expressions: Array.isArray(o.expressions)
        ? o.expressions.filter((e): e is string => typeof e === 'string').slice(0, 5)
        : [],
    };
  } catch {
    return undefined;
  }
}

export function saveStyle(style: UserStyle): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(style));
  } catch {
    /* stockage bloqué : le style vaut pour cette visite seulement */
  }
}

export function clearStyle(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien à effacer */
  }
}
