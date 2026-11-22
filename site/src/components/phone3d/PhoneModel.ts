import * as THREE from "three";
import type { Finish, Model } from "../phone/RealPhone";
import { roundedRect, roundedSlab, SPECS } from "./geometry";
import { carveInto, logoGeometry, roundedPrism, solid, zCylinder } from "./carve";
import { APPLE_PATH, SAMSUNG_PATH } from "./brandLogos";

// Teintes des coloris (aluminium anodisé et verre arrière dépoli).
const FINISH_COLORS: Record<Finish, { metal: string; glass: string }> = {
  // iPhone 18 Pro Max : le verre du dos reprend exactement la teinte de l'aluminium.
  silver: { metal: "#d9dce0", glass: "#e3e5e8" },
  glacier: { metal: "#b7c9d6", glass: "#b3bec8" },
  burgundy: { metal: "#4e1522", glass: "#45121e" },
  black: { metal: "#2b2b2d", glass: "#232325" },
  // Violet cobalt du Galaxy S26 Ultra : cadre plus clair et satiné, dos en verre mat plus profond.
  violet: { metal: "#65618f", glass: "#393660" },
};

// Arrondi des arêtes du cadre : bords bombés sur l'iPhone, flancs plats sur le Galaxy.
const EDGE_BEVEL: Record<Model, number> = { pro: 0.22, ultra: 0.12 };

