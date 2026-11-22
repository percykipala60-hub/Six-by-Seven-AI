import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { roundedRect, roundedSlab } from "./geometry";
import { carveInto, logoGeometry, roundedPrism, solid, zCylinder } from "./carve";
import { APPLE_PATH, MICROSOFT_PATH, WINDOWS_PATH } from "./brandLogos";
import { createScreenAnchor } from "./stage";

// Ordinateurs portables modélisés à leurs dimensions réelles (1 unité = 1 cm). Les ports, les logements
// des touches et le pavé tactile sont de vrais creux dans la coque.
// « mac » : MacBook Pro 16 pouces M5 Pro (mars 2026), en noir sidéral : encoche, haut-parleurs de part et
// d'autre du clavier, 35,57 × 24,81 × 1,68 cm.
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
  /** Hauteur du dessus des touches au-dessus du plateau, épaisseur et arrondi des touches (cm). */
  keyRise: number;
  keyT: number;
  keyBevel: number;
  /** Clavier posé dans un seul puits (Mac) ou dans un logement par touche (PC), et profondeur du creux. */
  pocket: "single" | "perKey";
  pocketDepth: number;
  padRadius: number;
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
    // Noir sidéral : aluminium anodisé très sombre, satiné.
    body: "#1b1c1f",
    // Peu métallique : sinon l'aluminium sombre renvoie tout le blanc du studio et paraît argenté.
    bodyMetal: 0.2,
    bodyRough: 0.6,
    // Touches extra-plates du MacBook : elles affleurent presque le plateau.
    keys: "#0e0f11",
    speakers: true,
    keyRise: 0.035,
    keyT: 0.16,
    keyBevel: 0.02,
    pocket: "single",
    pocketDepth: 0.12,
    padRadius: 0.45,
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
    // Vraies touches en relief : 1,1 mm au-dessus de l'aluminium, flancs visibles dans leur logement.
    keyRise: 0.11,
    keyT: 0.3,
    keyBevel: 0.04,
    pocket: "perKey",
    pocketDepth: 0.2,
    padRadius: 0.6,
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

// `enter` : les deux moitiés de la touche Entrée en L (haut et bas).
type KeyRect = {
  x: number;
  z: number;
  w: number;
  d: number;
  label: string;
  small?: boolean;
  enter?: "top" | "bottom";
};

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
      // Ctrl, Fn, touche Windows, Alt, espace, Alt Gr, touche Copilot, flèches.
      ["Ctrl", "Fn", "WIN", "Alt", "", "Alt Gr", "▤", "◀", "▲▼", "▶"],
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
    keys.push({
      x: fx + (k * u) / 2,
      z: z + fnH / 2,
      w: k * u - gap,
      d: fnH - gap * 0.8,
      label: labels.fn[i] ?? "",
      small: true,
    });
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
        keys.push({
          x: cx,
          z: z + u / 4,
          w: k * u - gap,
          d: half,
          label: "▲",
          small: true,
        });
        keys.push({
          x: cx,
          z: z + (3 * u) / 4,
          w: k * u - gap,
          d: half,
          label: "▼",
          small: true,
        });
      } else if (label === "◀" || label === "▶") {
        keys.push({
          x: cx,
          z: z + (3 * u) / 4,
          w: k * u - gap,
          d: half,
          label,
          small: true,
        });
      } else if (r === 2 && c === row.length - 1) {
        // Bas de la touche Entrée : prolongé vers le haut jusqu'à la partie supérieure, pour former le L.
        keys.push({
          x: cx,
          z: z + u / 2 - gap / 2,
          w: k * u - gap,
          d: u,
          label,
          enter: "bottom",
        });
      } else if (r === 1 && c === row.length - 1) {
        keys.push({
          x: cx,
          z: z + u / 2,
          w: k * u - gap,
          d: u - gap,
          label,
          enter: "top",
        });
      } else {
        keys.push({ x: cx, z: z + u / 2, w: k * u - gap, d: u - gap, label });
      }
      x += k * u;
    });
    z += u;
  });

  return { keys, totalW, totalD: z };
}

