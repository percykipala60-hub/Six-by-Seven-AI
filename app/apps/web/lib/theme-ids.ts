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
