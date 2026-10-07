import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { DevicePhone } from "../components/phone3d/DevicePhone";
import { LaptopModel, type LaptopKind } from "../components/phone3d/LaptopModel";
import { PhoneModel } from "../components/phone3d/PhoneModel";
import { CssLayer, DEG, Studio, createScreenElement } from "../components/phone3d/stage";
import type { Finish, Model } from "../components/phone/RealPhone";

// Page temporaire de contrôle visuel : les dos de téléphone, de trois quarts, dans chaque coloris.
// Avec ?laptop=windows (ou mac), affiche l'ordinateur sous l'angle demandé (?x=…&y=…).
const combos: { model: Model; finish: Finish }[] = [
  { model: "pro", finish: "silver" },
  { model: "pro", finish: "glacier" },
  { model: "pro", finish: "burgundy" },
  { model: "pro", finish: "black" },
  { model: "ultra", finish: "violet" },
];

export function StudioPage() {
  const params = new URLSearchParams(window.location.search);
  const angle = Number(params.get("y") ?? 160);
  const tilt = Number(params.get("x") ?? 4);
  const only = params.get("c");
  const laptop = params.get("laptop") as LaptopKind | null;
  const capture = params.get("capture");
  if (capture) return <CaptureStudio name={capture} />;
  const phone = params.get("phone") as Model | null;
  if (phone) return <PhoneStudio model={phone} finish={(params.get("finish") as Finish) ?? (phone === "pro" ? "silver" : "violet")} />;
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

// ?phone=pro|ultra&cam=x,y,z&look=x,y,z : gros plan libre sur un téléphone (cm), pour contrôler les objectifs.
function PhoneStudio({ model, finish }: { model: Model; finish: Finish }) {
  const params = new URLSearchParams(window.location.search);
  const cam = (params.get("cam")?.split(",").map(Number) ?? [0, 0, -30]) as [number, number, number];
  const look = (params.get("look")?.split(",").map(Number) ?? [0, 0, 0]) as [number, number, number];
  return (
    <div style={{ position: "relative", height: "100vh", background: "#ffffff" }}>
      <Canvas
        camera={{ position: cam, fov: 30, near: 0.5, far: 400 }}
        gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
        onCreated={({ camera }) => camera.lookAt(...look)}
      >
        <Studio />
        <PhoneModel model={model} finish={finish} />
      </Canvas>
    </div>
  );
}

// --- Photos produit ---------------------------------------------------------------------------
// ?capture=iphone|android|mac|windows : compose l'appareil sur fond transparent avec un fond d'écran,
// puis envoie l'image au petit serveur local de capture (outil de développement, port 8799).

// Fond d'écran aux couleurs de la marque : bleu nuit, bleu et une touche de violet, heure de l'écran verrouillé.
function wallpaper(w: number, h: number, opts: { radius: number; clock?: boolean; notch?: "island" | "hole" }) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  x.beginPath();
  x.roundRect(0, 0, w, h, opts.radius);
  x.clip();
  const base = x.createLinearGradient(0, 0, w * 0.4, h);
  base.addColorStop(0, "#0b1430");
  base.addColorStop(0.55, "#1d3f9e");
  base.addColorStop(1, "#4d7cfe");
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  const glow = (cx: number, cy: number, r: number, color: string) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  };
  glow(w * 0.85, h * 0.25, w * 0.7, "rgba(123,92,255,0.55)");
  glow(w * 0.1, h * 0.85, w * 0.8, "rgba(77,124,254,0.5)");
  if (opts.clock) {
    x.fillStyle = "rgba(255,255,255,0.95)";
    x.textAlign = "center";
    x.font = `300 ${Math.round(w * 0.24)}px "Segoe UI", -apple-system, Roboto, sans-serif`;
    x.fillText("9:41", w / 2, h * 0.24);
    x.font = `500 ${Math.round(w * 0.05)}px "Segoe UI", -apple-system, Roboto, sans-serif`;
    x.fillText("lundi 15 octobre", w / 2, h * 0.11);
  }
  x.fillStyle = "#000";
  if (opts.notch === "island") {
    x.beginPath();
    x.roundRect(w / 2 - w * 0.17, h * 0.017, w * 0.34, w * 0.1, w * 0.05);
    x.fill();
  } else if (opts.notch === "hole") {
    x.beginPath();
    x.arc(w / 2, h * 0.024, w * 0.022, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function Snap({ name }: { name: string }) {
  const { gl } = useThree();
  useEffect(() => {
    const id = window.setTimeout(async () => {
      const data = gl.domElement.toDataURL("image/webp", 0.92);
      await fetch("http://127.0.0.1:8799", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, data }) });
      document.title = `capturé ${name}`;
    }, 2500);
    return () => window.clearTimeout(id);
  }, [gl, name]);
  return null;
}

function CaptureStudio({ name }: { name: string }) {
  const el = useMemo(() => createScreenElement(1000, 667), []);
  const textures = useMemo(
    () => ({
      pro: wallpaper(552, 1200, { radius: 80, clock: true, notch: "island" }),
      ultra: wallpaper(552, 1200, { radius: 40, clock: true, notch: "hole" }),
      laptop: wallpaper(1400, 920, { radius: 12 }),
    }),
    [],
  );
  const phone = name === "iphone" || name === "android";
  const model: Model = name === "iphone" ? "pro" : "ultra";
  const finish: Finish = name === "iphone" ? "silver" : "violet";
  return (
    <div style={{ width: 900, height: 900, margin: "90px auto 0", background: "transparent" }}>
      <Canvas
        dpr={1}
        camera={{ position: phone ? [0, 0, 70] : [0, 16, 118], fov: phone ? 16 : 26 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping }}
        onCreated={({ camera }) => camera.lookAt(0, phone ? 0 : 1.5, 0)}
      >
        <Studio />
        {phone ? (
          <>
            {/* Dos à gauche (objectifs visibles), face à droite : comme les visuels des fabricants. */}
            <group position={[-2.6, 0.4, -2]} rotation={[0.05, Math.PI + 0.32, 0.04]}>
              <PhoneModel model={model} finish={finish} />
            </group>
            <group position={[2.4, -0.4, 1]} rotation={[0.02, -0.28, -0.02]}>
              <PhoneModel model={model} finish={finish} wallpaper={textures[model]} />
            </group>
          </>
        ) : (
          <group rotation={[0.32, -0.5, 0]} position={[0, -4, 0]}>
            <LaptopModel kind={name as LaptopKind} screenEl={el} wallpaper={textures.laptop} />
          </group>
        )}
        <Snap name={name} />
      </Canvas>
    </div>
  );
}
