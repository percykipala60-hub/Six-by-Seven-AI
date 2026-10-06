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
  if (laptop) return <LaptopStudio kind={laptop} x={tilt} y={angle} />;
  const shown = only === null ? combos : [combos[Number(only)]];
  return (
    <div className="dark" style={{ padding: "90px 24px 40px", display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
      {shown.map((c) => (
        <DevicePhone key={c.model + c.finish} model={c.model} finish={c.finish} pose={{ x: tilt, y: angle, z: 0 }} follow={false} float={false}>
          <div style={{ position: "absolute", inset: 0, background: "#f5f6f9" }} />
        </DevicePhone>
      ))}
    </div>
  );
}

function LaptopStudio({ kind, x, y }: { kind: LaptopKind; x: number; y: number }) {
  const el = useMemo(() => {
    const div = createScreenElement(1000, 563);
    div.style.background = "#1b3a6b";
    return div;
  }, []);
  return (
    <div style={{ position: "relative", height: "100vh", background: "#f2f3f5" }}>
      <Canvas camera={{ position: [0, 4, 80], fov: 30 }} gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}>
        <Studio />
        <CssLayer />
        <group rotation={[x * DEG, y * DEG, 0]} position={[0, -5, 0]}>
          <LaptopModel kind={kind} screenEl={el} />
        </group>
      </Canvas>
    </div>
  );
}