type V3 = [number, number, number];

// Maillage posé, tourné et mis à l'échelle (rotations en radians, ordre XYZ).
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], position?: V3, rotation?: V3) {
  const o = new THREE.Mesh(geometry, material);
  if (position) o.position.set(...position);
  if (rotation) o.rotation.set(...rotation);
  return o;
}

// Petits éléments répétés (fentes, trous de haut-parleur) : un seul objet dessiné pour toutes les copies.
function instances(geometry: THREE.BufferGeometry, material: THREE.Material, at: [number, number, number][]) {
  const o = new THREE.InstancedMesh(geometry, material, at.length);
  const m = new THREE.Matrix4();
  at.forEach(([x, y, z], i) => o.setMatrixAt(i, m.makeTranslation(x, y, z)));
  o.instanceMatrix.needsUpdate = true;
  return o;
}

// Ordinateur complet. `screenEl` : élément qui porte l'interface affichée à l'écran.
// `wallpaper` : image posée sur l'écran (photos produit), par-dessus l'emplacement de l'interface.
// `onChange` : appelé quand la coque creusée remplace la coque pleine (pour demander une nouvelle image).
// Renvoie le groupe à poser dans la scène, l'écran (à mettre à jour à chaque image) et de quoi arrêter le calcul.
export function createLaptop({
  kind,
  screenEl,
  lidAngle = 112,
  wallpaper,
  onChange,
}: {
  kind: LaptopKind;
  screenEl: HTMLDivElement;
  lidAngle?: number;
  wallpaper?: THREE.Texture;
  onChange?: () => void;
}) {
  const spec = LAPTOP_SPECS[kind];
  const { w, d, h, r, lidH, lidT, disp } = spec;
  const mac = kind === "mac";

  // Coins de l'image identiques à ceux de la dalle.
  screenEl.style.borderRadius = spec.screenRadius;
  screenEl.style.overflow = "hidden";

  const mats = {
    // Reflets du PC noir contenus : sinon le repose-poignets, vu en biais, paraît gris clair.
    body: new THREE.MeshPhysicalMaterial({
      color: spec.body,
      metalness: spec.bodyMetal,
      roughness: spec.bodyRough,
      clearcoat: 0,
      clearcoatRoughness: 0.5,
      envMapIntensity: mac ? 0.13 : 0.16,
      specularIntensity: mac ? 0.2 : 0.16,
    }),
    // Parois et fond des trous (ports, logements des touches) : métal sombre, la lumière y meurt vite.
    cavity: new THREE.MeshStandardMaterial({
      color: "#0a0a0c",
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.04,
    }),
    // Touches noires mates : peu de reflets, sinon elles paraissent grises vues de biais.
    key: new THREE.MeshPhysicalMaterial({
      color: spec.keys,
      roughness: 0.7,
      metalness: 0,
      envMapIntensity: mac ? 0.12 : 0.08,
      specularIntensity: 0.22,
    }),
    // Pavé tactile : verre noir sidéral légèrement satiné sur le Mac, verre satiné noir sur le PC.
    pad: new THREE.MeshPhysicalMaterial({
      color: mac ? "#1d1e21" : "#202125",
      metalness: mac ? 0.2 : 0,
      roughness: mac ? 0.4 : 0.55,
      clearcoat: mac ? 0.3 : 0,
      envMapIntensity: mac ? 0.18 : 0.12,
      specularIntensity: mac ? 0.3 : 0.12,
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
    lens: new THREE.MeshPhysicalMaterial({
      color: "#0b0d14",
      roughness: 0.1,
      clearcoat: 1,
      envMapIntensity: 0.6,
    }),
    hinge: new THREE.MeshStandardMaterial({
      color: mac ? "#1b1c1f" : "#18191c",
      roughness: 0.45,
      metalness: 0.6,
    }),
    // Logo du capot : métal poli miroir.
    logo: new THREE.MeshPhysicalMaterial({
      color: mac ? "#6a6c73" : "#5d6068",
      metalness: 1,
      roughness: 0.06,
      clearcoat: 1,
      envMapIntensity: mac ? 1.3 : 0.9,
    }),
    // Languettes de contact au fond des ports, et contacts dorés.
    tongue: new THREE.MeshStandardMaterial({
      color: "#2c2e33",
      roughness: 0.45,
      metalness: 0.5,
    }),
    gold: new THREE.MeshStandardMaterial({
      color: "#c9a25a",
      roughness: 0.3,
      metalness: 1,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: "#050506",
      roughness: 0.6,
    }),
  };

  const kbFrontZ = -d / 2 + spec.hingeInset + spec.kbInset; // haut du clavier (côté charnière)
  const padZ = d / 2 - spec.trackpad.front - spec.trackpad.h / 2;

  const layout = keyboardLayout(spec, kind);
  const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
  const kbCenterZ = kbFrontZ + layout.totalD / 2;

  // Coque de la base, posée sur le plan y = 0, puis creusée (dans un fil séparé, voir carveInto).
  const makeShell = () =>
    roundedSlab(w, d, h, r, Math.min(0.28, h / 3), { bevel: 8, curve: 32 })
      .rotateX(-Math.PI / 2)
      .translate(0, h / 2, 0);
  const pocketW = layout.totalW + 0.5;
  const pocketD = layout.totalD + 0.5;
  const buildBase = () => {
    const cutters: THREE.BufferGeometry[] = [];
    // Clavier : un seul creux sous toutes les touches (puits noir du Mac). Sur le PC, une plaque d'aluminium
    // percée d'une ouverture par touche le recouvre : le métal passe entre les touches, comme sur le vrai.
    // (Creuser chaque logement directement dans la coque prendrait plusieurs secondes de calcul.)
    cutters.push(flat(roundedPrism(pocketW, pocketD, 0.35, spec.pocketDepth * 2, 12)).translate(0, h, kbCenterZ));
    // Pavé tactile encastré, cerné d'un fin interstice.
    cutters.push(flat(roundedPrism(spec.trackpad.w + 0.08, spec.trackpad.h + 0.08, spec.padRadius + 0.04, 0.24, 16)).translate(spec.trackpad.x, h, padZ));
    // Encoche d'ouverture du Mac : creux doux au milieu du bord avant.
    const shaped = mac ? [new THREE.SphereGeometry(1, 48, 24).scale(3.6, 0.42, 0.62).translate(0, h + 0.3, d / 2 + 0.16)] : [];
    // Ports sur les flancs.
    for (const [side, list] of [
      [-1, PORTS[kind].left],
      [1, PORTS[kind].right],
    ] as const) {
      for (const p of list) cutters.push(portCutter(p.type, side, w, h, p.z));
    }
    return { base: makeShell(), cutters, shaped };
  };

  const keyCaps = mergeGeometries(
    layout.keys.map((k) =>
      flat(roundedSlab(k.w, k.d, spec.keyT, Math.min(0.16, k.d / 2.5), spec.keyBevel, { bevel: 3, curve: 6 })).translate(
        k.x,
        h + spec.keyRise - spec.keyT / 2,
        kbFrontZ + k.z,
      ),
    ),
  )!;

  let deck: THREE.BufferGeometry | null = null;
  if (spec.pocket === "perKey") {
    const m = 0.05; // jeu entre la touche et l'aluminium
    const outline = roundedRect(pocketW - 0.008, pocketD - 0.008, 0.35);
    const half = layout.totalD / 2;
    const enterTop = layout.keys.find((k) => k.enter === "top")!;
    const enterBottom = layout.keys.find((k) => k.enter === "bottom")!;
    for (const k of layout.keys) {
      if (k.enter) continue;
      const hole = roundedRect(k.w + 2 * m, k.d + 2 * m, Math.min(0.16, k.d / 2.5) + m);
      const pts = hole.getPoints(4).map((pt) => new THREE.Vector2(pt.x + k.x, pt.y - (k.z - half)));
      outline.holes.push(new THREE.Path(pts));
    }
    // Ouverture en L de la touche Entrée (les deux moitiés réunies).
    const right = enterTop.x + enterTop.w / 2 + m;
    const zTop = enterTop.z - enterTop.d / 2 - m - half;
    const zMid = enterTop.z + enterTop.d / 2 - half;
    const zBot = enterBottom.z + enterBottom.d / 2 + m - half;
    const xTop = enterTop.x - enterTop.w / 2 - m;
    const xBot = enterBottom.x - enterBottom.w / 2 - m;
    outline.holes.push(
      new THREE.Path([
        new THREE.Vector2(xTop, -zTop),
        new THREE.Vector2(right, -zTop),
        new THREE.Vector2(right, -zBot),
        new THREE.Vector2(xBot, -zBot),
        new THREE.Vector2(xBot, -zMid),
        new THREE.Vector2(xTop, -zMid),
      ]),
    );
    const plateT = 0.05;
    deck = new THREE.ExtrudeGeometry(outline, {
      depth: plateT,
      bevelEnabled: false,
      curveSegments: 6,
    })
      .rotateX(-Math.PI / 2)
      .translate(0, h - plateT, kbCenterZ);
  }

  // Grilles de haut-parleurs (Mac) : petits trous en quinconce de chaque côté du clavier.
  const dots: [number, number][] = [];
  if (spec.speakers) {
    const halfKb = layout.totalW / 2 + 0.25;
    const gridW = w / 2 - halfKb - 1.2;
    for (const side of [-1, 1]) {
      const cx = side * (halfKb + 0.6 + gridW / 2);
      for (let row = 0; row < 46; row++) {
        for (let col = 0; col < 13; col++) {
          const x = cx - gridW / 2 + (col + (row % 2) * 0.5) * (gridW / 13);
          const z = kbFrontZ + row * (layout.totalD / 46);
          dots.push([x, z]);
        }
      }
    }
  }

  // Inscriptions dessinées une fois dans une texture posée juste au-dessus des touches.
  // Sur le PC, elles sont rétroéclairées (matériau non éclairé, toujours lisible).
  const legend = (() => {
    const PX = 90; // pixels par centimètre
    const { totalW, totalD, keys } = layout;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(totalW * PX);
    canvas.height = Math.round(totalD * PX);
    const ctx = canvas.getContext("2d")!;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const family = mac ? '-apple-system, "Segoe UI", Roboto, Arial, sans-serif' : '"Segoe UI", "Segoe UI Variable", Roboto, Arial, sans-serif';
    ctx.fillStyle = mac ? "#c9ccd2" : "#d4d6dc";
    const winLogo = new Path2D(WINDOWS_PATH);
    for (const k of keys) {
      if (!k.label) continue;
      const cx = (k.x + totalW / 2) * PX;
      const cy = k.z * PX;
      if (k.label === "WIN") {
        // Touche Windows : le logo à quatre carreaux.
        const s = (0.34 * spec.u * PX) / 24;
        ctx.save();
        ctx.translate(cx - 12 * s, cy - 12 * s);
        ctx.scale(s, s);
        ctx.fill(winLogo);
        ctx.restore();
        continue;
      }
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
      ? new THREE.MeshStandardMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          roughness: 0.6,
        })
      : new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          opacity: 0.85,
        });
    const plane = new THREE.PlaneGeometry(totalW, totalD).rotateX(-Math.PI / 2);
    return { mat, plane };
  })();

  const hingeZ = -d / 2 + spec.hingeInset;
  const tilt = (lidAngle - 90) * (Math.PI / 180);
  const pxScale = disp.w / LAPTOP_SCREEN_PX[kind].w;
  const dispCenterY = disp.bottom + disp.h / 2;

  const root = new THREE.Group();
  // Base creusée : coque (groupe 0) et parois des trous (groupe 1)
  const base = mesh(solid(makeShell()), [mats.body, mats.cavity]);
  const cancel = carveInto(base, `laptop-${kind}`, buildBase, onChange);
  root.add(base);
  if (deck) root.add(mesh(deck, mats.body));
  root.add(mesh(keyCaps, mats.key));
  root.add(mesh(legend.plane, legend.mat, [0, h + spec.keyRise + 0.004, kbFrontZ + layout.totalD / 2]));
  root.add(mesh(flat(roundedSlab(spec.trackpad.w, spec.trackpad.h, 0.12, spec.padRadius, 0.02, { bevel: 2, curve: 16 })), mats.pad, [spec.trackpad.x, h - 0.065, padZ]));
  root.add(portInsides(kind, w, h, mats.tongue, mats.gold));
  if (spec.speakers) root.add(instances(flat(new THREE.CircleGeometry(0.045, 8)), mats.dark, dots.map(([x, z]) => [x, h + 0.004, z])));
  root.add(underside(kind, w, d, mats.cavity));

  // Charnière : une barre presque sur toute la largeur
  root.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, mac ? w - 7 : w - 4, 24), mats.hinge, [0, h + 0.2, hingeZ], [0, 0, Math.PI / 2]));

  // Capot ouvert, pivotant autour de la charnière
  const lid = new THREE.Group();
  lid.position.set(0, h + 0.2, hingeZ);
  lid.rotation.set(-tilt, 0, 0);
  lid.add(mesh(roundedSlab(w, lidH, lidT, r, 0.12), mats.body, [0, lidH / 2, -lidT / 2]));
  // Logo au centre du dos du capot
  const logo = mac ? logoGeometry(APPLE_PATH, { height: 3.1 }) : logoGeometry(MICROSOFT_PATH, { height: 2.3 });
  lid.add(mesh(logo, mats.logo, [0, lidH / 2, -lidT - 0.003], [0, Math.PI, 0]));
  lid.add(mesh(new THREE.ShapeGeometry(roundedRect(w - 0.22, lidH - 0.22, r - 0.11), 24), mats.glass, [0, lidH / 2, 0.02]));
  const screen = createScreenAnchor({ el: screenEl, scale: pxScale, radius: parseFloat(spec.screenRadius), position: [0, dispCenterY, 0.03] });
  lid.add(screen.group);
  if (wallpaper) lid.add(mesh(new THREE.PlaneGeometry(disp.w, disp.h), new THREE.MeshBasicMaterial({ map: wallpaper, transparent: true, toneMapped: false }), [0, dispCenterY, 0.036]));
  // Webcam au centre de la bordure du haut (sur le Mac, elle est dans l'encoche de l'écran).
  if (!mac) lid.add(mesh(new THREE.CircleGeometry(0.12, 20), mats.lens, [0, disp.bottom + disp.h + (lidH - disp.bottom - disp.h) / 2, 0.03]));
  root.add(lid);

  return { group: root, frame: screen.frame, dispose: cancel };
}

