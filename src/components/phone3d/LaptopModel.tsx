import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
    hingeInset: 0.45,
    u: 1.9,
    numpad: false,
    trackpad: { w: 16.2, h: 9.4, x: 0 },
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
    w: 36.9,
    d: 25.9,
    h: 2.0,
    r: 0.55,
    lidH: 23.5,
    lidT: 0.55,
    disp: { w: 35.65, h: 20.05, bottom: 2.45 },
    // Charnière avancée de 3 cm : derrière l'écran, un coffre porte les aérations et les ports.
    hingeInset: 3.2,
    u: 1.75,
    numpad: true,
    trackpad: { w: 12.6, h: 8, x: -3.6 },
    // Gris métallisé, comme sur les photos d'un Omen 16 réel.
    body: "#35383d",
    bodyMetal: 0,
    bodyRough: 0.72,
    // Touches à course plus longue, comme sur la photo de l'Omen.
    keys: "#141519",
    speakers: false,
    keyRise: 0.07,
    keyT: 0.11,
    fnRow: 0.6,
    kbInset: 2.0,
  },
};

// Taille de l'interface affichée à l'écran, en pixels CSS (proportions de l'écran réel).
export const LAPTOP_SCREEN_PX: Record<LaptopKind, { w: number; h: number }> = {
  mac: { w: 1000, h: Math.round((1000 * 22.34) / 34.56) },
  windows: { w: 1000, h: Math.round((1000 * 20.05) / 35.65) },
};

// Disposition du clavier ISO français (AZERTY) : largeur de chaque touche en multiples du pas.
// Chaque rangée mesure exactement 14,5 pas, comme sur un vrai clavier.
const ROW_WIDTHS: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5], // chiffres, effacement
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // tabulation, A…$, haut de la touche Entrée
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75], // verrouillage, Q…, bas de la touche Entrée (en L)
  [1.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25], // majuscule, <, W…, majuscule
  [1, 1, 1, 1.25, 5, 1.25, 1, 1, 1, 1], // fn, ctrl, alt, cmd, espace, …, flèches
];

// Rangée de fonctions, également sur 14,5 pas.
const FN_WIDTHS: Record<LaptopKind, number[]> = {
  // esc large, F1 à F12, Touch ID.
  mac: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  // ESC, F1 à F12, marche/arrêt, DELETE.
  windows: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75, 0.75],
};

type KeyRect = { x: number; z: number; w: number; d: number; label: string; small?: boolean };

// Inscriptions des touches, en AZERTY français, rangée par rangée (même ordre que les largeurs).
const LABELS: Record<LaptopKind, { fn: string[]; rows: string[][]; numpad: string[]; numTop?: string[] }> = {
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
    numpad: [],
  },
  windows: {
    fn: ["ESC", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "⏻", "DELETE"],
    rows: [
      ["²", "1\n&", "2\né", "3\n\"", "4\n'", "5\n(", "6\n-", "7\nè", "8\n_", "9\nç", "0\nà", "°\n)", "+\n=", "BACKSPACE"],
      ["TAB", "A", "Z", "E", "R", "T", "Y", "U", "I", "O", "P", "¨\n^", "£\n$", "ENTER"],
      ["CAPS LOCK", "Q", "S", "D", "F", "G", "H", "J", "K", "L", "M", "%\nù", "µ\n*", ""],
      ["SHIFT", ">\n<", "W", "X", "C", "V", "B", "N", "?\n,", ".\n;", "/\n:", "§\n!", "SHIFT"],
      ["CTRL", "FN", "", "ALT", "", "ALT", "CTRL", "◀", "▲▼", "▶"],
    ],
    // Au-dessus du pavé numérique : touche du constructeur (sans logo), calculatrice, INSERT, PRT SC.
    numTop: ["", "▤", "INSERT", "PRT SC"],
    numpad: [
      "NUM\nLOCK", "/", "*", "-",
      "7\nHOME", "8\n↑", "9\nPG UP", "+",
      "4\n←", "5", "6\n→", "+",
      "1\nEND", "2\n↓", "3\nPG DN", "ENTER",
      "0\nINS", "0\nINS", ".\nDEL", "ENTER",
    ],
  },
};

