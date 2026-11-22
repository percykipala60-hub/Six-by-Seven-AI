/**
 * Seule chose que Six garde sur le téléphone : combien de fois tu as choisi chaque type de
 * brouillon (« Directe » : 4). Aucun texte. Effaçable à tout moment.
 */
const KEY = 'six.choix.v1';

export function loadChoices(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([k, v]) => k.length <= 30 && typeof v === 'number' && Number.isFinite(v))
        .slice(0, 20),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

export function rememberChoice(style: string): void {
  const key = style.trim().toLowerCase().slice(0, 30);
  if (!key) return;
  try {
    const choices = loadChoices();
    choices[key] = (choices[key] ?? 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(choices));
  } catch {
    // Navigation privée ou stockage bloqué : Six marche quand même, sans se souvenir.
  }
}

export function forgetChoices(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien à effacer
  }
}
