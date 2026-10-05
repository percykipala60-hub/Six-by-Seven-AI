import { useMemo } from "react";
import * as THREE from "three";
import type { Finish, Model } from "../phone/RealPhone";
import { roundedRect, roundedSlab, SPECS } from "./geometry";

// Teintes des coloris (aluminium anodisé et verre arrière dépoli).
const FINISH_COLORS: Record<Finish, { metal: string; glass: string }> = {
  silver: { metal: "#d9dce0", glass: "#e6e8eb" },
  orange: { metal: "#e2662a", glass: "#d9763f" },
  blue: { metal: "#33446e", glass: "#3a4a74" },
  rose: { metal: "#b9808f", glass: "#c99aa6" },
};

function useMaterials(finish: Finish) {
  return useMemo(() => {
    const c = FINISH_COLORS[finish];
    return {
      // Aluminium satiné : métallique, légèrement rugueux.
      metal: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 1, roughness: 0.34, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
      // Bagues d'objectifs et boutons : même teinte, plus polie.
      polished: new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 1, roughness: 0.16 }),
      // Verre arrière dépoli.
      frosted: new THREE.MeshPhysicalMaterial({ color: c.glass, metalness: 0.15, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.5 }),
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
      barrel: new THREE.MeshStandardMaterial({ color: "#2b2f38", metalness: 0.9, roughness: 0.32, envMapIntensity: 0.9 }),
      barrelLight: new THREE.MeshStandardMaterial({ color: "#a9afba", metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }),
      barrelDim: new THREE.MeshStandardMaterial({ color: "#23262d", metalness: 1, roughness: 0.35, envMapIntensity: 0.6 }),
      // Élément optique : bleu nuit profond avec traitement irisé.
      element: new THREE.MeshPhysicalMaterial({
        color: "#050609",
        metalness: 0,
        roughness: 0.2,
        clearcoat: 0.2,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.25,
        iridescence: 0.12,
        iridescenceIOR: 2,
        iridescenceThicknessRange: [280, 760],
      }),
      pupil: new THREE.MeshStandardMaterial({ color: "#000000", roughness: 0.5 }),
      // Verre saphir de protection : presque invisible, il ne se voit qu'à ses reflets.
      cover: new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        metalness: 0,
        roughness: 0,
        clearcoat: 1,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        envMapIntensity: 1.4,
      }),
      // Liseré d'ombre autour des boutons, et verre du bouton de commande de l'appareil photo.
      gap: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.6 }),
      control: new THREE.MeshPhysicalMaterial({ color: "#0b0c10", metalness: 0.2, roughness: 0.08, clearcoat: 1, envMapIntensity: 1 }),
      // Flash : grand diffuseur blanc laiteux.
      flash: new THREE.MeshPhysicalMaterial({ color: "#f4f1ea", emissive: "#1d1c18", roughness: 0.45, clearcoat: 1, envMapIntensity: 0.6 }),
      // Verre teinté vert-bleu des objectifs Samsung.
      elementGreen: new THREE.MeshPhysicalMaterial({
        color: "#05080a",
        metalness: 0,
        roughness: 0.2,
        clearcoat: 0.2,
        envMapIntensity: 0.25,
        iridescence: 0.12,
        iridescenceIOR: 1.8,
        iridescenceThicknessRange: [200, 600],
      }),
      sensor: new THREE.MeshPhysicalMaterial({ color: "#000000", roughness: 0.15, clearcoat: 1, envMapIntensity: 0.35 }),
    };
  }, [finish]);
}

type M = ReturnType<typeof useMaterials>;

const FACE: [number, number, number] = [0, Math.PI, 0];
// Ordonnée d'un point situé à `frac` de la hauteur en partant du haut.
const yAt = (h: number, frac: number) => h / 2 - frac * h;
// Demi-angle d'ouverture de la calotte du verre de protection.
const COVER = 0.75;