function keyboardLayout(spec: Spec, kind: LaptopKind) {
  const labels = LABELS[kind];
  const u = spec.u;
  const gap = 0.32;
  const mainW = 14.5 * u;
  const numW = spec.numpad ? 4 * u : 0;
  const sep = spec.numpad ? 0.7 : 0;
  const totalW = mainW + sep + numW;
  const left = -totalW / 2;
  const keys: KeyRect[] = [];

  // Rangée des touches de fonction : demi-hauteur.
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

  if (spec.numpad) {
    const nx = left + mainW + sep;
    labels.numTop?.forEach((label, c) => keys.push({ x: nx + u * (c + 0.5), z: fnH / 2, w: u - gap, d: fnH - gap * 0.8, label, small: true }));
    let nz = fnH;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++)
        keys.push({ x: nx + u * (c + 0.5), z: nz + u / 2, w: u - gap, d: u - gap, label: labels.numpad[r * 4 + c] ?? "" });
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
        envMapIntensity: kind === "mac" ? 1 : 0.18,
        // Reflets atténués sur le gris du PC : sinon le repose-poignets, vu en biais, paraît presque blanc.
        specularIntensity: kind === "mac" ? 1 : 0.15,
      }),
      // Puits du clavier ; sur le portable de jeu, une lueur de rétroéclairage filtre entre les touches.
      well: new THREE.MeshStandardMaterial({
        color: kind === "mac" ? "#050506" : "#060608",
        roughness: 0.85,
        metalness: 0.2,
        emissive: kind === "mac" ? "#000000" : "#7d3cff",
        emissiveIntensity: kind === "mac" ? 0 : 0.11,
      }),
      // Touches noires mates : peu de reflets, sinon elles paraissent grises vues de biais.
      key: new THREE.MeshStandardMaterial({ color: spec.keys, roughness: 0.82, metalness: 0, envMapIntensity: 0.12 }),
      // Pavé tactile : verre poli sur le Mac, revêtement mat sur le portable de jeu.
      pad: new THREE.MeshPhysicalMaterial({
        color: kind === "mac" ? "#cfd2d6" : "#1d1f23",
        metalness: kind === "mac" ? 0.9 : 0.1,
        roughness: kind === "mac" ? 0.22 : 0.75,
        clearcoat: kind === "mac" ? 0.8 : 0,
        envMapIntensity: kind === "mac" ? 1 : 0.1,
        // Reflets atténués sur le PC : sinon le pavé tactile, vu en biais, paraît bleu clair.
        specularIntensity: kind === "mac" ? 1 : 0.1,
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
      dark: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.6 }),
      lens: new THREE.MeshPhysicalMaterial({ color: "#0b0d14", roughness: 0.1, clearcoat: 1, envMapIntensity: 0.6 }),
      hinge: new THREE.MeshStandardMaterial({ color: kind === "mac" ? "#1b1c1f" : "#141518", roughness: 0.45, metalness: 0.6 }),
    }),
    [kind, spec],
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
      pad: flat(new THREE.ShapeGeometry(roundedRect(spec.trackpad.w, spec.trackpad.h, 0.45), 24)),
      bezel: new THREE.ShapeGeometry(roundedRect(w - 0.22, lidH - 0.22, r - 0.11), 24),
      dot: flat(new THREE.CircleGeometry(0.045, 8)),
    };
  }, [spec, kind, w, d, h, r, lidH, lidT]);

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
  // Sur le portable de jeu, elles sont rétroéclairées (matériau non éclairé, toujours lumineux).
  const legend = useMemo(() => {
    const PX = 90; // pixels par centimètre
    const { totalW, totalD, keys } = geo.layout;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(totalW * PX);
    canvas.height = Math.round(totalD * PX);
    const ctx = canvas.getContext("2d")!;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lit = kind === "windows";
    // Le PC de jeu utilise une police carrée (proche de Bahnschrift) ; le Mac, la police système.
    const family = lit ? '"Bahnschrift", "DIN Alternate", "Arial Narrow", sans-serif' : '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = lit ? "#f1ecff" : "#c9ccd2";
    if (lit) {
      ctx.shadowColor = "rgba(176, 120, 255, 0.85)";
      ctx.shadowBlur = 4;
    }
    for (const k of keys) {
      if (!k.label) continue;
      const cx = (k.x + totalW / 2) * PX;
      const cy = k.z * PX;
      const lines = k.label.split("\n");
      if (lines.length === 2) {
        // Touche à deux symboles : le symbole du haut au-dessus de celui du bas.
        const size = (k.small ? 0.22 : 0.3) * spec.u * PX;
        ctx.font = `600 ${size}px ${family}`;
        ctx.fillText(lines[0], cx, cy - size * 0.55);
        ctx.fillText(lines[1], cx, cy + size * 0.6);
        continue;
      }
      const long = k.label.length > 2;
      const size = (k.small ? 0.24 : long ? 0.24 : 0.46) * spec.u * PX;
      ctx.font = `${lit ? 600 : 500} ${size}px ${family}`;
      ctx.fillText(k.label, cx, cy);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = lit
      ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6 });
    const plane = new THREE.PlaneGeometry(totalW, totalD).rotateX(-Math.PI / 2);
    return { mat, plane };
  }, [geo, kind, spec.u]);

  // Grille à motif de losanges, dessinée une fois dans une texture.
  const grille = useMemo(() => {
    if (kind !== "windows") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#26282c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0e0f11";
    ctx.lineWidth = 3;
    for (let x = -canvas.height; x < canvas.width + canvas.height; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + canvas.height, canvas.height);
      ctx.moveTo(x + canvas.height, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0, envMapIntensity: 0.2 });
  }, [kind]);

  const hingeZ = -d / 2 + spec.hingeInset;
  const padZ = d / 2 - 0.9 - spec.trackpad.h / 2;
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
      <Ports kind={kind} w={w} d={d} h={h} material={mats.dark} />
      {grille && (
        <mesh position={[0, h + 0.01, (hingeZ + kbFrontZ) / 2 + 0.25]} rotation={[-Math.PI / 2, 0, 0]} material={grille}>
          <planeGeometry args={[w - 5, 1.1]} />
        </mesh>
      )}
      {kind === "mac" && (
        // Encoche d'ouverture sur le bord avant.
        <mesh position={[0, h - 0.02, d / 2 - 0.12]} rotation={[-Math.PI / 2, 0, 0]} material={mats.hinge}>
          <planeGeometry args={[7, 0.22]} />
        </mesh>
      )}
      {spec.speakers && <instancedMesh ref={dotsRef} args={[geo.dot, mats.dark, dots.length]} />}

      {/* Aérations du portable de jeu : face arrière (de part et d'autre des ports) et arrière des flancs */}
      {kind === "windows" && <Vents w={w} d={d} h={h} />}

      {/* Charnière : une barre sur le Mac, deux blocs séparés aux coins sur le PC */}
      {kind === "mac" ? (
        <mesh position={[0, h + 0.2, hingeZ]} rotation={[0, 0, Math.PI / 2]} material={mats.hinge}>
          <cylinderGeometry args={[0.32, 0.32, w - 7, 24]} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, h + 0.3, hingeZ - 0.3]} rotation={[0, 0, Math.PI / 2]} material={mats.hinge}>
            <cylinderGeometry args={[0.36, 0.36, w - 7.4, 24]} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (w / 2 - 2.1), h + 0.3, hingeZ - 0.3]} rotation={[0, 0, Math.PI / 2]} material={mats.body}>
              <cylinderGeometry args={[0.46, 0.46, 3.4, 24]} />
            </mesh>
          ))}
        </>
      )}

      {/* Capot ouvert, pivotant autour de la charnière */}
      <group position={[0, h + (kind === "windows" ? 0.3 : 0.2), hingeZ]} rotation={[-tilt, 0, 0]}>
        <mesh geometry={geo.lid} position={[0, lidH / 2, -lidT / 2]} material={mats.body} />
        <mesh geometry={geo.bezel} position={[0, lidH / 2, 0.02]} material={mats.glass} />
        <ScreenAnchor el={screenEl} scale={pxScale} position={[0, dispCenterY, 0.03]} />
        <mesh position={[0, disp.bottom + disp.h + (lidH - disp.bottom - disp.h) / 2, 0.03]} material={mats.lens}>
          <circleGeometry args={[0.13, 20]} />
        </mesh>
      </group>
    </group>
  );
}

