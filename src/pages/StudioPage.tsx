import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { DevicePhone } from "../components/phone3d/DevicePhone";
import { LaptopModel, type LaptopKind } from "../components/phone3d/LaptopModel";
import { CssLayer, DEG, Studio, createScreenElement } from "../components/phone3d/stage";
import type { Finish, Model } from "../components/phone/RealPhone";

// Page temporaire de contrôle visuel : les dos de téléphone, de trois quarts, dans chaque coloris.
// Avec ?laptop=windows (ou mac), affiche l'ordinateur sous l'angle demandé (?x=…&y=…).
const combos: { model: Model; finish: Finish }[] = [
  { model: "pro", finish: "silver" },
  { model: "pro", finish: "orange" },
  { model: "pro", finish: "blue" },
  { model: "ultra", finish: "rose" },
];

export function StudioPage() {
  const params = new URLSearchParams(window.location.search);
  const angle = Number(params.get("y") ?? 160);
  const tilt = Number(params.get("x") ?? 4);
  const only = params.get("c");
  const laptop = params.get("laptop") as LaptopKind | null;
  if (laptop) return <LaptopStudio kind={laptop} x={tilt} y={angle} dist={Number(params.get("d") ?? 80)} focus={(params.get("f") ?? "0,0").split(",").map(Number) as [number, number]} />;
  const shown = only === null ? combos : [combos[Number(only)]];
  return (
    <div style={{ padding: "90px 24px 40px", display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
      {shown.map((c) => (
        <DevicePhone key={c.model + c.finish} model={c.model} finish={c.finish} pose={{ x: tilt, y: angle, z: 0 }} follow={false} float={false}>
          <div style={{ position: "absolute", inset: 0, background: "#f5f6f9" }} />
        </DevicePhone>
      ))}
    </div>
  );
}

function LaptopStudio({ kind, x, y, dist, focus }: { kind: LaptopKind; x: number; y: number; dist: number; focus: [number, number] }) {
  const el = useMemo(() => {
    const div = createScreenElement(1000, 667);
    div.style.background = "#1b3a6b";
    return div;
  }, []);
  // ?cam=x,y,z&look=x,y,z : caméra libre, en coordonnées de l'ordinateur (cm), pour les gros plans.
  const params = new URLSearchParams(window.location.search);
  const cam = params.get("cam")?.split(",").map(Number) as [number, number, number] | undefined;
  const look = (params.get("look")?.split(",").map(Number) ?? [0, 0, 0]) as [number, number, number];
  return (
    <div style={{ position: "relative", height: "100vh", background: "#f2f3f5" }}>
      <Canvas
        camera={{ position: cam ?? [focus[0], 4 + focus[1], dist], fov: cam ? 35 : 30, near: 0.5, far: 400 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
        onCreated={({ camera }) => cam && camera.lookAt(...look)}
      >
        <Studio />
        <CssLayer />
        <group rotation={cam ? [0, 0, 0] : [x * DEG, y * DEG, 0]} position={cam ? [0, 0, 0] : [0, -5, 0]}>
          <LaptopModel kind={kind} screenEl={el} />
        </group>
      </Canvas>
    </div>
  );
}