// Objectif complet, orienté vers l'arrière (-z), posé sur une surface à la profondeur `z`.
// « apple » : bague métal épaisse au chanfrein poli, large anneau noir, grand verre fumé très réfléchissant.
// « samsung » : fine bague métal en cylindre haut, liseré noir étroit, verre teinté vert-bleu.
function Lens({ x, y, z, r, m, look = "apple" }: { x: number; y: number; z: number; r: number; m: M; look?: "apple" | "samsung" }) {
  const rot: [number, number, number] = [Math.PI / 2, 0, 0];
  const apple = look === "apple";
  const height = apple ? 0.18 : 0.22;
  const top = -height; // face supérieure de la bague
  const blackOuter = apple ? 0.8 : 0.9;
  const glass = apple ? 0.64 : 0.78;
  const coverR = (r * glass) / Math.sin(COVER);
  return (
    <group position={[x, y, z]}>
      {/* Bague métallique et son chanfrein poli qui accroche un fin trait de lumière */}
      <mesh rotation={rot} position={[0, 0, top / 2]} material={m.polished}>
        <cylinderGeometry args={[r, r, height, 72]} />
      </mesh>
      <mesh position={[0, 0, top]} material={m.polished}>
        <torusGeometry args={[r * (blackOuter + 1) / 2, r * (1 - blackOuter) / 2, 18, 96]} />
      </mesh>
      {/* Anneau noir brillant */}
      <mesh position={[0, 0, top - 0.002]} rotation={FACE} material={m.housing}>
        <ringGeometry args={[r * glass, r * blackOuter, 72]} />
      </mesh>
      {/* Élément optique, bague intérieure et pupille, sous le verre */}
      <mesh position={[0, 0, top - 0.003]} rotation={FACE} material={apple ? m.element : m.elementGreen}>
        <circleGeometry args={[r * glass, 72]} />
      </mesh>
      <mesh position={[0, 0, top - 0.004]} rotation={FACE} material={m.barrelDim}>
        <ringGeometry args={[r * glass * 0.46, r * glass * 0.5, 72]} />
      </mesh>
      <mesh position={[0, 0, top - 0.005]} rotation={FACE} material={m.pupil}>
        <circleGeometry args={[r * glass * 0.3, 48]} />
      </mesh>
      {/* Verre bombé de protection : il reflète la pièce comme sur les photos */}
      <mesh position={[0, 0, top - 0.003 + coverR * Math.cos(COVER)]} rotation={[-Math.PI / 2, 0, 0]} material={m.cover}>
        <sphereGeometry args={[coverR, 72, 16, 0, Math.PI * 2, 0, COVER]} />
      </mesh>
    </group>
  );
}

