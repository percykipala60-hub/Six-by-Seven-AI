import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import type { PlatformId } from "../../content/site";
import { scenes } from "../../content/phoneScenes";
import { createPhone } from "./PhoneModel";
import { createLaptop, LAPTOP_SCREEN_PX, type LaptopKind } from "./LaptopModel";
import { SPECS } from "./geometry";
import { DEFAULT_POSE, PHONE_SCREEN_PX, PhoneScreen, phonePxScale, phoneScreenRadiusPx } from "./Phone3D";
import { Stage, type FrameState } from "./engine";
import { DEG, addCssLayer, addStudio, createRig, createScreenAnchor, createScreenElement, useDragInput, useInView, type Pose, overscanFov, overscanStyle } from "./stage";
import { SixScreen } from "../phone/Screens";
import { DesktopScreen } from "../phone/DesktopScreen";
import { ScreenZoom } from "../ui/ScreenZoom";
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

  // Scène 3D : éclairage, puis les quatre appareils sur un support tournant commun.
  // L'appareil montré au moment où la scène est prête apparaît directement, sans transition.
  const indexRef = useRef(index);
  indexRef.current = index;
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<{ stage: Stage; slots: ReturnType<typeof createSlot>[] } | null>(null);
  useEffect(() => {
    const stage = new Stage(host.current!, {
      style: overscanStyle as Partial<CSSStyleDeclaration>,
      dpr: [1, 2],
      // Plage de profondeur resserrée autour des appareils (au lieu de 0,1 à 2000) :
      // les téléphones ont une précision de profondeur limitée, sinon les surfaces proches scintillent.
      camera: { position: [0, 1.5, 46], fov: overscanFov(30), near: 24, far: 72 },
      toneMapping: THREE.NeutralToneMapping,
      adaptive: true,
    });
    let alive = true;
    const cleanups: (() => void)[] = [];
    addStudio(stage).then(() => {
      if (!alive) return;
      addCssLayer(stage);
      // Flottement très léger : les ordinateurs restent stables, les reflets ne balaient plus l'écran.
      const rig = createRig(input, { x: 0, y: 0, z: 0 }, { float: true, amplitude: 0.3 });
      stage.onFrame(rig.frame);
      const invalidate = () => stage.invalidate();
      const slots = SHOWCASE_DEVICES.map((d, i) => {
        const slot = createSlot(d.id, i === indexRef.current);
        if (d.id === "ios" || d.id === "android") {
          const model = d.id === "ios" ? "pro" : "ultra";
          const phone = createPhone({ model, finish: d.id === "ios" ? "silver" : "violet", onChange: invalidate });
          const anchor = createScreenAnchor({ el: els[d.id], scale: phonePxScale(model), radius: phoneScreenRadiusPx(model), position: [0, 0, SPECS[model].d / 2 + 0.01] });
          slot.group.add(phone.group, anchor.group);
          stage.onFrame(anchor.frame);
          cleanups.push(phone.dispose);
        } else {
          const laptop = createLaptop({ kind: d.id as LaptopKind, screenEl: els[d.id], onChange: invalidate });
          slot.group.add(laptop.group);
          stage.onFrame(laptop.frame);
          cleanups.push(laptop.dispose);
        }
        stage.onFrame(slot.frame);
        rig.group.add(slot.group);
        return slot;
      });
      stage.scene.add(rig.group);
      setScene({ stage, slots });
    });
    return () => {
      alive = false;
      cleanups.forEach((c) => c());
      setScene(null);
      stage.dispose();
    };
    // La scène est créée une fois (les éléments des écrans et la position de départ ne changent pas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => scene?.slots.forEach((s, i) => s.setActive(i === index)), [scene, index]);
  useEffect(() => scene?.stage.setFrameloop(inView ? "always" : "never"), [scene, inView]);

  return (
    <div className={styles.wrap}>
      <div
        ref={wrapRef}
        className={[styles.stage, grabbing && styles.grabbing].filter(Boolean).join(" ")}
        role="img"
        aria-label={label ?? `Six sur ${SHOWCASE_DEVICES[index].name}`}
      >
        <div ref={host} style={{ display: "contents" }} />
        <div className={styles.shadow} aria-hidden="true" />
      </div>

      <div className={styles.zoom}>
        {(() => {
          const id = SHOWCASE_DEVICES[index].id;
          if (id === "ios" || id === "android")
            return (
              <ScreenZoom kind="phone" model={id === "ios" ? "pro" : "ultra"} width={PHONE_SCREEN_PX.w} height={PHONE_SCREEN_PX.h}>
                <SixScreen scene={scenes[id === "ios" ? 0 : 2]} step={3} />
              </ScreenZoom>
            );
          const kind = id as LaptopKind;
          return (
            <ScreenZoom kind="desktop" width={LAPTOP_SCREEN_PX[kind].w} height={LAPTOP_SCREEN_PX[kind].h}>
              <DesktopScreen os={kind} width={LAPTOP_SCREEN_PX[kind].w} height={LAPTOP_SCREEN_PX[kind].h} />
            </ScreenZoom>
          );
        })()}
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
function createSlot(id: PlatformId, initiallyActive: boolean) {
  const g = new THREE.Group();
  let active = initiallyActive;
  let t = active ? 1 : 0;
  let wait = 0;
  const { pose, scale, x, y } = LAYOUT[id];

  const setActive = (next: boolean) => {
    // L'appareil suivant attend que le précédent soit presque parti : les deux ne se chevauchent pas.
    if (next && !active) wait = 0.32;
    active = next;
  };

  const frame = ({ delta }: FrameState) => {
    if (active && wait > 0) wait -= delta;
    const target = active && wait <= 0 ? 1 : 0;
    // Sortie rapide, entrée plus posée.
    t += (target - t) * Math.min(delta * (active ? 5 : 9), 1);
    const e = t;
    const s = scale * (0.55 + 0.45 * e);
    g.visible = e > 0.02;
    g.scale.setScalar(e < 0.02 ? 0.0001 : s);
    // L'appareil qui arrive tourne depuis la gauche, celui qui part continue vers la droite.
    const spin = (1 - e) * (active ? -70 : 70);
    g.rotation.set(pose.x * DEG, (pose.y + spin) * DEG, pose.z * DEG);
    g.position.set(x * e, y * e + (1 - e) * -2, 0);
  };

  return { group: g, frame, setActive };
}
