import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { roundedRect, roundedSlab } from "./geometry";
import { ScreenAnchor } from "./stage";

// Ordinateurs portables modélisés à leurs dimensions réelles (1 unité = 1 cm), sans aucun logo.
// « mac » : inspiré du MacBook Pro 16 pouces (aluminium, encoche, haut-parleurs de part et d'autre du clavier).
// « windows » : inspiré d'un portable de jeu 16 pouces type Omen 16 (noir, angles francs, pavé numérique).
export type LaptopKind = "mac" | "windows";

type Spec = {
  w: number; // largeur
  d: number; // profondeur
  h: number; // épaisseur de la base
  r: number; // rayon des coins vus de dessus
  lidH: number; // hauteur du capot
  lidT: number; // épaisseur du capot
  disp: { w: number; h: number; bottom: number }; // zone d'affichage et bordure du bas
  hingeInset: number; // recul de la charnière depuis l'arrière
  u: number; // pas des touches
  numpad: boolean;
  trackpad: { w: number; h: number; x: number };
  body: string;
  bodyMetal: number;
  bodyRough: number;
  keys: string;
  speakers: boolean;
};

export const LAPTOP_SPECS: Record<LaptopKind, Spec> = {
  mac: {
    w: 35.57,
    d: 24.81,
    h: 1.1,
    r: 0.9,
    lidH: 24.4,
    lidT: 0.58,
    disp: { w: 34.56, h: 22.34, bottom: 1.5 },
    hingeInset: 0.45,
    u: 1.9,
    numpad: false,
    trackpad: { w: 16.2, h: 10, x: 0 },
    body: "#d6d8dc",
    bodyMetal: 1,
    bodyRough: 0.33,
    keys: "#0d0e10",
    speakers: true,
  },
  windows: {
    w: 36.9,
    d: 25.9,
    h: 1.75,
    r: 0.55,
    lidH: 23.5,
    lidT: 0.55,
    disp: { w: 35.65, h: 20.05, bottom: 2.45 },
    hingeInset: 2.1,
    u: 1.75,
    numpad: true,
    trackpad: { w: 12.6, h: 8, x: -3.6 },
    // Noir mat, peu métallique : il ne reflète presque pas le studio.
    body: "#141518",
    bodyMetal: 0.1,
    bodyRough: 0.72,
    keys: "#0b0c0e",
    speakers: false,
  },
};

// Taille de l'interface affichée à l'écran, en pixels CSS (proportions de l'écran réel).
export const LAPTOP_SCREEN_PX: Record<LaptopKind, { w: number; h: number }> = {
  mac: { w: 1000, h: Math.round((1000 * 22.34) / 34.56) },
  windows: { w: 1000, h: Math.round((1000 * 20.05) / 35.65) },
};

// Disposition du clavier : largeur de chaque touche en multiples du pas, rangée par rangée.
const MAIN_ROWS: number[][] = [
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
  [1, 1, 1, 1.25, 5, 1.25, 1, 1, 1, 1],
];

type KeyRect = { x: number; z: number; w: number; d: number };

function keyboardLayout(spec: Spec) {
  const u = spec.u;
  const gap = 0.32;
  const mainW = 14.5 * u;
  const numW = spec.numpad ? 4 * u : 0;
  const sep = spec.numpad ? 0.7 : 0;
  const totalW = mainW + sep + numW;
  const left = -totalW / 2;
  const keys: KeyRect[] = [];

  // Rangée des touches de fonction : demi-hauteur.
  const fnH = u * 0.55;
  const fnCount = 14;
  const fnW = mainW / fnCount;
  let z = 0;
  for (let i = 0; i < fnCount; i++) keys.push({ x: left + fnW * (i + 0.5), z: z + fnH / 2, w: fnW - gap, d: fnH - gap * 0.8 });
  z += fnH;

  for (const row of MAIN_ROWS) {
    let x = left;
    for (const k of row) {
      keys.push({ x: x + (k * u) / 2, z: z + u / 2, w: k * u - gap, d: u - gap });
      x += k * u;
    }
    z += u;
  }

  if (spec.numpad) {
    const nx = left + mainW + sep;
    let nz = fnH;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) keys.push({ x: nx + u * (c + 0.5), z: nz + u / 2, w: u - gap, d: u - gap });
      nz += u;
    }
  }
  return { keys, totalW, totalD: z, mainCenter: left + mainW / 2 };
}