function makeMaterials(finish: Finish) {
  const c = FINISH_COLORS[finish];
  return {
    // Aluminium satiné : métallique, légèrement rugueux.
    // Le violet du Galaxy est un aluminium anodisé clair : moins métallique, sinon il reflète le studio et vire au bleu nuit.
    metal: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: finish === "violet" ? 0.45 : finish === "silver" ? 1 : 0.75, roughness: finish === "violet" ? 0.4 : 0.34, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    // Bagues d'objectifs et boutons : même teinte, plus polie.
    polished: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 1, roughness: 0.16 }),
    // Bague des objectifs, comme sur les photos d'Apple : aluminium de la couleur du téléphone, satiné,
    // qui garde sa teinte au lieu de refléter le studio en blanc.
    bezel: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 0.85, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    // Fine bague cuivrée et brillante des objectifs du Galaxy S26 Ultra.
    copper: new THREE.MeshPhysicalMaterial({ color: "#c79a8a", metalness: 1, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
    // Verre arrière dépoli.
    frosted: new THREE.MeshPhysicalMaterial({ color: c.glass, metalness: 0.15, roughness: 0.55, clearcoat: finish === "silver" ? 0.6 : 0.3, clearcoatRoughness: 0.5 }),
    // Verre avant (sous l'écran) : noir profond, très brillant.
    frontGlass: new THREE.MeshPhysicalMaterial({ color: "#020203", metalness: 0, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05 }),
    housing: new THREE.MeshPhysicalMaterial({ color: "#060607", metalness: 0.3, roughness: 0.18, clearcoat: 1, envMapIntensity: 1 }),
    // Verre des objectifs avec traitement antireflet irisé (violet / vert).
    lensGlass: new THREE.MeshPhysicalMaterial({
      color: "#000000",
      metalness: 0,
      roughness: 0.03,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 0.9,
      iridescence: 1,
      iridescenceIOR: 1.9,
      iridescenceThicknessRange: [300, 820],
    }),
    lensInner: new THREE.MeshStandardMaterial({ color: "#1b1e26", metalness: 0.9, roughness: 0.3, envMapIntensity: 0.5 }),
    // Barillet en métal sombre et fines bagues claires à l'intérieur de l'objectif.
    barrelLight: new THREE.MeshStandardMaterial({ color: "#a9afba", metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }),
    barrelDim: new THREE.MeshStandardMaterial({ color: "#23262d", metalness: 1, roughness: 0.35, envMapIntensity: 0.6 }),
    // Élément optique : bleu nuit profond avec traitement irisé.
    element: new THREE.MeshPhysicalMaterial({
      color: "#05050a",
      metalness: 0,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 0.3,
      iridescence: 0.6,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [380, 520],
    }),
    pupil: new THREE.MeshStandardMaterial({ color: "#000000", roughness: 0.6, envMapIntensity: 0 }),
    // Verre saphir de protection : presque invisible, il ne se voit qu'à ses reflets.
    // Verre de protection : teinte noire (il n'éclaircit pas l'objectif), seuls ses reflets se voient.
    // Anneau miroir sous le verre : métal sombre poli comme un miroir.
    // Comme sur les photos d'Apple : verre noir profond, à peine réfléchissant.
    mirror: new THREE.MeshPhysicalMaterial({ color: "#07080a", metalness: 0.4, roughness: 0.22, clearcoat: 0.35, clearcoatRoughness: 0.1, envMapIntensity: 0.18 }),
    // Fins cercles concentriques à peine plus clairs, visibles dans le noir de l'objectif.
    mirrorRing: new THREE.MeshStandardMaterial({ color: "#0e0f13", metalness: 0.3, roughness: 0.5, envMapIntensity: 0.15 }),
    // Bord du verre de protection, visible quand on regarde l'objectif de biais.
    coverEdge: new THREE.MeshPhysicalMaterial({ color: "#0d0f14", metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.6 }),
    cover: new THREE.MeshPhysicalMaterial({
      color: "#000000",
      metalness: 0,
      roughness: 0,
      clearcoat: 1,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      envMapIntensity: 0.7,
    }),
    // Liseré d'ombre autour des boutons, et verre du bouton de commande de l'appareil photo.
    gap: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.6 }),
    control: new THREE.MeshPhysicalMaterial({ color: "#0b0c10", metalness: 0.2, roughness: 0.08, clearcoat: 1, envMapIntensity: 1 }),
    // Flash : grand diffuseur blanc laiteux.
    flash: new THREE.MeshPhysicalMaterial({ color: "#efe9da", emissive: "#141310", roughness: 0.55, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 0.5 }),
    sensor: new THREE.MeshPhysicalMaterial({ color: "#000000", roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.2, envMapIntensity: 0.1 }),
    // Lignes d'antenne : fines bandes un ton plus sombre que le cadre.
    antenna: new THREE.MeshStandardMaterial({ color: new THREE.Color(c.metal).multiplyScalar(0.5), roughness: 0.6, metalness: 0.2 }),
    // Parois des trous de la tranche (port, haut-parleurs) : noir mat, la lumière y meurt.
    hole: new THREE.MeshStandardMaterial({ color: "#070708", roughness: 0.9, metalness: 0, envMapIntensity: 0.04 }),
    // Logo Apple : métal poli miroir, de la teinte du coloris.
    logo: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 1, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.3 }),
    // Inscription Samsung : sérigraphie métallisée, un ton plus clair que le verre.
    print: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 0.7, roughness: 0.35, envMapIntensity: 0.8 }),
  };
}

type M = ReturnType<typeof makeMaterials>;
type V3 = [number, number, number];

// Maillage posé, tourné et mis à l'échelle (rotations en radians, ordre XYZ).
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], position?: V3, rotation?: V3, scale?: V3) {
  const o = new THREE.Mesh(geometry, material);
  if (position) o.position.set(...position);
  if (rotation) o.rotation.set(...rotation);
  if (scale) o.scale.set(...scale);
  return o;
}
function group(position?: V3, ...children: THREE.Object3D[]) {
  const g = new THREE.Group();
  if (position) g.position.set(...position);
  if (children.length) g.add(...children);
  return g;
}

const FACE: V3 = [0, Math.PI, 0];

// Îlot photo du S26 Ultra (cm).
const ISLAND = { w: 1.75, h: 5.5 };

