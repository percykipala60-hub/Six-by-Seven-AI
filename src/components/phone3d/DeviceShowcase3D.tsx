import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import type { PlatformId } from "../../content/site";
import { scenes } from "../../content/phoneScenes";
import { PhoneModel } from "./PhoneModel";
import { LaptopModel, LAPTOP_SCREEN_PX, type LaptopKind } from "./LaptopModel";
import { SPECS } from "./geometry";
import { DEFAULT_POSE, PHONE_SCREEN_PX, PhoneScreen, phonePxScale, phoneScreenRadiusPx } from "./Phone3D";
import { CssLayer, DEG, Rig, ScreenAnchor, Studio, createScreenElement, useDragInput, useInView, type Pose } from "./stage";
import { SixScreen } from "../phone/Screens";
import { DesktopScreen } from "../phone/DesktopScreen";
import styles from "./DeviceShowcase.module.css";

type Device = { id: PlatformId; name: string };

export const SHOWCASE_DEVICES: Device[] = [
  { id: "ios", name: "iPhone" },
  { id: "android", name: "Android" },
  { id: "mac", name: "Mac" },
  { id: "windows", name: "Windows" },
];

const CYCLE_MS = 5200;

// Pose et taille de chaque appareil dans la scène (1 unité = 1 cm).
const LAYOUT: Record<PlatformId, { pose: Pose; scale: number; x: number; y: number }> = {
  ios: { pose: DEFAULT_POSE, scale: 1.5, x: 0, y: 0 },
  // Le S26 Ultra mesure 16,4 cm contre 15 cm pour l'iPhone : même hauteur à l'écran.
  android: { pose: DEFAULT_POSE, scale: 1.375, x: 0, y: 0 },
  mac: { pose: { x: 20, y: -26, z: 0 }, scale: 0.57, x: 0.2, y: -4.5 },
  windows: { pose: { x: 20, y: -26, z: 0 }, scale: 0.6, x: 0.2, y: -4.4 },
};

export type DeviceShowcaseProps = { initial?: PlatformId | null; label?: string };