export function LaptopModel({ kind, screenEl, lidAngle = 112 }: { kind: LaptopKind; screenEl: HTMLDivElement; lidAngle?: number }) {
  const spec = LAPTOP_SPECS[kind];
  const { w, d, h, r, lidH, lidT, disp } = spec;

  const mats = useMemo(
    () => ({
      // Le Mac garde un léger vernis ; le portable noir est mat, sinon il reflète le studio et paraît gris.
      body: new THREE.MeshPhysicalMaterial({
        color: spec.body,
        metalness: spec.bodyMetal,
        roughness: spec.bodyRough,
        clearcoat: kind === "mac" ? 0.2 : 0,
        clearcoatRoughness: 0.5,
        envMapIntensity: kind === "mac" ? 1 : 0.35,
      }),
      well: new THREE.MeshStandardMaterial({ color: kind === "mac" ? "#0b0b0d" : "#08080a", roughness: 0.8, metalness: 0.2 }),
      key: new THREE.MeshStandardMaterial({ color: spec.keys, roughness: 0.55, metalness: 0.15 }),
      pad: new THREE.MeshPhysicalMaterial({
        color: kind === "mac" ? "#cfd2d6" : "#24262b",
        metalness: kind === "mac" ? 0.9 : 0.3,
        roughness: 0.22,
        clearcoat: 0.8,
      }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#030304", roughness: 0.05, clearcoat: 1, metalness: 0 }),
      dark: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.6 }),
      hinge: new THREE.MeshStandardMaterial({ color: kind === "mac" ? "#1b1c1f" : "#141518", roughness: 0.45, metalness: 0.6 }),
    }),
    [kind, spec],
  );

  const geo = useMemo(() => {
    const layout = keyboardLayout(spec);
    const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
    return {
      layout,
      base: roundedSlab(w, d, h, r, Math.min(0.28, h / 3)),
      lid: roundedSlab(w, lidH, lidT, r, 0.12),
      well: flat(new THREE.ShapeGeometry(roundedRect(layout.totalW + 0.6, layout.totalD + 0.6, 0.35), 16)),
      key: flat(roundedSlab(1, 1, 0.12, 0.16, 0.035)),
      pad: flat(new THREE.ShapeGeometry(roundedRect(spec.trackpad.w, spec.trackpad.h, 0.45), 24)),
      bezel: new THREE.ShapeGeometry(roundedRect(w - 0.22, lidH - 0.22, r - 0.11), 24),
      dot: flat(new THREE.CircleGeometry(0.045, 8)),
    };
  }, [spec, w, d, h, r, lidH, lidT]);

  // Clavier en un seul maillage instancié : chaque touche est une copie mise à l'échelle.
  const keysRef = useRef<THREE.InstancedMesh>(null);
  const kbFrontZ = -d / 2 + spec.hingeInset + 2.2; // début du clavier, derrière la rangée de fonctions
  useLayoutEffect(() => {
    const mesh = keysRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    geo.layout.keys.forEach((k, i) => {
      m.compose(new THREE.Vector3(k.x, h + 0.06, kbFrontZ + k.z), q, new THREE.Vector3(k.w, 1, k.d));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [geo, h, kbFrontZ]);

  // Grilles de haut-parleurs (Mac) : petits trous en quinconce de chaque côté du clavier.
  const dotsRef = useRef<THREE.InstancedMesh>(null);
  const dots = useMemo(() => {
    if (!spec.speakers) return [] as [number, number][];
    const list: [number, number][] = [];
    const halfKb = geo.layout.totalW / 2;
    const gridW = w / 2 - halfKb - 1.4;
    for (const side of [-1, 1]) {
      const cx = side * (halfKb + 0.7 + gridW / 2);
      for (let row = 0; row < 46; row++) {
        for (let col = 0; col < 13; col++) {
          const x = cx - gridW / 2 + (col + (row % 2) * 0.5) * (gridW / 13);
          const z = kbFrontZ + row * (geo.layout.totalD / 46);
          list.push([x, z]);
        }
      }
    }
    return list;
  }, [spec.speakers, geo, w, kbFrontZ]);
  useLayoutEffect(() => {
    const mesh = dotsRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    dots.forEach(([x, z], i) => {
      m.makeTranslation(x, h + 0.002, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [dots, h]);

  const hingeZ = -d / 2 + spec.hingeInset;
  const padZ = d / 2 - 0.9 - spec.trackpad.h / 2;
  const tilt = (lidAngle - 90) * (Math.PI / 180);
  const pxScale = disp.w / LAPTOP_SCREEN_PX[kind].w;
  const dispCenterY = disp.bottom + disp.h / 2;

  return (
    <group>
      {/* Base : coque, puits du clavier, touches, pavé tactile */}
      <mesh geometry={geo.base} rotation={[-Math.PI / 2, 0, 0]} position={[0, h / 2, 0]} material={mats.body} />
      <mesh geometry={geo.well} position={[spec.numpad ? 0 : 0, h + 0.003, kbFrontZ + geo.layout.totalD / 2]} material={mats.well} />
      <instancedMesh ref={keysRef} args={[geo.key, mats.key, geo.layout.keys.length]} />
      <mesh geometry={geo.pad} position={[spec.trackpad.x, h + 0.003, padZ]} material={mats.pad} />
      {spec.speakers && <instancedMesh ref={dotsRef} args={[geo.dot, mats.dark, dots.length]} />}

      {/* Aérations arrière (portable de jeu), derrière la charnière */}
      {kind === "windows" &&
        Array.from({ length: 16 }, (_, i) => (
          <mesh key={i} position={[-w / 2 + 4 + i * ((w - 8) / 15), h + 0.004, -d / 2 + 1.0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.dark}>
            <planeGeometry args={[1.25, 1.1]} />
          </mesh>
        ))}

      {/* Charnière */}
      <mesh position={[0, h + 0.2, hingeZ]} rotation={[0, 0, Math.PI / 2]} material={mats.hinge}>
        <cylinderGeometry args={[0.32, 0.32, kind === "mac" ? w - 7 : w - 3, 24]} />
      </mesh>

      {/* Capot ouvert, pivotant autour de la charnière */}
      <group position={[0, h + 0.2, hingeZ]} rotation={[-tilt, 0, 0]}>
        <mesh geometry={geo.lid} position={[0, lidH / 2, -lidT / 2]} material={mats.body} />
        <mesh geometry={geo.bezel} position={[0, lidH / 2, 0.003]} material={mats.glass} />
        <ScreenAnchor el={screenEl} scale={pxScale} position={[0, dispCenterY, 0.012]} />
      </group>
    </group>
  );
}