// ---------- Dessous de l'ordinateur : pieds, vis, grilles d'aération, inscriptions ----------

// Tête de vis vue de dessous : métal, cernée d'un liseré, avec l'empreinte pentalobe (Mac) ou Torx (PC).
const screwTextures: Partial<Record<LaptopKind, THREE.CanvasTexture>> = {};
function screwTexture(kind: LaptopKind) {
  const cached = screwTextures[kind];
  if (cached) return cached;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d")!;
  const mid = S / 2;
  const g = x.createRadialGradient(mid - 14, mid - 14, 4, mid, mid, mid);
  g.addColorStop(0, kind === "mac" ? "#8d9097" : "#7b7e85");
  g.addColorStop(0.7, kind === "mac" ? "#4a4c52" : "#3d3f45");
  g.addColorStop(1, "#141518");
  x.fillStyle = g;
  x.beginPath();
  x.arc(mid, mid, mid - 2, 0, Math.PI * 2);
  x.fill();
  // Empreinte : 5 lobes (pentalobe Apple) ou étoile à 6 branches (Torx).
  const lobes = kind === "mac" ? 5 : 6;
  x.fillStyle = "#0b0b0d";
  x.beginPath();
  for (let i = 0; i <= lobes * 2; i++) {
    const a = (i / (lobes * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? S * 0.3 : S * 0.17;
    const px = mid + Math.cos(a) * rr;
    const py = mid + Math.sin(a) * rr;
    if (i === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  x.closePath();
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  screwTextures[kind] = tex;
  return tex;
}

// Inscriptions du dessous, dessinées dans une texture : « MacBook Pro » gravé au centre sur le Mac,
// logo Microsoft et mentions réglementaires sur le PC.
function bottomLabelTexture(kind: LaptopKind) {
  const W = 1200;
  const H = 300;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.textAlign = "center";
  x.textBaseline = "middle";
  if (kind === "mac") {
    x.fillStyle = "rgba(255,255,255,0.9)";
    x.font = '500 150px -apple-system, "SF Pro Display", "Segoe UI", Arial, sans-serif';
    x.fillText("MacBook Pro", W / 2, H / 2);
  } else {
    // Logo Microsoft (quatre carreaux), puis deux lignes de petites mentions.
    const s = 46;
    const ox = W / 2 - s - 3;
    const oy = 30;
    x.fillStyle = "rgba(255,255,255,0.85)";
    x.fillRect(ox, oy, s, s);
    x.fillRect(ox + s + 6, oy, s, s);
    x.fillRect(ox, oy + s + 6, s, s);
    x.fillRect(ox + s + 6, oy + s + 6, s, s);
    x.font = '400 34px "Segoe UI", Arial, sans-serif';
    x.fillText("Surface Laptop  ·  Designed by Microsoft  ·  Assembled in China", W / 2, 190);
    x.fillText("Model 2113  ·  20V ⎓ 3.25A  ·  CE  FC", W / 2, 240);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Pose des petites fentes d'aération (instances) : chaque fente est un rectangle arrondi creusé dans la coque.
function slotGrid(slots: [number, number][], len: number, wid: number, material: THREE.Material) {
  const geo = new THREE.ShapeGeometry(roundedRect(len, wid, wid / 2), 6).rotateX(Math.PI / 2);
  return instances(geo, material, slots.map(([sx, sz]) => [sx, -0.002, sz]));
}

// Le dessous, d'après les photos des vrais ordinateurs.
// Mac (MacBook Pro 16 pouces 2021-2026) : quatre pieds ronds, huit vis pentalobe, grilles d'aspiration le long
// des deux côtés, sortie d'air chaude à l'arrière sous la charnière, « MacBook Pro » gravé au centre.
// PC : deux longs pieds, grande grille d'aspiration vers l'arrière, sortie d'air à l'arrière, dix vis Torx,
// trappe d'accès au SSD, logo et mentions réglementaires.
function underside(kind: LaptopKind, w: number, d: number, cavity: THREE.Material) {
  const mac = kind === "mac";
  const mats = {
    rubber: new THREE.MeshStandardMaterial({ color: "#0d0d0f", roughness: 0.85, metalness: 0, envMapIntensity: 0.1 }),
    screw: new THREE.MeshStandardMaterial({ map: screwTexture(kind), metalness: 0.7, roughness: 0.35, envMapIntensity: 0.6 }),
    label: new THREE.MeshStandardMaterial({ map: bottomLabelTexture(kind), transparent: true, opacity: mac ? 0.28 : 0.4, depthWrite: false, roughness: 0.5 }),
    seam: new THREE.MeshStandardMaterial({ color: "#060607", roughness: 0.8 }),
    door: new THREE.MeshStandardMaterial({ color: "#232428", roughness: 0.6, metalness: 0.15 }),
  };
  const down = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2);

  const feet: { x: number; z: number; w: number; d: number }[] = mac
    ? [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * (w / 2 - 2.6), z: sz * (d / 2 - 2.3), w: 1.2, d: 1.2 })))
    : [-1, 1].map((sz) => ({ x: 0, z: sz * (d / 2 - 1.5), w: w - 5, d: 0.62 }));
  const screws: [number, number][] = mac
    ? [-1, 1].flatMap((sz) => [-1, 1].flatMap((sx) => [[sx * (w / 2 - 1.05), sz * (d / 2 - 0.85)] as [number, number], [sx * (w / 2 - 11.5), sz * (d / 2 - 0.85)] as [number, number]]))
    : [
        ...[-1, 1].flatMap((sz) => [-1, 1].flatMap((sx) => [[sx * (w / 2 - 1.0), sz * (d / 2 - 0.75)] as [number, number], [sx * 6, sz * (d / 2 - 0.75)] as [number, number]])),
        [-(w / 2 - 1.0), 0],
        [w / 2 - 1.0, 0],
      ];
  // Sortie d'air à l'arrière, sous la charnière : une rangée de fentes courtes.
  const exhaust: [number, number][] = [];
  const exW = mac ? 24 : 22;
  for (let i = 0; i < Math.round(exW / 0.3); i++) exhaust.push([-exW / 2 + i * 0.3, -d / 2 + 0.55]);
  // Aspiration : le long des côtés (Mac) ou grande grille rectangulaire vers l'arrière (PC).
  const intake: [number, number][] = [];
  if (mac) {
    for (const sx of [-1, 1]) for (let i = 0; i < 30; i++) intake.push([sx * (w / 2 - 0.85), -7.5 + i * 0.42]);
  } else {
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 62; col++) intake.push([-10.5 + col * 0.345 + (row % 2) * 0.17, -8.6 + row * 1.08]);
  }

  const screw = down(new THREE.CircleGeometry(0.11, 24));
  const g = new THREE.Group();
  // Pieds en caoutchouc, qui dépassent légèrement sous la coque
  for (const f of feet) g.add(mesh(down(roundedSlab(f.w, f.d, 0.08, Math.min(f.w, f.d) / 2, 0.035, { bevel: 4, curve: 20 })), mats.rubber, [f.x, -0.03, f.z]));
  for (const [sx, sz] of screws) g.add(mesh(screw, mats.screw, [sx, -0.0025, sz]));
  g.add(slotGrid(exhaust, 0.09, 0.42, cavity));
  g.add(mac ? slotGrid(intake, 0.55, 0.1, cavity) : slotGrid(intake, 0.12, 0.85, cavity));
  if (!mac) {
    // Trappe d'accès au SSD : fin liseré sombre et vis Torx.
    const door = new THREE.Group();
    door.position.set(7.5, 0, 4.2);
    door.add(mesh(down(new THREE.ShapeGeometry(roundedRect(2.6, 4.2, 0.25), 12)), mats.seam, [0, -0.0018, 0]));
    door.add(mesh(down(new THREE.ShapeGeometry(roundedRect(2.52, 4.12, 0.22), 12)), mats.door, [0, -0.0021, 0]));
    door.add(mesh(screw, mats.screw, [0, -0.0026, 1.7]));
    g.add(door);
  }
  g.add(mesh(down(new THREE.PlaneGeometry(mac ? 7 : 12, mac ? 1.75 : 3)), mats.label, [0, -0.0024, mac ? 0 : d / 2 - 4.2]));
  return g;
}

// Connectique sur les flancs, d'après les fiches techniques. `z` : position depuis le centre (négatif = vers l'arrière).
type PortType = "usbc" | "usba" | "hdmi" | "jack" | "sd" | "microsd" | "magsafe" | "connect";
type Port = { z: number; type: PortType };

// Ouverture (largeur, hauteur, rayon) et profondeur du trou, en cm.
const PORT_SIZE: Record<PortType, { w: number; h: number; r: number; depth: number }> = {
  usbc: { w: 0.84, h: 0.26, r: 0.13, depth: 0.75 },
  usba: { w: 1.25, h: 0.5, r: 0.04, depth: 0.95 },
  hdmi: { w: 1.4, h: 0.42, r: 0.06, depth: 0.9 },
  jack: { w: 0.36, h: 0.36, r: 0.18, depth: 1.2 },
  sd: { w: 2.4, h: 0.16, r: 0.04, depth: 0.7 },
  microsd: { w: 1.15, h: 0.12, r: 0.04, depth: 0.6 },
  magsafe: { w: 1.25, h: 0.3, r: 0.15, depth: 0.28 },
  connect: { w: 1.9, h: 0.24, r: 0.12, depth: 0.32 },
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
      { z: -3.3, type: "sd" },
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
      { z: -4.6, type: "microsd" },
    ],
  },
};