// Carrousel d'appareils en 3D : iPhone, Android, Mac et PC Windows, chacun avec Six à l'écran.
// Défile seul, se met en pause quand on manipule l'appareil, et se pilote avec les onglets.
export default function DeviceShowcase3D({ initial, label }: DeviceShowcaseProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef);
  const { input, grabbing } = useDragInput(wrapRef, false);
  const startIndex = Math.max(0, SHOWCASE_DEVICES.findIndex((d) => d.id === initial));
  const [index, setIndex] = useState(startIndex);
  const [cycleKey, setCycleKey] = useState(0);

  // Un élément DOM par écran, rempli plus bas par des portails React.
  const els = useMemo(
    () => ({
      ios: createScreenElement(PHONE_SCREEN_PX.w, PHONE_SCREEN_PX.h),
      android: createScreenElement(PHONE_SCREEN_PX.w, PHONE_SCREEN_PX.h),
      mac: createScreenElement(LAPTOP_SCREEN_PX.mac.w, LAPTOP_SCREEN_PX.mac.h),
      windows: createScreenElement(LAPTOP_SCREEN_PX.windows.w, LAPTOP_SCREEN_PX.windows.h),
    }),
    [],
  );

  // Défilement automatique, suspendu pendant une manipulation et hors de l'écran.
  useEffect(() => {
    if (!inView || grabbing) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % SHOWCASE_DEVICES.length), CYCLE_MS);
    return () => window.clearTimeout(id);
  }, [index, inView, grabbing, cycleKey]);

  const choose = (i: number) => {
    setIndex(i);
    setCycleKey((k) => k + 1);
  };

  return (
    <div className={styles.wrap}>
      <div
        ref={wrapRef}
        className={[styles.stage, grabbing && styles.grabbing].filter(Boolean).join(" ")}
        role="img"
        aria-label={label ?? `Six sur ${SHOWCASE_DEVICES[index].name}`}
      >
        <Canvas
          frameloop={inView ? "always" : "never"}
          dpr={[1, 2]}
          // Plage de profondeur resserrée autour des appareils (au lieu de 0,1 à 2000) :
          // les téléphones ont une précision de profondeur limitée, sinon les surfaces proches scintillent.
          camera={{ position: [0, 1.5, 46], fov: 30, near: 24, far: 72 }}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping }}
        >
          <Studio />
          <CssLayer />
          {/* Flottement très léger : les ordinateurs restent stables, les reflets ne balaient plus l'écran. */}
          <Rig input={input} pose={{ x: 0, y: 0, z: 0 }} float amplitude={0.3}>
            {SHOWCASE_DEVICES.map((d, i) => (
              <Slot key={d.id} id={d.id} active={i === index}>
                {d.id === "ios" || d.id === "android" ? (
                  <>
                    <PhoneModel model={d.id === "ios" ? "pro" : "ultra"} finish={d.id === "ios" ? "silver" : "violet"} />
                    <ScreenAnchor
                      el={els[d.id]}
                      scale={phonePxScale(d.id === "ios" ? "pro" : "ultra")}
                      radius={phoneScreenRadiusPx(d.id === "ios" ? "pro" : "ultra")}
                      position={[0, 0, SPECS[d.id === "ios" ? "pro" : "ultra"].d / 2 + 0.01]}
                    />
                  </>
                ) : (
                  <LaptopModel kind={d.id as LaptopKind} screenEl={els[d.id]} />
                )}
              </Slot>
            ))}
          </Rig>
        </Canvas>
        <div className={styles.shadow} aria-hidden="true" />
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Appareils">
        {SHOWCASE_DEVICES.map((d, i) => (
          <button key={d.id} type="button" role="tab" aria-selected={i === index} onClick={() => choose(i)}>
            {d.name}
            {i === index && (
              <span
                key={`${index}-${cycleKey}`}
                className={styles.progress}
                style={{ animationDuration: `${CYCLE_MS}ms`, animationPlayState: grabbing || !inView ? "paused" : "running" }}
              />
            )}
          </button>
        ))}
      </div>

      {createPortal(
        <PhoneScreen model="pro">
          <SixScreen scene={scenes[0]} step={3} />
        </PhoneScreen>,
        els.ios,
      )}
      {createPortal(
        <PhoneScreen model="ultra">
          <SixScreen scene={scenes[2]} step={3} />
        </PhoneScreen>,
        els.android,
      )}
      {createPortal(<DesktopScreen os="mac" width={LAPTOP_SCREEN_PX.mac.w} height={LAPTOP_SCREEN_PX.mac.h} />, els.mac)}
      {createPortal(
        <DesktopScreen os="windows" width={LAPTOP_SCREEN_PX.windows.w} height={LAPTOP_SCREEN_PX.windows.h} />,
        els.windows,
      )}
    </div>
  );
}

// Emplacement d'un appareil : entre en tournant et en grandissant, sort de la même façon.
function Slot({ id, active, children }: { id: PlatformId; active: boolean; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const t = useRef(active ? 1 : 0);
  const wait = useRef(0);
  const wasActive = useRef(active);
  const { pose, scale, x, y } = LAYOUT[id];

  useEffect(() => {
    // L'appareil suivant attend que le précédent soit presque parti : les deux ne se chevauchent pas.
    if (active && !wasActive.current) wait.current = 0.32;
    wasActive.current = active;
  }, [active]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    if (active && wait.current > 0) wait.current -= delta;
    const target = active && wait.current <= 0 ? 1 : 0;
    // Sortie rapide, entrée plus posée.
    t.current += (target - t.current) * Math.min(delta * (active ? 5 : 9), 1);
    const e = t.current;
    const s = scale * (0.55 + 0.45 * e);
    g.visible = e > 0.02;
    g.scale.setScalar(e < 0.02 ? 0.0001 : s);
    // L'appareil qui arrive tourne depuis la gauche, celui qui part continue vers la droite.
    const spin = (1 - e) * (active ? -70 : 70);
    g.rotation.set(pose.x * DEG, (pose.y + spin) * DEG, pose.z * DEG);
    g.position.set(x * e, y * e + (1 - e) * -2, 0);
  });

  return <group ref={group}>{children}</group>;
}