// Lignes d'antenne : courtes bandes isolantes qui coupent le cadre métallique, près des quatre coins,
// sur les flancs et sur les tranches du haut et du bas.
// Sur le Galaxy, celles des tranches sont rapprochées des coins : sinon la ligne du bas traverse
// le logement du S Pen et semble flotter au-dessus du trou.
function antennaLines(w: number, h: number, d: number, bevel: number, m: M, model: Model) {
  const endInset = model === "ultra" ? 0.55 : 1.15;
  const flat = d - 2 * bevel - 0.04;
  const band = 0.05;
  const g = group();
  for (const side of [-1, 1])
    for (const y of [h / 2 - 1.9, -h / 2 + 1.9]) g.add(mesh(new THREE.PlaneGeometry(flat, band), m.antenna, [side * (w / 2 + 0.0015), y, 0], [0, (side * Math.PI) / 2, 0]));
  for (const end of [-1, 1])
    for (const sx of [-1, 1])
      g.add(mesh(new THREE.PlaneGeometry(flat, band), m.antenna, [sx * (w / 2 - endInset), end * (h / 2 + 0.0015), 0], [(-end * Math.PI) / 2, 0, Math.PI / 2]));
  return g;
}
// Ordonnée d'un point situé à `frac` de la hauteur en partant du haut.
const yAt = (h: number, frac: number) => h / 2 - frac * h;
// Demi-angle d'ouverture du verre de protection : bombé de façon presque invisible.
const COVER = 0.1;

// Objectif complet, orienté vers l'arrière (-z), posé sur une surface à la profondeur `z`.
// « apple » : bague métal épaisse au chanfrein poli, large anneau noir, grand verre fumé très réfléchissant.
// « samsung » : fine bague métal en cylindre haut, liseré noir étroit, verre teinté vert-bleu.
// Objectif d'après un vrai iPhone : bague métal au dessus plat (à peine chanfreiné), verre de protection
// qui dépasse légèrement de la bague et dont on sent le bord, bombé de façon presque invisible.
// Sous le verre, un anneau miroir ; au centre de ce miroir, la caméra, enfoncée.
// `large` : le troisième objectif de l'iPhone, dont la caméra intérieure est nettement plus grande que celle
// des deux objectifs alignés verticalement.
function lens({
  x,
  y,
  z,
  r,
  m,
  look = "apple",
  height: heightIn,
  large = false,
}: {
  x: number;
  y: number;
  z: number;
  r: number;
  m: M;
  look?: "apple" | "samsung";
  height?: number;
  large?: boolean;
}) {
  const rot: V3 = [Math.PI / 2, 0, 0];
  const apple = look === "apple";
  const height = heightIn ?? (apple ? 0.18 : 0.22);
  const top = -height; // dessus de la bague (l'objectif sort vers -z)
  const inner = r * (apple ? 0.87 : 0.88); // bord intérieur de la bague : le verre commence ici
  // Ouverture de la caméra au centre du verre noir, mesurée sur les photos d'Apple :
  // petite sur les deux objectifs de gauche, nettement plus grande sur celui de droite.
  const g = r * (apple ? (large ? 0.5 : 0.36) : 0.42);
  const glassRise = 0.022; // le verre monte un peu au-dessus de la bague
  const coverR = inner / Math.sin(COVER);
  const glassTop = top - glassRise;
  const out = group([x, y, z]);
  // Ombre douce portée par l'objectif sur le plateau (vers le bas à droite sur les photos)
  if (apple) out.add(mesh(new THREE.CircleGeometry(r * 1.22, 64), getLensShadow(), [-r * 0.05, -r * 0.08, -0.002], FACE));
  // Bague métallique : flanc, dessus plat et fin chanfrein qui accroche la lumière
  out.add(mesh(new THREE.CylinderGeometry(r, r, height, 72, 1, true), apple ? m.bezel : m.copper, [0, 0, top / 2], rot));
  out.add(mesh(new THREE.RingGeometry(inner, r - 0.012, 96), apple ? m.bezel : m.copper, [0, 0, top], FACE));
  out.add(mesh(new THREE.TorusGeometry(r - 0.012, 0.012, 8, 96), m.polished, [0, 0, top + 0.006]));
  // Bord du verre : on sent le cercle qui dépasse de la bague
  out.add(mesh(new THREE.CylinderGeometry(inner, inner, glassRise, 96, 1, true), m.coverEdge, [0, 0, top - glassRise / 2], rot));
  // Anneau miroir sous le verre
  out.add(mesh(new THREE.RingGeometry(g, inner, 96), m.mirror, [0, 0, top + 0.003], FACE));
  if (apple) for (const k2 of [0.62, 0.8]) out.add(mesh(new THREE.RingGeometry(r * k2 - 0.008, r * k2, 96), m.mirrorRing, [0, 0, top + 0.0025], FACE));
  // Dans le verre noir : un anneau gris très sombre, puis la lentille, sombre, avec un petit reflet
  // (bleu-violet sur l'iPhone, bleu-turquoise sur le Galaxy), comme sur les photos.
  out.add(mesh(new THREE.RingGeometry(g * 0.8, g, 72), m.mirrorRing, [0, 0, top + 0.002], FACE));
  out.add(mesh(new THREE.CircleGeometry(g * 0.8, 72), m.pupil, [0, 0, top + 0.0015], FACE));
  out.add(mesh(new THREE.CircleGeometry(g * 0.6, 72), m.element, [0, 0, top + 0.001], FACE));
  out.add(mesh(new THREE.CircleGeometry(g * (apple ? 0.24 : 0.34), 32), getLensGlint(look), [g * 0.16, g * 0.16, top + 0.0005], FACE));
  // Verre de protection : bombé si peu qu'on ne voit presque pas la courbure
  out.add(mesh(new THREE.SphereGeometry(coverR, 96, 6, 0, Math.PI * 2, 0, COVER), m.cover, [0, 0, glassTop + coverR * Math.cos(COVER)], [-Math.PI / 2, 0, 0]));
  return out;
}