// Connectique sur les flancs (et à l'arrière pour le portable de jeu), d'après les fiches techniques.
type PortShape = { z: number; w: number; h: number; r: number; y?: number };

const PORTS: Record<LaptopKind, { left: PortShape[]; right: PortShape[]; back: { x: number; w: number; h: number; r: number }[] }> = {
  mac: {
    // Gauche : MagSafe, deux ports USB-C (Thunderbolt), prise casque. Droite : HDMI, lecteur SD, USB-C.
    left: [
      { z: -7.5, w: 1.25, h: 0.3, r: 0.15 },
      { z: -5.3, w: 0.84, h: 0.26, r: 0.13 },
      { z: -3.9, w: 0.84, h: 0.26, r: 0.13 },
      { z: 6.8, w: 0.36, h: 0.36, r: 0.18 },
    ],
    right: [
      { z: -6.6, w: 1.4, h: 0.42, r: 0.06 },
      { z: -3.3, w: 2.4, h: 0.16, r: 0.04 },
      { z: 0.2, w: 0.84, h: 0.26, r: 0.13 },
    ],
    back: [],
  },
  windows: {
    // Gauche : deux USB-C, prise casque. Droite : USB-A. Arrière, entre les aérations : alimentation, Ethernet, HDMI, USB-A.
    left: [
      { z: -5.6, w: 0.84, h: 0.28, r: 0.14 },
      { z: -4.3, w: 0.84, h: 0.28, r: 0.14 },
      { z: -2.9, w: 0.38, h: 0.38, r: 0.19 },
    ],
    right: [{ z: -5.4, w: 1.25, h: 0.5, r: 0.06 }],
    back: [
      { x: 0.1, w: 0.62, h: 0.62, r: 0.31 },
      { x: -1.5, w: 1.45, h: 1.0, r: 0.08 },
      { x: -3.3, w: 1.5, h: 0.48, r: 0.06 },
      { x: -5.0, w: 1.25, h: 0.5, r: 0.06 },
    ],
  },
};

