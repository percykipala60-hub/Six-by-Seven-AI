import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { roundedRect, roundedSlab } from "./geometry";
import { ScreenAnchor } from "./stage";

// Ordinateurs portables modélisés à leurs dimensions réelles (1 unité = 1 cm), sans aucun logo.
// « mac » : inspiré du MacBook Pro 16 pouces (aluminium, encoche, haut-parleurs de part et d'autre du clavier).
// « windows » : inspiré du Surface Laptop 15 pouces de 2024 (aluminium noir, écran 3:2 aux coins arrondis,
// aucune grille visible, grand pavé tactile centré).
export type LaptopKind = "mac" | "windows";

type Spec = {
  w: number; // largeur
  d: number; // profondeur
  h: number; // épaisseur de la base
  r: number; // rayon des coins vus de dessus
  lidH: number; // hauteur du capot
  lidT: number; // épaisseur du capot
  disp: { w: number; h: number; bottom: number }; // zone d'affichage et bordure du bas
  /** Coins de l'image à l'écran (CSS). */
  screenRadius: string;
  hingeInset: number; // recul de la charnière depuis l'arrière
  u: number; // pas des touches
  trackpad: { w: number; h: number; x: number; front: number };
  body: string;
  bodyMetal: number;
  bodyRough: number;
  keys: string;
  speakers: boolean;
  /** Hauteur des touches au-dessus du plateau et épaisseur de la touche (cm). */
  keyRise: number;
  keyT: number;
  /** Hauteur de la rangée de fonctions, en fraction du pas. */
  fnRow: number;
  /** Distance entre la charnière et le haut du clavier (cm). */
  kbInset: number;
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
    screenRadius: "10px 10px 0 0",
    hingeInset: 0.45,
    u: 1.9,
    trackpad: { w: 16.2, h: 9.4, x: 0, front: 0.9 },
    body: "#d6d8dc",
    bodyMetal: 1,
    bodyRough: 0.33,
    // Touches extra-plates du MacBook : elles affleurent presque le plateau.
    keys: "#1a1b1e",
    speakers: true,
    keyRise: 0.025,
    keyT: 0.06,
    fnRow: 1,
    kbInset: 1.7,
  },
  windows: {
    // 32,9 × 23,9 × 1,83 cm fermé ; écran 15 pouces 3:2.
    w: 32.9,
    d: 23.9,
    h: 1.3,
    r: 0.75,
    lidH: 23.0,
    lidT: 0.52,
    disp: { w: 31.7, h: 21.13, bottom: 1.02 },
    screenRadius: "16px",
    hingeInset: 0.45,
    u: 1.88,
    trackpad: { w: 14.3, h: 9.4, x: 0, front: 1.2 },
    // Aluminium anodisé noir, satiné.
    body: "#26272b",
    bodyMetal: 0.15,
    bodyRough: 0.62,
    keys: "#121316",
    speakers: false,
    keyRise: 0.04,
    keyT: 0.08,
    fnRow: 0.62,
    kbInset: 1.5,
  },
};

// Taille de l'interface affichée à l'écran, en pixels CSS (proportions de l'écran réel).
export const LAPTOP_SCREEN_PX: Record<LaptopKind, { w: number; h: number }> = {
  mac: { w: 1000, h: Math.round((1000 * 22.34) / 34.56) },
  windows: { w: 1000, h: Math.round((1000 * 21.13) / 31.7) },
};

// Disposition du clavier ISO français (AZERTY) : largeur de chaque touche en multiples du pas.
// Chaque rangée mesure exactement 14,5 pas, comme sur un vrai clavier.
const ROW_WIDTHS: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5], // chiffres, effacement
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // tabulation, A…$, haut de la touche Entrée
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75], // verrouillage, Q…, bas de la touche Entrée (en L)
  [1.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25], // majuscule, <, W…, majuscule
  [1, 1, 1, 1.25, 5, 1.25, 1, 1, 1, 1], // rangée du bas : modificateurs, espace, flèches
];

// Rangée de fonctions, également sur 14,5 pas.
const FN_WIDTHS: Record<LaptopKind, number[]> = {
  // esc large, F1 à F12, Touch ID.
  mac: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  // échap, F1 à F12, suppression, marche/arrêt.
  windows: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75, 0.75],
};

