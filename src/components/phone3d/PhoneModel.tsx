import { useMemo } from "react";
import * as THREE from "three";
import type { Finish, Model } from "../phone/RealPhone";
import { roundedRect, roundedSlab, SPECS } from "./geometry";
import { logoGeometry, roundedPrism, solid, useCarved, zCylinder } from "./carve";
import { APPLE_PATH, SAMSUNG_PATH } from "./brandLogos";

// Teintes des coloris (aluminium anodisé et verre arrière dépoli).
const FINISH_COLORS: Record<Finish, { metal: string; glass: string }> = {
  silver: { metal: "#d9dce0", glass: "#e6e8eb" },
  orange: { metal: "#d9581a", glass: "#a4461a" },
  blue: { metal: "#33446e", glass: "#3a4a74" },
  rose: { metal: "#b9808f", glass: "#c99aa6" },
  // Violet cobalt du Galaxy S26 Ultra : cadre plus clair et satiné, dos en verre mat plus profond.
  violet: { metal: "#65618f", glass: "#393660" },
};

// Arrondi des arêtes du cadre : bords bombés sur l'iPhone, flancs plats sur le Galaxy.
const EDGE_BEVEL: Record<Model, number> = { pro: 0.22, ultra: 0.12 };

function useMaterials(finish: Finish) {
  return useMemo(() => {
    const c = FINISH_COLORS[finish];
    return {
      // Aluminium satiné : métallique, légèrement rugueux.
      // Le violet du Galaxy est un aluminium anodisé clair : moins métallique, sinon il reflète le studio et vire au bleu nuit.
      metal: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: finish === "violet" ? 0.45 : finish === "orange" ? 0.72 : 1, roughness: finish === "violet" ? 0.4 : finish === "orange" ? 0.36 : 0.34, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
      // Bagues d'objectifs et boutons : même teinte, plus polie.
      polished: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 1, roughness: 0.16 }),
      // Bague des objectifs, comme sur les photos d'Apple : aluminium de la couleur du téléphone, satiné,
      // qui garde sa teinte au lieu de refléter le studio en blanc.
      bezel: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 0.85, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
      // Fine bague cuivrée et brillante des objectifs du Galaxy S26 Ultra.
      copper: new THREE.MeshPhysicalMaterial({ color: "#c79a8a", metalness: 1, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 }),
      // Verre arrière dépoli.
      frosted: new THREE.MeshPhysicalMaterial({ color: c.glass, metalness: 0.15, roughness: 0.55, clearcoat: finish === "orange" ? 0.25 : 0.6, clearcoatRoughness: 0.5 }),
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
  }, [finish]);
}

type M = ReturnType<typeof useMaterials>;

const FACE: [number, number, number] = [0, Math.PI, 0];

// Îlot photo du S26 Ultra (cm).
const ISLAND = { w: 1.75, h: 5.5 };

