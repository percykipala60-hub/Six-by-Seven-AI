// Mode léger : appareil modeste (peu de mémoire vive, processeur lent) ou économiseur de données activé.
// Le site s'y passe de tout ce qui peut le faire geler ou fermer l'onglet faute de mémoire : pas de 3D
// (la visite devient un haut de page classique, au défilement normal), fond fixe au lieu des vagues animées,
// couleurs du site fixes au lieu du thème caméléon. Le contenu, lui, reste exactement le même.
// ?lite dans l'adresse : force le mode léger (pour le vérifier) ; ?full : le désactive.

type NavigatorHints = Navigator & {
  deviceMemory?: number; // Go, arrondi (Chrome, Edge, Samsung Internet ; absent sur iPhone et Firefox)
  connection?: { saveData?: boolean };
};

let cached: boolean | null = null;

export function isLiteDevice(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") return (cached = false);
  const q = new URLSearchParams(window.location.search);
  if (q.has("lite")) return (cached = true);
  if (q.has("full")) return (cached = false);
  const nav = navigator as NavigatorHints;
  const memory = nav.deviceMemory;
  const cores = nav.hardwareConcurrency;
  cached =
    // Moins de 4 Go de mémoire vive : la 3D (modèles, textures, contexte graphique) peut à elle seule
    // pousser le navigateur à fermer l'onglet.
    (memory !== undefined && memory < 4) ||
    // Deux cœurs ou moins : la page gèlerait pendant la construction des appareils.
    (cores !== undefined && cores <= 2) ||
    // Le visiteur a demandé d'économiser ses données : pas de gros fichiers 3D à télécharger.
    nav.connection?.saveData === true ||
    window.matchMedia("(prefers-reduced-data: reduce)").matches;
  return cached;
}