type KeyRect = { x: number; z: number; w: number; d: number; label: string; small?: boolean };

// Inscriptions des touches, en AZERTY français, rangée par rangée (même ordre que les largeurs).
const LABELS: Record<LaptopKind, { fn: string[]; rows: string[][] }> = {
  mac: {
    // Dernière touche de fonction : Touch ID, sans inscription.
    fn: ["esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", ""],
    rows: [
      ["@", "&", "é", '"', "'", "(", "§", "è", "!", "ç", "à", ")", "-", "⌫"],
      ["⇥", "A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P", "^", "$", "↩"],
      ["⇪", "Q", "S", "D", "F", "G", "H", "J", "K", "L", "M", "ù", "`", ""],
      ["⇧", "<", "W", "X", "C", "V", "B", "N", ",", ";", ":", "=", "⇧"],
      ["fn", "⌃", "⌥", "⌘", "", "⌘", "⌥", "◀", "▲▼", "▶"],
    ],
  },
  windows: {
    fn: ["esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "suppr", "⏻"],
    rows: [
      ["²", "1\n&", "2\né", '3\n"', "4\n'", "5\n(", "6\n-", "7\nè", "8\n_", "9\nç", "0\nà", "°\n)", "+\n=", "⌫"],
      ["⇥", "A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P", "¨\n^", "£\n$", "↵"],
      ["Caps", "Q", "S", "D", "F", "G", "H", "J", "K", "L", "M", "%\nù", "µ\n*", ""],
      ["⇧", ">\n<", "W", "X", "C", "V", "B", "N", "?\n,", ".\n;", "/\n:", "§\n!", "⇧"],
      // Ctrl, Fn, touche Windows (sans logo), Alt, espace, Alt Gr, touche Copilot (sans logo), flèches.
      ["Ctrl", "Fn", "", "Alt", "", "Alt Gr", "▤", "◀", "▲▼", "▶"],
    ],
  },
};

function keyboardLayout(spec: Spec, kind: LaptopKind) {
  const labels = LABELS[kind];
  const u = spec.u;
  const gap = 0.32;
  const totalW = 14.5 * u;
  const left = -totalW / 2;
  const keys: KeyRect[] = [];

  // Rangée des touches de fonction, moins haute que les autres.
  const fnH = u * spec.fnRow;
  let z = 0;
  let fx = left;
  FN_WIDTHS[kind].forEach((k, i) => {
    keys.push({ x: fx + (k * u) / 2, z: z + fnH / 2, w: k * u - gap, d: fnH - gap * 0.8, label: labels.fn[i] ?? "", small: true });
    fx += k * u;
  });
  z += fnH;

  ROW_WIDTHS.forEach((row, r) => {
    let x = left;
    row.forEach((k, c) => {
      const label = labels.rows[r]?.[c] ?? "";
      const cx = x + (k * u) / 2;
      const half = (u - gap) / 2 - 0.04;
      if (label === "▲▼") {
        keys.push({ x: cx, z: z + u / 4, w: k * u - gap, d: half, label: "▲", small: true });
        keys.push({ x: cx, z: z + (3 * u) / 4, w: k * u - gap, d: half, label: "▼", small: true });
      } else if (label === "◀" || label === "▶") {
        keys.push({ x: cx, z: z + (3 * u) / 4, w: k * u - gap, d: half, label, small: true });
      } else if (r === 2 && c === row.length - 1) {
        // Bas de la touche Entrée : prolongé vers le haut jusqu'à la partie supérieure, pour former le L.
        keys.push({ x: cx, z: z + u / 2 - gap / 2, w: k * u - gap, d: u, label });
      } else {
        keys.push({ x: cx, z: z + u / 2, w: k * u - gap, d: u - gap, label });
      }
      x += k * u;
    });
    z += u;
  });

  return { keys, totalW, totalD: z };
}

export function LaptopModel({ kind, screenEl, lidAngle = 112 }: { kind: LaptopKind; screenEl: HTMLDivElement; lidAngle?: number }) {
  const spec = LAPTOP_SPECS[kind];
  const { w, d, h, r, lidH, lidT, disp } = spec;
  const mac = kind === "mac";

  // Coins de l'image identiques à ceux de la dalle.
  useEffect(() => {
    screenEl.style.borderRadius = spec.screenRadius;
    screenEl.style.overflow = "hidden";
  }, [screenEl, spec.screenRadius]);

  const mats = useMemo(
    () => ({
      // Reflets du PC noir contenus : sinon le repose-poignets, vu en biais, paraît gris clair.
      body: new THREE.MeshPhysicalMaterial({
        color: spec.body,
        metalness: spec.bodyMetal,
        roughness: spec.bodyRough,
        clearcoat: mac ? 0.2 : 0,
        clearcoatRoughness: 0.5,
        envMapIntensity: mac ? 1 : 0.16,
        specularIntensity: mac ? 1 : 0.16,
      }),
      well: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.85, metalness: 0.2 }),
      // Touches noires mates : peu de reflets, sinon elles paraissent grises vues de biais.
      key: new THREE.MeshStandardMaterial({ color: spec.keys, roughness: 0.82, metalness: 0, envMapIntensity: mac ? 0.12 : 0.06 }),
      // Pavé tactile : verre poli sur le Mac, verre satiné noir sur le PC.
      pad: new THREE.MeshPhysicalMaterial({
        color: mac ? "#cfd2d6" : "#202125",
        metalness: mac ? 0.9 : 0,
        roughness: mac ? 0.22 : 0.55,
        clearcoat: mac ? 0.8 : 0,
        envMapIntensity: mac ? 1 : 0.12,
        specularIntensity: mac ? 1 : 0.12,
      }),
      // Bordures de l'écran : noir anti-reflet. Un verre trop poli renvoyait de grandes taches de lumière
      // qui se déplaçaient au moindre mouvement (surtout sur la bande sous l'écran).
      glass: new THREE.MeshPhysicalMaterial({
        color: "#050506",
        roughness: 0.45,
        clearcoat: 0.25,
        clearcoatRoughness: 0.4,
        metalness: 0,
        envMapIntensity: 0.25,
      }),
      lens: new THREE.MeshPhysicalMaterial({ color: "#0b0d14", roughness: 0.1, clearcoat: 1, envMapIntensity: 0.6 }),
      hinge: new THREE.MeshStandardMaterial({ color: mac ? "#1b1c1f" : "#18191c", roughness: 0.45, metalness: 0.6 }),
      // Intérieur des ports : noir profond, et languette de contact un peu plus claire.
      hole: new THREE.MeshBasicMaterial({ color: "#020203" }),
      tongue: new THREE.MeshStandardMaterial({ color: "#3b3d42", roughness: 0.5, metalness: 0.4 }),
      dark: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.6 }),
    }),
    [mac, spec],
  );

  const geo = useMemo(() => {
    const layout = keyboardLayout(spec, kind);
    const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
    return {
      layout,
      base: roundedSlab(w, d, h, r, Math.min(0.28, h / 3)),
      lid: roundedSlab(w, lidH, lidT, r, 0.12),
      well: flat(new THREE.ShapeGeometry(roundedRect(layout.totalW + 0.6, layout.totalD + 0.6, 0.35), 16)),
      keys: mergeGeometries(
        layout.keys.map((k) => {
          const g = flat(roundedSlab(k.w, k.d, spec.keyT, Math.min(0.16, k.d / 2.5), 0.02, { bevel: 2, curve: 6 }));
          return g.translate(k.x, h + spec.keyRise - spec.keyT / 2, k.z);
        }),
      )!,
      pad: flat(new THREE.ShapeGeometry(roundedRect(spec.trackpad.w, spec.trackpad.h, mac ? 0.45 : 0.6), 24)),
      bezel: new THREE.ShapeGeometry(roundedRect(w - 0.22, lidH - 0.22, r - 0.11), 24),
      dot: flat(new THREE.CircleGeometry(0.045, 8)),
    };
  }, [spec, kind, mac, w, d, h, r, lidH, lidT]);

  const kbFrontZ = -d / 2 + spec.hingeInset + spec.kbInset; // haut du clavier (côté charnière)

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
      m.makeTranslation(x, h + 0.008, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [dots, h]);

  // Inscriptions dessinées une fois dans une texture posée juste au-dessus des touches.
  // Sur le PC, elles sont rétroéclairées (matériau non éclairé, toujours lisible).
  const legend = useMemo(() => {
    const PX = 90; // pixels par centimètre
    const { totalW, totalD, keys } = geo.layout;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(totalW * PX);
    canvas.height = Math.round(totalD * PX);
    const ctx = canvas.getContext("2d")!;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const family = mac ? '-apple-system, "Segoe UI", Roboto, Arial, sans-serif' : '"Segoe UI", "Segoe UI Variable", Roboto, Arial, sans-serif';
    ctx.fillStyle = mac ? "#c9ccd2" : "#d4d6dc";
    for (const k of keys) {
      if (!k.label) continue;
      const cx = (k.x + totalW / 2) * PX;
      const cy = k.z * PX;
      const lines = k.label.split("\n");
      if (lines.length === 2) {
        // Touche à deux symboles : le symbole du haut au-dessus de celui du bas.
        const size = (k.small ? 0.22 : 0.27) * spec.u * PX;
        ctx.font = `500 ${size}px ${family}`;
        ctx.fillText(lines[0], cx, cy - size * 0.55);
        ctx.fillText(lines[1], cx, cy + size * 0.6);
        continue;
      }
      const long = k.label.length > 2;
      const size = (k.small ? 0.24 : long ? 0.24 : 0.4) * spec.u * PX;
      ctx.font = `${mac ? 500 : 400} ${size}px ${family}`;
      ctx.fillText(k.label, cx, cy);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = mac
      ? new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6 })
      : new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 });
    const plane = new THREE.PlaneGeometry(totalW, totalD).rotateX(-Math.PI / 2);
    return { mat, plane };
  }, [geo, mac, spec.u]);

  const hingeZ = -d / 2 + spec.hingeInset;
  const padZ = d / 2 - spec.trackpad.front - spec.trackpad.h / 2;
  const tilt = (lidAngle - 90) * (Math.PI / 180);
  const pxScale = disp.w / LAPTOP_SCREEN_PX[kind].w;
  const dispCenterY = disp.bottom + disp.h / 2;

  return (
    <group>
      {/* Base : coque, puits du clavier, touches, pavé tactile */}
      <mesh geometry={geo.base} rotation={[-Math.PI / 2, 0, 0]} position={[0, h / 2, 0]} material={mats.body} />
      <mesh geometry={geo.well} position={[0, h + 0.01, kbFrontZ + geo.layout.totalD / 2]} material={mats.well} />
      <mesh geometry={geo.keys} position={[0, 0, kbFrontZ]} material={mats.key} />
      <mesh geometry={legend.plane} position={[0, h + spec.keyRise + 0.008, kbFrontZ + geo.layout.totalD / 2]} material={legend.mat} />
      <mesh geometry={geo.pad} position={[spec.trackpad.x, h + 0.01, padZ]} material={mats.pad} />
      <Ports kind={kind} w={w} h={h} hole={mats.hole} tongue={mats.tongue} />
      {mac && (
        // Encoche d'ouverture sur le bord avant.
        <mesh position={[0, h - 0.02, d / 2 - 0.12]} rotation={[-Math.PI / 2, 0, 0]} material={mats.hinge}>
          <planeGeometry args={[7, 0.22]} />
        </mesh>
      )}
      {spec.speakers && <instancedMesh ref={dotsRef} args={[geo.dot, mats.dark, dots.length]} />}

      {/* Charnière : une barre presque sur toute la largeur */}
      <mesh position={[0, h + 0.2, hingeZ]} rotation={[0, 0, Math.PI / 2]} material={mats.hinge}>
        <cylinderGeometry args={[0.32, 0.32, mac ? w - 7 : w - 4, 24]} />
      </mesh>

      {/* Capot ouvert, pivotant autour de la charnière */}
      <group position={[0, h + 0.2, hingeZ]} rotation={[-tilt, 0, 0]}>
        <mesh geometry={geo.lid} position={[0, lidH / 2, -lidT / 2]} material={mats.body} />
        <mesh geometry={geo.bezel} position={[0, lidH / 2, 0.02]} material={mats.glass} />
        <ScreenAnchor el={screenEl} scale={pxScale} position={[0, dispCenterY, 0.03]} />
        {!mac && (
          // Webcam au centre de la bordure du haut (sur le Mac, elle est dans l'encoche de l'écran).
          <mesh position={[0, disp.bottom + disp.h + (lidH - disp.bottom - disp.h) / 2, 0.03]} material={mats.lens}>
            <circleGeometry args={[0.12, 20]} />
          </mesh>
        )}
      </group>
    </group>
  );
}

