// Photo de studio HDR (CC0, Poly Haven) : métal et verre reflètent une vraie pièce, pas des formes géométriques.
// Fichier à part (et non plus intégré au JavaScript de la 3D) : il se télécharge en parallèle et reste en cache.
import studioHdr from "./studio.exr?url";

export { studioHdr };

// Lance son téléchargement tout de suite, en même temps que celui de la 3D, pour que la scène
// n'ait pas à l'attendre une fois chargée.
let preloaded = false;
export function preloadStudioHdr() {
  if (preloaded || typeof document === "undefined") return;
  preloaded = true;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "fetch";
  link.crossOrigin = "anonymous";
  link.href = studioHdr;
  document.head.appendChild(link);
}
