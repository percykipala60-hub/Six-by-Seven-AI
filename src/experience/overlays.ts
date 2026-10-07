import { T, range } from "./timeline";

// Opacité des guides plein écran : ils apparaissent à la fin de la plongée dans l'écran
// (même fond que l'appli, la transition ne se voit pas) et s'effacent au début de la sortie.
const overlay = (p: number, dive: readonly [number, number], exit: readonly [number, number]) =>
  Math.min(range(p, dive[0] + (dive[1] - dive[0]) * 0.72, dive[1]), 1 - range(p, exit[0], exit[0] + 0.25));

export const phoneOverlayAt = (p: number) => overlay(p, T.phoneDive, T.phoneExit);
export const laptopOverlayAt = (p: number) => overlay(p, T.laptopDive, T.laptopExit);

// Scène 3D entièrement cachée : inutile de la dessiner.
export const coveredAt = (p: number) => phoneOverlayAt(p) >= 1 || laptopOverlayAt(p) >= 1;