// Bouton latéral réaliste : face plate, bouts arrondis, à peine en relief (~0,5 mm),
// cerné d'un interstice très fin. `side` : -1 côté gauche, +1 côté droit (vu de face).
// `length` : longueur totale du bouton, en cm.
function sideButton({ side, y, length, w, m, kind = "metal" }: { side: 1 | -1; y: number; length: number; w: number; m: M; kind?: "metal" | "control" | "sim" }) {
  // Les plaques sont extrudées selon z : on les tourne pour qu'elles sortent du flanc (axe x).
  const rot: V3 = [0, Math.PI / 2, 0];
  const at = (out: number): V3 => [side * (w / 2 + out), y, 0];
  if (kind === "sim") {
    // Tiroir SIM : affleurant, seulement dessiné par son interstice et le trou d'éjection.
    const sim = roundedSlab(0.3, length, 0.012, 0.15, 0.004);
    return group(
      undefined,
      mesh(sim, m.gap, at(-0.004), rot),
      mesh(sim, m.metal, at(-0.002), rot, [0.86, 0.96, 1]),
      mesh(new THREE.CircleGeometry(0.035, 16), m.gap, [side * (w / 2 + 0.001), y - length / 2 + 0.22, 0], [0, (side * Math.PI) / 2, 0]),
    );
  }
  const key = roundedSlab(0.28, length, 0.07, 0.14, 0.018);
  const g = group(undefined, mesh(roundedSlab(0.31, length + 0.03, 0.03, 0.155, 0.006), m.gap, at(-0.012), rot));
  if (kind === "metal") g.add(mesh(key, m.polished, at(0.012), rot));
  else {
    // Commande de l'appareil photo : verre saphir affleurant dans un cadre métal.
    g.add(mesh(key, m.polished, at(-0.025), rot));
    g.add(mesh(roundedSlab(0.22, length - 0.08, 0.02, 0.11, 0.008), m.control, at(0.002), rot));
  }
  return g;
}

