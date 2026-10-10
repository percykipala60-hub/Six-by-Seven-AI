// L'appareil peut-il afficher la 3D sans souffrir ? Construire les téléphones et ordinateurs en 3D demande
// une vraie carte graphique. Sans elle (rendu logiciel : vieux appareils, ordinateurs sans pilote, robots
// d'indexation comme celui de Google), la page restait figée plusieurs secondes, parfois sans rien afficher.
// « failIfMajorPerformanceCaveat » : le navigateur refuse alors de créer le contexte 3D, et on s'en passe.
// ?no3d dans l'adresse : force la version sans 3D (pour la vérifier).
let cached: boolean | null = null;

export function canRender3D(): boolean {
  if (cached !== null) return cached;
  try {
    if (new URLSearchParams(window.location.search).has("no3d")) return (cached = false);
    const c = document.createElement("canvas");
    const opts = { failIfMajorPerformanceCaveat: true };
    const gl = (c.getContext("webgl2", opts) || c.getContext("webgl", opts)) as WebGLRenderingContext | null;
    // On rend aussitôt le contexte : le navigateur n'en accorde qu'un nombre limité.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    cached = !!gl;
  } catch {
    cached = false;
  }
  return cached;
}