// Bouton latéral réaliste : face plate, bouts arrondis, à peine en relief (~0,5 mm),
// cerné d'un interstice très fin. `side` : -1 côté gauche, +1 côté droit (vu de face).
// `length` : longueur totale du bouton, en cm.
function SideButton({ side, y, length, w, m, kind = "metal" }: { side: 1 | -1; y: number; length: number; w: number; m: M; kind?: "metal" | "control" | "sim" }) {
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
        <mesh position={[side * (w / 2 + 0.001), y - length / 2 + 0.22, 0]} rotation={[0, side * Math.PI / 2, 0]} material={m.gap}>
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
function EdgeShape({ x, y, w, h, r, material, hole, lift = 0.001 }: { x: number; y: number; w: number; h: number; r: number; material: THREE.Material; hole?: number; lift?: number }) {
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

// Tranche du bas. iPhone : USB-C au centre, haut-parleur et micros de part et d'autre.
// Galaxy Ultra : embout du S Pen à gauche, tiroir SIM, USB-C au centre, haut-parleur à droite.
function BottomEdge({ h, m, model }: { h: number; m: M; model: Model }) {
  const y = -h / 2;
  const step = 0.16;
  const holes =
    model === "pro"
      ? [...Array(6)].flatMap((_, i) => [1.2 + i * step, -(1.2 + i * step)])
      : [...Array(7)].map((_, i) => 1.15 + i * step);
  return (
    <group>
      {/* Port USB-C : bordure polie, ouverture sombre, languette intérieure */}
      <EdgeShape x={0} y={y} w={0.94} h={0.33} r={0.165} material={m.polished} lift={0.0006} />
      <EdgeShape x={0} y={y} w={0.86} h={0.26} r={0.13} material={m.gap} lift={0.0012} />
      <EdgeShape x={0} y={y} w={0.56} h={0.07} r={0.03} material={m.barrelDim} lift={0.0018} />
      {holes.map((hx) => (
        <mesh key={hx} position={[hx, y - 0.0012, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.gap}>
          <circleGeometry args={[0.045, 20]} />
        </mesh>
      ))}
      {model === "ultra" && (
        <>
          {/* Tiroir SIM : contour très fin et trou d'éjection */}
          <EdgeShape x={-1.2} y={y} w={1.3} h={0.3} r={0.15} material={m.gap} hole={0.018} />
          <mesh position={[-0.68, y - 0.0012, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.gap}>
            <circleGeometry args={[0.035, 16]} />
          </mesh>
          {/* Embout du stylet S Pen, affleurant et poli */}
          <EdgeShape x={-2.45} y={y} w={0.58} h={0.3} r={0.15} material={m.gap} lift={0.0006} />
          <EdgeShape x={-2.45} y={y} w={0.54} h={0.26} r={0.13} material={m.polished} lift={0.0012} />
        </>
      )}
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

export function PhoneModel({ model, finish }: { model: Model; finish: Finish }) {
  const m = useMaterials(finish);
  const spec = SPECS[model];
  const { w, h, d, r } = spec;
  const back = -d / 2;

  const geos = useMemo(() => {
    const body = roundedSlab(w, h, d, r, 0.22);
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
    };
  }, [w, h, d, r]);

  return (
    <group>
      <mesh geometry={geos.body} material={m.metal} />
      <mesh geometry={geos.front} position={[0, 0, d / 2 + 0.002]} material={m.frontGlass} />

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
          <mesh
            geometry={geos.panelPro}
            position={[0, -h / 2 + 0.3 + geos.panelProH / 2, back - 0.002]}
            rotation={[0, Math.PI, 0]}
            material={m.frosted}
          />
          {(() => {
            const z = back - 0.15;
            // Bague d'objectif ≈ 22 % de la largeur (≈ 15,6 mm), comme sur les photos de référence.
            const lr = 0.78;
            const gap = 0.12;
            const step = 2 * lr + gap;
            // Groupe d'objectifs centré verticalement dans le plateau (haut à h/2 - 0.15, hauteur 4.2).
            const plateauMid = h / 2 - 0.15 - 2.1;
            const y1 = plateauMid + step / 2;
            const y2 = plateauMid - step / 2;
            const x1 = w / 2 - 0.15 - 0.42 - lr;
            const x3 = x1 - Math.sqrt(step ** 2 - (step / 2) ** 2);
            const xr = -w / 2 + 0.95;
            return (
              <>
                <Lens x={x1} y={y1} z={z} r={lr} m={m} />
                <Lens x={x1} y={y2} z={z} r={lr} m={m} />
                <Lens x={x3} y={(y1 + y2) / 2} z={z} r={lr} m={m} />
                <Dot x={xr} y={y1 + 0.15} z={z - 0.002} r={0.42} material={m.flash} />
                <Dot x={xr} y={(y1 + y2) / 2} z={z - 0.002} r={0.06} material={m.sensor} />
                <Dot x={xr} y={y2 - 0.15} z={z - 0.002} r={0.38} material={m.sensor} />
              </>
            );
          })()}
        </>
      ) : (
        <>
          <mesh geometry={geos.panelUltra} position={[0, 0, back - 0.002]} rotation={[0, Math.PI, 0]} material={m.frosted} />
          {(() => {
            const z = back - 0.004;
            const lr = 0.66;
            const x1 = w / 2 - 0.55 - lr;
            const x2 = x1 - 1.5;
            const y1 = h / 2 - 0.6 - lr;
            return (
              <>
                {/* Colonne de trois objectifs, puis à droite : flash et laser en haut, un objectif au milieu. */}
                <Lens x={x1} y={y1} z={z} r={lr} m={m} look="samsung" />
                <Lens x={x1} y={y1 - 1.5} z={z} r={lr} m={m} look="samsung" />
                <Lens x={x1} y={y1 - 3.0} z={z} r={lr} m={m} look="samsung" />
                <Lens x={x2} y={y1 - 1.5} z={z} r={lr * 0.86} m={m} look="samsung" />
                <Dot x={x2 + 0.28} y={y1 + 0.2} z={z - 0.002} r={0.2} material={m.flash} />
                <Dot x={x2 - 0.28} y={y1 + 0.2} z={z - 0.002} r={0.2} material={m.sensor} />
              </>
            );
          })()}
        </>
      )}
    </group>
  );
}