function Ports({ kind, w, d, h, material }: { kind: LaptopKind; w: number; d: number; h: number; material: THREE.Material }) {
  const set = PORTS[kind];
  const shape = (pw: number, ph: number, pr: number) => new THREE.ShapeGeometry(roundedRect(pw, ph, Math.min(pr, ph / 2, pw / 2)), 12);
  return (
    <group>
      {set.left.map((p) => (
        <mesh key={`l${p.z}`} geometry={shape(p.w, p.h, p.r)} position={[-w / 2 - 0.01, h / 2, p.z]} rotation={[0, -Math.PI / 2, 0]} material={material} />
      ))}
      {set.right.map((p) => (
        <mesh key={`r${p.z}`} geometry={shape(p.w, p.h, p.r)} position={[w / 2 + 0.01, h / 2, p.z]} rotation={[0, Math.PI / 2, 0]} material={material} />
      ))}
      {set.back.map((p) => (
        <mesh key={`b${p.x}`} geometry={shape(p.w, p.h, p.r)} position={[p.x, h / 2, -d / 2 - 0.01]} rotation={[0, Math.PI, 0]} material={material} />
      ))}
    </group>
  );
}

// Fentes d'aération : rangée de fentes verticales arrondies, dessinées une fois dans une texture transparente.
function ventMaterial(length: number, height: number) {
  const PX = 60;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(length * PX);
  canvas.height = Math.round(height * PX);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#050506";
  const pitch = 0.42 * PX;
  const slot = 0.26 * PX;
  const count = Math.floor(canvas.width / pitch);
  const offset = (canvas.width - count * pitch) / 2;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.roundRect(offset + i * pitch + (pitch - slot) / 2, 0, slot, canvas.height, slot / 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false });
}

// Aérations de l'Omen 16 : deux larges grilles à l'arrière, de part et d'autre des ports,
// prolongées sur l'arrière de chaque flanc.
const REAR_VENTS: [number, number][] = [
  [1.1, 17.2], // à droite des ports (vu de face)
  [-17.2, -6.2], // à gauche des ports
];
const SIDE_VENT = { from: 0.7, to: 5.4 }; // distance depuis l'arrière, sur chaque flanc

function Vents({ w, d, h }: { w: number; d: number; h: number }) {
  const ventH = h * 0.5;
  const y = h * 0.52;
  const rear = useMemo(() => REAR_VENTS.map(([a, b]) => ({ x: (a + b) / 2, len: b - a, mat: ventMaterial(b - a, ventH) })), [ventH]);
  const side = useMemo(() => ventMaterial(SIDE_VENT.to - SIDE_VENT.from, ventH), [ventH]);
  const sideZ = -d / 2 + (SIDE_VENT.from + SIDE_VENT.to) / 2;
  return (
    <group>
      {rear.map((v) => (
        <mesh key={v.x} position={[v.x, y, -d / 2 - 0.012]} rotation={[0, Math.PI, 0]} material={v.mat}>
          <planeGeometry args={[v.len, ventH]} />
        </mesh>
      ))}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * (w / 2 + 0.012), y, sideZ]} rotation={[0, (sd * Math.PI) / 2, 0]} material={side}>
          <planeGeometry args={[SIDE_VENT.to - SIDE_VENT.from, ventH]} />
        </mesh>
      ))}
    </group>
  );
}