// Forme plate gravée sur la tranche du bas (face orientée vers -y).
// `hole` : évide l'intérieur pour ne garder qu'un contour.
function edgeShape({ x, y, w, h, r, material, hole, lift = 0.001 }: { x: number; y: number; w: number; h: number; r: number; material: THREE.Material; hole?: number; lift?: number }) {
  const shape = roundedRect(w, h, Math.min(r, h / 2, w / 2));
  if (hole) {
    const inner = roundedRect(w - hole * 2, h - hole * 2, Math.max(Math.min(r, h / 2, w / 2) - hole, 0.005));
    shape.holes.push(new THREE.Path(inner.getPoints(24).reverse()));
  }
  // Rotation de +90° autour de x : la face regarde vers le bas, la hauteur de la forme suit l'épaisseur (z).
  return mesh(new THREE.ShapeGeometry(shape, 24), material, [x, y - lift, 0], [Math.PI / 2, 0, 0]);
}

// Positions des ouvertures de la tranche du bas (x, en cm depuis le centre).
// iPhone : USB-C au centre, haut-parleur à droite et micros à gauche, deux vis de part et d'autre du port.
// Galaxy Ultra : logement du S Pen à gauche, tiroir SIM, USB-C au centre, haut-parleur à droite.
const SPEAKER_STEP = 0.16;
const speakerHoles = (model: Model) =>
  model === "pro" ? [...Array(6)].flatMap((_, i) => [1.2 + i * SPEAKER_STEP, -(1.2 + i * SPEAKER_STEP)]) : [...Array(7)].map((_, i) => 1.15 + i * SPEAKER_STEP);
const SPEN_X = -2.6;

// Volumes retirés du cadre sur la tranche du bas (axe des trous selon y).
function bottomCutters(model: Model, h: number) {
  const y = -h / 2;
  const alongY = (g: THREE.BufferGeometry, x: number) => g.rotateX(Math.PI / 2).translate(x, y, 0);
  const cutters = [alongY(roundedPrism(0.86, 0.26, 0.13, 1.1, 12), 0), ...speakerHoles(model).map((hx) => alongY(zCylinder(0.045, 0.5, 16), hx))];
  if (model === "ultra") {
    cutters.push(alongY(roundedPrism(0.58, 0.3, 0.15, 1.8, 12), SPEN_X));
    cutters.push(alongY(zCylinder(0.035, 0.4, 12), -0.68));
  }
  return cutters;
}

// Ce qu'on voit dans et autour des ouvertures : languette du USB-C, vis, tiroir SIM, embout du S Pen.
function bottomEdge(h: number, m: M, model: Model) {
  const y = -h / 2;
  // Languette de contact au fond du port USB-C
  const g = group(undefined, mesh(new THREE.BoxGeometry(0.56, 0.42, 0.07), m.barrelDim, [0, y + 0.08 + 0.21, 0]));
  if (model === "pro")
    for (const sx of [-0.62, 0.62])
      // Vis à tête affleurante, cernée d'un liseré sombre.
      g.add(
        group(
          undefined,
          mesh(new THREE.CircleGeometry(0.062, 24), m.gap, [sx, y - 0.0008, 0], [Math.PI / 2, 0, 0]),
          mesh(new THREE.CircleGeometry(0.048, 24), m.polished, [sx, y - 0.0016, 0], [Math.PI / 2, 0, 0]),
        ),
      );
  if (model === "ultra") {
    // Tiroir SIM : contour très fin
    g.add(edgeShape({ x: -1.2, y, w: 1.3, h: 0.3, r: 0.15, material: m.gap, hole: 0.018 }));
    // Embout du S Pen, glissé dans son logement, presque affleurant
    g.add(mesh(roundedPrism(0.54, 0.26, 0.13, 0.9, 12).rotateX(Math.PI / 2), m.polished, [SPEN_X, y + 0.45 + 0.012, 0]));
  }
  return g;
}

// Ombre douce sous chaque objectif : disque noir dont l'opacité s'efface vers le bord.
let lensShadow: THREE.MeshBasicMaterial | null = null;
function getLensShadow() {
  if (lensShadow) return lensShadow;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.55, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  lensShadow = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  return lensShadow;
}