// Volume retiré pour un port : prisme orienté selon x, qui traverse la paroi et s'enfonce de `depth`.
function portCutter(type: PortType, side: -1 | 1, w: number, h: number, z: number) {
  const s = PORT_SIZE[type];
  const len = s.depth + 0.4;
  const g = type === "jack" ? zCylinder(s.w / 2, len, 24) : roundedPrism(s.w, s.h, s.r, len, 8);
  // Axe z du prisme -> axe x ; la largeur de l'ouverture suit la longueur de l'ordinateur.
  g.rotateY(Math.PI / 2);
  return g.translate(side * (w / 2 - s.depth + len / 2), h / 2, z);
}

// Ce qu'on voit au fond des ports : languettes des USB et du HDMI, contacts dorés des prises magnétiques.
function portInsides(kind: LaptopKind, w: number, h: number, tongue: THREE.Material, gold: THREE.Material) {
  const g = new THREE.Group();
  for (const [side, list] of [
    [-1, PORTS[kind].left],
    [1, PORTS[kind].right],
  ] as const) {
    for (const p of list) {
      const s = PORT_SIZE[p.type];
      // Abscisse d'un point situé à `inset` cm à l'intérieur de la paroi.
      const at = (inset: number) => side * (w / 2 - inset);
      const box = (bw: number, bh: number, from: number, to: number, y = 0) =>
        new THREE.BoxGeometry(to - from, bh, bw).translate(at((from + to) / 2), h / 2 + y, p.z);
      if (p.type === "usbc") g.add(mesh(box(s.w * 0.64, 0.07, 0.12, s.depth), tongue));
      // USB-A : bloc de contacts dans la moitié haute de l'ouverture.
      if (p.type === "usba") g.add(mesh(box(s.w * 0.86, 0.17, 0.1, s.depth, s.h * 0.17), tongue));
      if (p.type === "hdmi") g.add(mesh(box(s.w * 0.72, 0.1, 0.14, s.depth), tongue));
      if (p.type === "magsafe" || p.type === "connect") {
        const n = p.type === "magsafe" ? 5 : 7;
        const pitch = (s.w * 0.7) / (n - 1);
        for (let i = 0; i < n; i++)
          g.add(
            mesh(
              zCylinder(0.035, 0.06, 12)
                .rotateY(Math.PI / 2)
                .translate(at(s.depth - 0.02), h / 2, p.z - (s.w * 0.7) / 2 + i * pitch),
              gold,
            ),
          );
      }
    }
  }
  return g;
}