// Lignes d'antenne : courtes bandes isolantes qui coupent le cadre métallique, près des quatre coins,
// sur les flancs et sur les tranches du haut et du bas.
// Sur le Galaxy, celles des tranches sont rapprochées des coins : sinon la ligne du bas traverse
// le logement du S Pen et semble flotter au-dessus du trou.
function AntennaLines({ w, h, d, bevel, m, model }: { w: number; h: number; d: number; bevel: number; m: M; model: Model }) {
  const endInset = model === "ultra" ? 0.55 : 1.15;
  const flat = d - 2 * bevel - 0.04;
  const band = 0.05;
  return (
    <group>
      {[-1, 1].flatMap((side) =>
        [h / 2 - 1.9, -h / 2 + 1.9].map((y) => (
          <mesh key={`s${side}${y}`} position={[side * (w / 2 + 0.0015), y, 0]} rotation={[0, (side * Math.PI) / 2, 0]} material={m.antenna}>
            <planeGeometry args={[flat, band]} />
          </mesh>
        )),
      )}
      {[-1, 1].flatMap((end) =>
        [-1, 1].map((sx) => (
          <mesh key={`e${end}${sx}`} position={[sx * (w / 2 - endInset), end * (h / 2 + 0.0015), 0]} rotation={[(-end * Math.PI) / 2, 0, Math.PI / 2]} material={m.antenna}>
            <planeGeometry args={[flat, band]} />
          </mesh>
        )),
      )}
    </group>
  );
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
function Lens({
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
  const rot: [number, number, number] = [Math.PI / 2, 0, 0];
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
  return (
    <group position={[x, y, z]}>
      {/* Ombre douce portée par l'objectif sur le plateau (vers le bas à droite sur les photos) */}
      {apple && (
        <mesh position={[-r * 0.05, -r * 0.08, -0.002]} rotation={FACE} material={getLensShadow()}>
          <circleGeometry args={[r * 1.22, 64]} />
        </mesh>
      )}
      {/* Bague métallique : flanc, dessus plat et fin chanfrein qui accroche la lumière */}
      <mesh rotation={rot} position={[0, 0, top / 2]} material={apple ? m.bezel : m.copper}>
        <cylinderGeometry args={[r, r, height, 72, 1, true]} />
      </mesh>
      <mesh position={[0, 0, top]} rotation={FACE} material={apple ? m.bezel : m.copper}>
        <ringGeometry args={[inner, r - 0.012, 96]} />
      </mesh>
      <mesh position={[0, 0, top + 0.006]} material={m.polished}>
        <torusGeometry args={[r - 0.012, 0.012, 8, 96]} />
      </mesh>
      {/* Bord du verre : on sent le cercle qui dépasse de la bague */}
      <mesh rotation={rot} position={[0, 0, top - glassRise / 2]} material={m.coverEdge}>
        <cylinderGeometry args={[inner, inner, glassRise, 96, 1, true]} />
      </mesh>
      {/* Anneau miroir sous le verre */}
      <mesh position={[0, 0, top + 0.003]} rotation={FACE} material={m.mirror}>
        <ringGeometry args={[g, inner, 96]} />
      </mesh>
      {apple &&
        [0.62, 0.8].map((k2) => (
          <mesh key={k2} position={[0, 0, top + 0.0025]} rotation={FACE} material={m.mirrorRing}>
            <ringGeometry args={[r * k2 - 0.008, r * k2, 96]} />
          </mesh>
        ))}
      {/* Dans le verre noir : un anneau gris très sombre, puis la lentille, sombre, avec un petit reflet
          (bleu-violet sur l'iPhone, bleu-turquoise sur le Galaxy), comme sur les photos. */}
      <mesh position={[0, 0, top + 0.002]} rotation={FACE} material={m.mirrorRing}>
        <ringGeometry args={[g * 0.8, g, 72]} />
      </mesh>
      <mesh position={[0, 0, top + 0.0015]} rotation={FACE} material={m.pupil}>
        <circleGeometry args={[g * 0.8, 72]} />
      </mesh>
      <mesh position={[0, 0, top + 0.001]} rotation={FACE} material={m.element}>
        <circleGeometry args={[g * 0.6, 72]} />
      </mesh>
      <mesh position={[g * 0.16, g * 0.16, top + 0.0005]} rotation={FACE} material={getLensGlint(look)}>
        <circleGeometry args={[g * (apple ? 0.24 : 0.34), 32]} />
      </mesh>
      {/* Verre de protection : bombé si peu qu'on ne voit presque pas la courbure */}
      <mesh position={[0, 0, glassTop + coverR * Math.cos(COVER)]} rotation={[-Math.PI / 2, 0, 0]} material={m.cover}>
        <sphereGeometry args={[coverR, 96, 6, 0, Math.PI * 2, 0, COVER]} />
      </mesh>
    </group>
  );
}

// Bouton latéral réaliste : face plate, bouts arrondis, à peine en relief (~0,5 mm),
// cerné d'un interstice très fin. `side` : -1 côté gauche, +1 côté droit (vu de face).
// `length` : longueur totale du bouton, en cm.
function SideButton({
  side,
  y,
  length,
  w,
  m,
  kind = "metal",
}: {
  side: 1 | -1;
  y: number;
  length: number;
  w: number;
  m: M;
  kind?: "metal" | "control" | "sim";
}) {
  const geo = useMemo(
    () => ({
      gap: roundedSlab(0.31, length + 0.03, 0.03, 0.155, 0.006),
      key: roundedSlab(0.28, length, 0.07, 0.14, 0.018),
      glass: roundedSlab(0.22, length - 0.08, 0.02, 0.11, 0.008),
      sim: roundedSlab(0.3, length, 0.012, 0.15, 0.004),
    }),
    [length],
  );
  // Les plaques sont extrudées selon z : on les tourne pour qu'elles sortent du flanc (axe x).
  const rot: [number, number, number] = [0, Math.PI / 2, 0];
  const at = (out: number): [number, number, number] => [side * (w / 2 + out), y, 0];
  if (kind === "sim") {
    // Tiroir SIM : affleurant, seulement dessiné par son interstice et le trou d'éjection.
    return (
      <group>
        <mesh geometry={geo.sim} position={at(-0.004)} rotation={rot} material={m.gap} />
        <mesh geometry={geo.sim} position={at(-0.002)} rotation={rot} scale={[0.86, 0.96, 1]} material={m.metal} />
        <mesh position={[side * (w / 2 + 0.001), y - length / 2 + 0.22, 0]} rotation={[0, (side * Math.PI) / 2, 0]} material={m.gap}>
          <circleGeometry args={[0.035, 16]} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh geometry={geo.gap} position={at(-0.012)} rotation={rot} material={m.gap} />
      {kind === "metal" ? (
        <mesh geometry={geo.key} position={at(0.012)} rotation={rot} material={m.polished} />
      ) : (
        <>
          {/* Commande de l'appareil photo : verre saphir affleurant dans un cadre métal. */}
          <mesh geometry={geo.key} position={at(-0.025)} rotation={rot} material={m.polished} />
          <mesh geometry={geo.glass} position={at(0.002)} rotation={rot} material={m.control} />
        </>
      )}
    </group>
  );
}

// Forme plate gravée sur la tranche du bas (face orientée vers -y).
// `hole` : évide l'intérieur pour ne garder qu'un contour.
function EdgeShape({
  x,
  y,
  w,
  h,
  r,
  material,
  hole,
  lift = 0.001,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  material: THREE.Material;
  hole?: number;
  lift?: number;
}) {
  const geo = useMemo(() => {
    const shape = roundedRect(w, h, Math.min(r, h / 2, w / 2));
    if (hole) {
      const inner = roundedRect(w - hole * 2, h - hole * 2, Math.max(Math.min(r, h / 2, w / 2) - hole, 0.005));
      shape.holes.push(new THREE.Path(inner.getPoints(24).reverse()));
    }
    return new THREE.ShapeGeometry(shape, 24);
  }, [w, h, r, hole]);
  // Rotation de +90° autour de x : la face regarde vers le bas, la hauteur de la forme suit l'épaisseur (z).
  return <mesh geometry={geo} position={[x, y - lift, 0]} rotation={[Math.PI / 2, 0, 0]} material={material} />;
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
function BottomEdge({ h, m, model }: { h: number; m: M; model: Model }) {
  const y = -h / 2;
  const geo = useMemo(
    () => ({
      tongue: new THREE.BoxGeometry(0.56, 0.42, 0.07),
      pen: roundedPrism(0.54, 0.26, 0.13, 0.9, 12).rotateX(Math.PI / 2),
    }),
    [],
  );
  return (
    <group>
      {/* Languette de contact au fond du port USB-C */}
      <mesh geometry={geo.tongue} position={[0, y + 0.08 + 0.21, 0]} material={m.barrelDim} />
      {model === "pro" &&
        [-0.62, 0.62].map((sx) => (
          // Vis à tête affleurante, cernée d'un liseré sombre.
          <group key={sx}>
            <mesh position={[sx, y - 0.0008, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.gap}>
              <circleGeometry args={[0.062, 24]} />
            </mesh>
            <mesh position={[sx, y - 0.0016, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.polished}>
              <circleGeometry args={[0.048, 24]} />
            </mesh>
          </group>
        ))}
      {model === "ultra" && (
        <>
          {/* Tiroir SIM : contour très fin */}
          <EdgeShape x={-1.2} y={y} w={1.3} h={0.3} r={0.15} material={m.gap} hole={0.018} />
          {/* Embout du S Pen, glissé dans son logement, presque affleurant */}
          <mesh geometry={geo.pen} position={[SPEN_X, y + 0.45 + 0.012, 0]} material={m.polished} />
        </>
      )}
    </group>
  );
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
function Flash({ x, y, z, r, m }: { x: number; y: number; z: number; r: number; m: M }) {
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: getFlashTexture(),
        emissive: "#ffffff",
        emissiveMap: getFlashTexture(),
        emissiveIntensity: 0.35,
        roughness: 0.45,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMapIntensity: 0.4,
      }),
    [],
  );
  return (
    // Tout est posé AU-DESSUS de la surface (vers -z) : sinon la coque masque le diffuseur.
    <group position={[x, y, z]}>
      <mesh position={[0, 0, -0.006]} material={m.polished}>
        <torusGeometry args={[r, r * 0.1, 12, 64]} />
      </mesh>
      <mesh rotation={FACE} position={[0, 0, -0.003]} material={m.gap}>
        <ringGeometry args={[r * 0.9, r, 64]} />
      </mesh>
      <mesh rotation={FACE} position={[0, 0, -0.004]} material={mat}>
        <circleGeometry args={[r * 0.9, 64]} />
      </mesh>
    </group>
  );
}

function Dot({ x, y, z, r, material }: { x: number; y: number; z: number; r: number; material: THREE.Material }) {
  return (
    <mesh position={[x, y, z]} rotation={[0, Math.PI, 0]} material={material}>
      <circleGeometry args={[r, 48]} />
    </mesh>
  );
}

// `wallpaper` : image posée sur l'écran (photos produit), à la place de l'interface.
export function PhoneModel({ model, finish, wallpaper }: { model: Model; finish: Finish; wallpaper?: THREE.Texture }) {
  const m = useMaterials(finish);
  const spec = SPECS[model];
  const { w, h, d, r } = spec;
  const back = -d / 2;

  const geos = useMemo(() => {
    const body = solid(roundedSlab(w, h, d, r, EDGE_BEVEL[model]));
    const front = new THREE.ShapeGeometry(roundedRect(w - 0.16, h - 0.16, r - 0.08), 48);
    const panelProH = h - 4.2 - 0.15 - 0.5 - 0.3;
    return {
      body,
      front,
      // Plateau photo (pro) : arrondi comme le téléphone en haut, plus serré en bas.
      plateau: roundedSlab(w - 0.3, 4.2, 0.16, { tl: r - 0.15, tr: r - 0.15, br: 0.55, bl: 0.55 }, 0.07),
      panelPro: new THREE.ShapeGeometry(roundedRect(w - 0.62, panelProH, 0.85), 48),
      panelProH,
      // Dos en verre (ultra) : couvre tout le dos sauf un fin cadre.
      panelUltra: new THREE.ShapeGeometry(roundedRect(w - 0.3, h - 0.3, r - 0.12), 48),
      logo: model === "pro" ? logoGeometry(APPLE_PATH, { height: 1.55 }) : logoGeometry(SAMSUNG_PATH, { width: 2.35 }),
      // Îlot photo du S26 Ultra : pilule verticale en relief qui porte les trois grands objectifs.
      island: roundedSlab(ISLAND.w, ISLAND.h, 0.11, ISLAND.w / 2, 0.045),
    };
  }, [w, h, d, r, model]);
  // Cadre percé : port USB-C, haut-parleurs, logement du S Pen (calcul en arrière-plan).
  const body = useCarved(`phone-${model}`, geos.body, () => ({ base: roundedSlab(w, h, d, r, EDGE_BEVEL[model]), cutters: bottomCutters(model, h) }));

  return (
    <group>
      <mesh geometry={body} material={[m.metal, m.hole]} />
      <AntennaLines w={w} h={h} d={d} bevel={EDGE_BEVEL[model]} m={m} model={model} />
      {wallpaper && (
        <mesh position={[0, 0, d / 2 + 0.012]}>
          <planeGeometry args={[w - 2 * spec.inset, h - 2 * spec.inset]} />
          <meshBasicMaterial map={wallpaper} transparent toneMapped={false} />
        </mesh>
      )}
      <mesh geometry={geos.front} position={[0, 0, d / 2 + 0.006]} material={m.frontGlass} />

      {/* Boutons placés d'après le schéma officiel d'Apple (positions mesurées depuis le haut) :
          gauche : Action ~22 %, volume ~37 %, tiroir SIM ~66 % ; droite : bouton latéral ~37 %, commande photo ~66 %. */}
      {model === "pro" ? (
        <>
          <SideButton side={-1} y={yAt(h, 0.225)} length={0.72} w={w} m={m} />
          <SideButton side={-1} y={yAt(h, 0.366) + 0.62} length={1.02} w={w} m={m} />
          <SideButton side={-1} y={yAt(h, 0.366) - 0.62} length={1.02} w={w} m={m} />
          <SideButton side={-1} y={yAt(h, 0.66)} length={1.55} w={w} m={m} kind="sim" />
          <SideButton side={1} y={yAt(h, 0.37)} length={1.95} w={w} m={m} />
          <SideButton side={1} y={yAt(h, 0.66)} length={1.3} w={w} m={m} kind="control" />
          <BottomEdge h={h} m={m} model="pro" />
        </>
      ) : (
        <>
          {/* Galaxy Ultra, d'après le schéma de Samsung : touche de volume longue (~24 %) puis touche latérale (~39 %),
              toutes deux sur le flanc droit ; rien sur le flanc gauche. */}
          <SideButton side={1} y={yAt(h, 0.24)} length={2.3} w={w} m={m} />
          <SideButton side={1} y={yAt(h, 0.39)} length={1.15} w={w} m={m} />
          <BottomEdge h={h} m={m} model="ultra" />
        </>
      )}

      {model === "pro" ? (
        <>
          {/* Plateau photo : vu de dos, le bloc d'objectifs est en haut à gauche, donc côté x positif. */}
          <mesh geometry={geos.plateau} position={[0, h / 2 - 0.15 - 2.1, back - 0.07]} material={m.metal} />
          <mesh geometry={geos.panelPro} position={[0, -h / 2 + 0.3 + geos.panelProH / 2, back - 0.006]} rotation={[0, Math.PI, 0]} material={m.frosted} />
          {/* Logo au centre de la fenêtre de verre */}
          <mesh geometry={geos.logo} position={[0, -h / 2 + 0.3 + geos.panelProH / 2, back - 0.009]} rotation={[0, Math.PI, 0]} material={m.logo} />
          {(() => {
            const z = back - 0.15;
            // Mesures relevées sur la photo officielle de l'iPhone 17 Pro (dos vu de face) :
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
            return (
              <>
                <Lens x={x1} y={y1} z={z} r={lr} m={m} />
                <Lens x={x1} y={y2} z={z} r={lr} m={m} />
                <Lens x={x3} y={(y1 + y2) / 2} z={z} r={lr} m={m} large />
                <Flash x={xr} y={y1 + 0.05} z={z - 0.002} r={small} m={m} />
                <Dot x={xr} y={(y1 + y2) / 2} z={z - 0.002} r={0.045} material={m.hole} />
                {/* LiDAR : disque noir brillant cerné d'une fine bague de la couleur du téléphone */}
                <mesh position={[xr, y2 - 0.05, z - 0.004]} material={m.bezel}>
                  <torusGeometry args={[small, 0.022, 10, 64]} />
                </mesh>
                <Dot x={xr} y={y2 - 0.05} z={z - 0.003} r={small} material={m.sensor} />
              </>
            );
          })()}
        </>
      ) : (
        <>
          <mesh geometry={geos.panelUltra} position={[0, 0, back - 0.006]} rotation={[0, Math.PI, 0]} material={m.frosted} />
          {/* Inscription de la marque, au quart inférieur du dos */}
          <mesh geometry={geos.logo} position={[0, -h / 2 + 3.4, back - 0.009]} rotation={[0, Math.PI, 0]} material={m.print} />
          {(() => {
            // Mesures relevées sur les photos officielles (dos vu de face, îlot en haut à gauche, donc côté x positif) :
            // trois grands objectifs (≈ 14,5 mm) sur l'îlot, deux petits (≈ 8,4 mm) à côté, flash entre les deux.
            const ix = w / 2 - 0.58 - ISLAND.w / 2;
            const iy = h / 2 - 0.58 - ISLAND.h / 2;
            const islandTop = back - 0.006 - 0.11;
            const big = 0.725;
            const step = 1.83;
            const yTop = iy + step;
            const sx = ix - 1.45;
            return (
              <>
                <mesh geometry={geos.island} position={[ix, iy, back - 0.006 - 0.055]} material={m.metal} />
                {[0, 1, 2].map((i) => (
                  <Lens key={i} x={ix} y={yTop - i * step} z={islandTop} r={big} m={m} look="samsung" height={0.07} />
                ))}
                <Lens x={sx} y={yTop - 0.3} z={back - 0.006} r={0.42} m={m} look="samsung" height={0.13} />
                <Lens x={sx} y={yTop - 1.98} z={back - 0.006} r={0.42} m={m} look="samsung" height={0.13} />
                <Flash x={sx} y={yTop - 1.15} z={back - 0.009} r={0.14} m={m} />
              </>
            );
          })()}
        </>
      )}
    </group>
  );
}