// Petit reflet au cœur de la lentille : bleu-violet sur l'iPhone, bleu-turquoise sur le Galaxy.
const lensGlints: Partial<Record<"apple" | "samsung", THREE.MeshBasicMaterial>> = {};
function getLensGlint(look: "apple" | "samsung") {
  const cached = lensGlints[look];
  if (cached) return cached;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const stops =
    look === "apple"
      ? ["rgba(190,200,255,0.95)", "rgba(110,110,220,0.55)", "rgba(90,60,160,0.18)", "rgba(60,40,120,0)"]
      : ["rgba(200,245,255,0.95)", "rgba(60,170,210,0.6)", "rgba(40,120,150,0.22)", "rgba(20,80,110,0)"];
  stops.forEach((col, i) => g.addColorStop([0, 0.25, 0.6, 1][i], col));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false });
  lensGlints[look] = mat;
  return mat;
}

// Diffuseur du flash : verre dépoli strié de fins cercles concentriques (lentille de Fresnel),
// avec la LED à peine teintée au centre. Dessiné une fois dans une texture.
let flashTexture: THREE.CanvasTexture | null = null;
function getFlashTexture() {
  if (flashTexture) return flashTexture;
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  const mid = size / 2;
  const base = x.createRadialGradient(mid, mid, 0, mid, mid, mid);
  // Blanc très blanc, à peine jaunâtre.
  base.addColorStop(0, "#fffdf4");
  base.addColorStop(0.75, "#fbf8ec");
  base.addColorStop(1, "#ece8da");
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);
  // Anneaux de Fresnel.
  for (let rr = 6; rr < mid; rr += 5) {
    x.beginPath();
    x.arc(mid, mid, rr, 0, Math.PI * 2);
    x.strokeStyle = rr % 10 < 5 ? "rgba(255,255,255,0.7)" : "rgba(120,112,90,0.08)";
    x.lineWidth = 1.6;
    x.stroke();
  }
  // LED vue à travers le diffuseur : petit disque gris clair au centre, comme sur les photos d'Apple.
  const led = x.createRadialGradient(mid, mid, 0, mid, mid, 34);
  led.addColorStop(0, "#d9d4c8");
  led.addColorStop(0.6, "#e7e2d6");
  led.addColorStop(1, "rgba(236,232,218,0)");
  x.fillStyle = led;
  x.beginPath();
  x.arc(mid, mid, 34, 0, Math.PI * 2);
  x.fill();
  flashTexture = new THREE.CanvasTexture(c);
  flashTexture.colorSpace = THREE.SRGBColorSpace;
  flashTexture.anisotropy = 8;
  return flashTexture;
}

// Flash : fine bague polie, diffuseur légèrement en retrait, et verre de protection par-dessus.
function flash({ x, y, z, r, m }: { x: number; y: number; z: number; r: number; m: M }) {
  const mat = new THREE.MeshPhysicalMaterial({
    map: getFlashTexture(),
    emissive: "#ffffff",
    emissiveMap: getFlashTexture(),
    emissiveIntensity: 0.35,
    roughness: 0.45,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 0.4,
  });
  // Tout est posé AU-DESSUS de la surface (vers -z) : sinon la coque masque le diffuseur.
  return group(
    [x, y, z],
    mesh(new THREE.TorusGeometry(r, r * 0.1, 12, 64), m.polished, [0, 0, -0.006]),
    mesh(new THREE.RingGeometry(r * 0.9, r, 64), m.gap, [0, 0, -0.003], FACE),
    mesh(new THREE.CircleGeometry(r * 0.9, 64), mat, [0, 0, -0.004], FACE),
  );
}

function dot({ x, y, z, r, material }: { x: number; y: number; z: number; r: number; material: THREE.Material }) {
  return mesh(new THREE.CircleGeometry(r, 48), material, [x, y, z], [0, Math.PI, 0]);
}

