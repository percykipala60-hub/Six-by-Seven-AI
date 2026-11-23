/**
 * Noms des ambiances. Les anciennes versions les appelaient comme des applications : ces noms enregistrés
 * sur les téléphones sont convertis une fois vers les nouveaux, pour que chacun retrouve sa couleur.
 */
export const ANCIENS_ACCENTS: Record<string, string> = {
  facebook: 'azur',
  sms: 'saphir',
  whatsapp: 'jade',
  linkedin: 'cobalt',
  telegram: 'ciel',
  instagram: 'aurore',
  tiktok: 'minuit',
  google: 'nacre',
  claude: 'terre',
  kimi: 'abysse',
  pinterest: 'cerise',
};

/** Couleur choisie (« bleu » par défaut), convertie et réenregistrée si elle porte un ancien nom. */
export function lireAccent(): string {
  try {
    const brut = localStorage.getItem('six-accent');
    if (!brut) return 'bleu';
    const accent = ANCIENS_ACCENTS[brut] ?? brut;
    if (accent !== brut) localStorage.setItem('six-accent', accent);
    return accent;
  } catch {
    return 'bleu';
  }
}

/**
 * Nom de l'icône native correspondant à une couleur. Les icônes déjà installées dans les apps Android et iOS
 * portent encore les anciens noms : on les vise tant que les apps natives n'ont pas été reconstruites.
 */
export function nomIconeNative(accent: string): string {
  return Object.entries(ANCIENS_ACCENTS).find(([, nouveau]) => nouveau === accent)?.[0] ?? accent;
}

/** Couleurs qui gardent toujours le mode clair, même si le téléphone ou les Réglages sont en sombre. */
export const TOUJOURS_CLAIR = new Set(['rose']);

/**
 * Applique le mode (clair, sombre, auto) en tenant compte de la couleur : une couleur « toujours claire »
 * force le mode clair, sans changer le choix enregistré (il revient si on change de couleur).
 */
export function appliquerMode(root: HTMLElement, mode: 'light' | 'dark' | 'auto', accent: string) {
  if (TOUJOURS_CLAIR.has(accent)) root.dataset.theme = 'light';
  else if (mode === 'auto') delete root.dataset.theme;
  else root.dataset.theme = mode;
}