// Connectique sur les flancs, d'après les fiches techniques. `z` : position depuis le centre (négatif = vers l'arrière).
type PortType = "usbc" | "usba" | "hdmi" | "jack" | "slot" | "magsafe" | "connect";
type Port = { z: number; type: PortType };

const PORT_SIZE: Record<PortType, { w: number; h: number; r: number }> = {
  usbc: { w: 0.84, h: 0.26, r: 0.13 },
  usba: { w: 1.25, h: 0.5, r: 0.05 },
  hdmi: { w: 1.4, h: 0.42, r: 0.06 },
  jack: { w: 0.36, h: 0.36, r: 0.18 },
  slot: { w: 1.15, h: 0.12, r: 0.04 }, // lecteur de carte
  magsafe: { w: 1.25, h: 0.3, r: 0.15 },
  connect: { w: 1.9, h: 0.24, r: 0.12 }, // prise de charge magnétique
};

const PORTS: Record<LaptopKind, { left: Port[]; right: Port[] }> = {
  mac: {
    // Gauche : MagSafe, deux ports USB-C (Thunderbolt), prise casque. Droite : HDMI, lecteur SD, USB-C.
    left: [
      { z: -7.5, type: "magsafe" },
      { z: -5.3, type: "usbc" },
      { z: -3.9, type: "usbc" },
      { z: 6.8, type: "jack" },
    ],
    right: [
      { z: -6.6, type: "hdmi" },
      { z: -3.3, type: "slot" },
      { z: 0.2, type: "usbc" },
    ],
  },
  windows: {
    // Gauche, de l'arrière vers l'avant : prise casque, USB-A, deux USB-C. Droite : prise de charge, lecteur microSD.
    left: [
      { z: -8.7, type: "jack" },
      { z: -7.1, type: "usba" },
      { z: -5.3, type: "usbc" },
      { z: -3.9, type: "usbc" },
    ],
    right: [
      { z: -7.6, type: "connect" },
      { z: -4.6, type: "slot" },
    ],
  },
};