// Téléphone complet. `wallpaper` : image posée sur l'écran (photos produit), à la place de l'interface.
// `onChange` : appelé quand le cadre percé remplace le cadre plein (pour demander une nouvelle image).
// Renvoie le groupe à poser dans la scène et de quoi arrêter le calcul en cours.
export function createPhone({ model, finish, wallpaper, onChange }: { model: Model; finish: Finish; wallpaper?: THREE.Texture; onChange?: () => void }) {
  const m = makeMaterials(finish);
  const spec = SPECS[model];
  const { w, h, d, r } = spec;
  const back = -d / 2;
  const root = group();

  const front = new THREE.ShapeGeometry(roundedRect(w - 0.16, h - 0.16, r - 0.08), 48);
  const panelProH = h - 4.2 - 0.15 - 0.5 - 0.3;
  const logo = model === "pro" ? logoGeometry(APPLE_PATH, { height: 1.55 }) : logoGeometry(SAMSUNG_PATH, { width: 2.35 });

  // Cadre percé : port USB-C, haut-parleurs, logement du S Pen (calcul en arrière-plan).
  const body = mesh(solid(roundedSlab(w, h, d, r, EDGE_BEVEL[model])), [m.metal, m.hole]);
  const cancel = carveInto(body, `phone-${model}`, () => ({ base: roundedSlab(w, h, d, r, EDGE_BEVEL[model]), cutters: bottomCutters(model, h) }), onChange);
  root.add(body);
  root.add(antennaLines(w, h, d, EDGE_BEVEL[model], m, model));
  if (wallpaper)
    root.add(mesh(new THREE.PlaneGeometry(w - 2 * spec.inset, h - 2 * spec.inset), new THREE.MeshBasicMaterial({ map: wallpaper, transparent: true, toneMapped: false }), [0, 0, d / 2 + 0.012]));
  root.add(mesh(front, m.frontGlass, [0, 0, d / 2 + 0.006]));

  // Boutons placés d'après le schéma officiel d'Apple (positions mesurées depuis le haut) :
  // gauche : Action ~22 %, volume ~37 %, tiroir SIM ~66 % ; droite : bouton latéral ~37 %, commande photo ~66 %.
  if (model === "pro") {
    root.add(sideButton({ side: -1, y: yAt(h, 0.225), length: 0.72, w, m }));
    root.add(sideButton({ side: -1, y: yAt(h, 0.366) + 0.62, length: 1.02, w, m }));
    root.add(sideButton({ side: -1, y: yAt(h, 0.366) - 0.62, length: 1.02, w, m }));
    root.add(sideButton({ side: -1, y: yAt(h, 0.66), length: 1.55, w, m, kind: "sim" }));
    root.add(sideButton({ side: 1, y: yAt(h, 0.37), length: 1.95, w, m }));
    root.add(sideButton({ side: 1, y: yAt(h, 0.66), length: 1.3, w, m, kind: "control" }));
    root.add(bottomEdge(h, m, "pro"));
  } else {
    // Galaxy Ultra, d'après le schéma de Samsung : touche de volume longue (~24 %) puis touche latérale (~39 %),
    // toutes deux sur le flanc droit ; rien sur le flanc gauche.
    root.add(sideButton({ side: 1, y: yAt(h, 0.24), length: 2.3, w, m }));
    root.add(sideButton({ side: 1, y: yAt(h, 0.39), length: 1.15, w, m }));
    root.add(bottomEdge(h, m, "ultra"));
  }

  if (model === "pro") {
    // Plateau photo : vu de dos, le bloc d'objectifs est en haut à gauche, donc côté x positif.
    // Arrondi comme le téléphone en haut, plus serré en bas.
    const plateau = roundedSlab(w - 0.3, 4.2, 0.16, { tl: r - 0.15, tr: r - 0.15, br: 0.55, bl: 0.55 }, 0.07);
    root.add(mesh(plateau, m.metal, [0, h / 2 - 0.15 - 2.1, back - 0.07]));
    root.add(mesh(new THREE.ShapeGeometry(roundedRect(w - 0.62, panelProH, 0.85), 48), m.frosted, [0, -h / 2 + 0.3 + panelProH / 2, back - 0.006], [0, Math.PI, 0]));
    // Logo au centre de la fenêtre de verre
    root.add(mesh(logo, m.logo, [0, -h / 2 + 0.3 + panelProH / 2, back - 0.009], [0, Math.PI, 0]));
    const z = back - 0.15;
    // Mesures relevées sur les photos officielles de l'iPhone 17 Pro, reprises sur l'iPhone 18 Pro Max (même plateau) :
    // bague d'objectif ≈ 16 mm de diamètre, 19,5 mm entre les deux objectifs de gauche,
    // le troisième décalé de 18 mm vers la droite, à mi-hauteur.
    const lr = 0.8;
    const step = 1.95;
    const plateauMid = h / 2 - 0.15 - 2.1;
    const y1 = plateauMid + step / 2;
    const y2 = plateauMid - step / 2;
    const x1 = w / 2 - 0.15 - 0.22 - lr;
    const x3 = x1 - 1.82;
    // Colonne de droite : flash en haut, micro au milieu, LiDAR en bas, alignés sur les objectifs de gauche.
    const xr = -w / 2 + 0.15 + 0.9;
    const small = 0.33;
    root.add(lens({ x: x1, y: y1, z, r: lr, m }));
    root.add(lens({ x: x1, y: y2, z, r: lr, m }));
    root.add(lens({ x: x3, y: (y1 + y2) / 2, z, r: lr, m, large: true }));
    root.add(flash({ x: xr, y: y1 + 0.05, z: z - 0.002, r: small, m }));
    root.add(dot({ x: xr, y: (y1 + y2) / 2, z: z - 0.002, r: 0.045, material: m.hole }));
    // LiDAR : disque noir brillant cerné d'une fine bague de la couleur du téléphone
    root.add(mesh(new THREE.TorusGeometry(small, 0.022, 10, 64), m.bezel, [xr, y2 - 0.05, z - 0.004]));
    root.add(dot({ x: xr, y: y2 - 0.05, z: z - 0.003, r: small, material: m.sensor }));
  } else {
    // Dos en verre (ultra) : couvre tout le dos sauf un fin cadre.
    root.add(mesh(new THREE.ShapeGeometry(roundedRect(w - 0.3, h - 0.3, r - 0.12), 48), m.frosted, [0, 0, back - 0.006], [0, Math.PI, 0]));
    // Inscription de la marque, au quart inférieur du dos
    root.add(mesh(logo, m.print, [0, -h / 2 + 3.4, back - 0.009], [0, Math.PI, 0]));
    // Mesures relevées sur les photos officielles (dos vu de face, îlot en haut à gauche, donc côté x positif) :
    // trois grands objectifs (≈ 14,5 mm) sur l'îlot, deux petits (≈ 8,4 mm) à côté, flash entre les deux.
    const ix = w / 2 - 0.58 - ISLAND.w / 2;
    const iy = h / 2 - 0.58 - ISLAND.h / 2;
    const islandTop = back - 0.006 - 0.11;
    const big = 0.725;
    const step = 1.83;
    const yTop = iy + step;
    const sx = ix - 1.45;
    // Îlot photo du S26 Ultra : pilule verticale en relief qui porte les trois grands objectifs.
    root.add(mesh(roundedSlab(ISLAND.w, ISLAND.h, 0.11, ISLAND.w / 2, 0.045), m.metal, [ix, iy, back - 0.006 - 0.055]));
    for (const i of [0, 1, 2]) root.add(lens({ x: ix, y: yTop - i * step, z: islandTop, r: big, m, look: "samsung", height: 0.07 }));
    root.add(lens({ x: sx, y: yTop - 0.3, z: back - 0.006, r: 0.42, m, look: "samsung", height: 0.13 }));
    root.add(lens({ x: sx, y: yTop - 1.98, z: back - 0.006, r: 0.42, m, look: "samsung", height: 0.13 }));
    root.add(flash({ x: sx, y: yTop - 1.15, z: back - 0.009, r: 0.14, m }));
  }

  return { group: root, dispose: cancel };
}
