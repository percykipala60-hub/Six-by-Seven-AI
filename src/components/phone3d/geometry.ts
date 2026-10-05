import * as THREE from "three";

// Dimensions réelles en centimètres (1 unité = 1 cm).
// `inset` : distance entre le bord du téléphone et l'image (cadre métal visible + bordure noire),
// identique sur les quatre côtés, comme sur un vrai téléphone.
export const SPECS = {
  pro: { w: 7.19, h: 15.0, d: 0.875, r: 1.15, inset: 0.27 },
  ultra: { w: 7.19, h: 15.0, d: 0.86, r: 0.5, inset: 0.27 },
} as const;

type Radii = { tl: number; tr: number; br: number; bl: number };

// Rectangle arrondi centré, avec un rayon par coin.
export function roundedRect(w: number, h: number, r: number | Radii) {
  const { tl, tr, br, bl } = typeof r === "number" ? { tl: r, tr: r, br: r, bl: r } : r;
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + bl, y);
  s.lineTo(x + w - br, y);
  s.quadraticCurveTo(x + w, y, x + w, y + br);
  s.lineTo(x + w, y + h - tr);
  s.quadraticCurveTo(x + w, y + h, x + w - tr, y + h);
  s.lineTo(x + tl, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - tl);
  s.lineTo(x, y + bl);
  s.quadraticCurveTo(x, y, x + bl, y);
  return s;
}

// Volume extrudé aux arêtes adoucies, centré sur l'origine.
export function roundedSlab(w: number, h: number, depth: number, r: number | Radii, bevel: number) {
  const shape = roundedRect(w - bevel * 2, h - bevel * 2, shrink(r, bevel));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - bevel * 2, 0.001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 10,
    curveSegments: 48,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function shrink(r: number | Radii, by: number): number | Radii {
  if (typeof r === "number") return Math.max(r - by, 0.01);
  return {
    tl: Math.max(r.tl - by, 0.01),
    tr: Math.max(r.tr - by, 0.01),
    br: Math.max(r.br - by, 0.01),
    bl: Math.max(r.bl - by, 0.01),
  };
}