// Chaque port : une ouverture noire et, pour les prises USB et HDMI, la languette de contact visible au fond.
function Ports({ kind, w, h, hole, tongue }: { kind: LaptopKind; w: number; h: number; hole: THREE.Material; tongue: THREE.Material }) {
  const set = PORTS[kind];
  const shapes = useMemo(() => {
    const make = (pw: number, ph: number, pr: number) => new THREE.ShapeGeometry(roundedRect(pw, ph, Math.min(pr, ph / 2, pw / 2)), 12);
    const out = {} as Record<PortType, { hole: THREE.BufferGeometry; tongue?: THREE.BufferGeometry; tongueY?: number }>;
    (Object.keys(PORT_SIZE) as PortType[]).forEach((t) => {
      const s = PORT_SIZE[t];
      out[t] = { hole: make(s.w, s.h, s.r) };
      if (t === "usbc") out[t].tongue = make(s.w * 0.62, s.h * 0.24, 0.02);
      if (t === "usba") {
        out[t].tongue = make(s.w * 0.84, s.h * 0.34, 0.01);
        out[t].tongueY = s.h * 0.17;
      }
      if (t === "hdmi") out[t].tongue = make(s.w * 0.7, s.h * 0.28, 0.01);
    });
    return out;
  }, []);

  const render = (p: Port, side: -1 | 1) => {
    const s = shapes[p.type];
    return (
      <group key={`${side}${p.z}`} position={[side * (w / 2 + 0.01), h / 2, p.z]} rotation={[0, (side * Math.PI) / 2, 0]}>
        <mesh geometry={s.hole} material={hole} />
        {s.tongue && <mesh geometry={s.tongue} position={[0, s.tongueY ?? 0, 0.002]} material={tongue} />}
      </group>
    );
  };

  return (
    <group>
      {set.left.map((p) => render(p, -1))}
      {set.right.map((p) => render(p, 1))}
    </group>
  );
}
