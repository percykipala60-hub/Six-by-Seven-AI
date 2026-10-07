import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Rotate3d } from "lucide-react";
import type { Finish, Model } from "../phone/RealPhone";
import { PhoneModel } from "./PhoneModel";
import { SPECS } from "./geometry";
import { CssLayer, Rig, ScreenAnchor, Studio, createScreenElement, useDragInput, useInView, type Pose } from "./stage";
import controls from "../phone/RealPhone.module.css";
import styles from "./Phone3D.module.css";

export type Phone3DProps = {
  children: ReactNode;
  pose?: Pose;
  follow?: boolean;
  float?: boolean;
  hint?: boolean;
  finish?: Finish;
  model?: Model;
  swatches?: boolean;
  label?: string;
  className?: string;
};

const FINISHES: { id: Finish; name: string }[] = [
  { id: "silver", name: "Argent" },
  { id: "glacier", name: "Glacier" },
  { id: "burgundy", name: "Bordeaux" },
  { id: "black", name: "Noir" },
];

import { PHONE_SCREEN_PX } from "../phone/screenSize";
export { PHONE_SCREEN_PX };
// Pose de repos : de face, l'écran légèrement tourné vers la gauche du visiteur (on voit le flanc droit).
export const DEFAULT_POSE: Pose = { x: -4, y: -16, z: -1.5 };

// Téléphone en vraie 3D (WebGL) : volumes, métal, verre et reflets calculés par la carte graphique.
export default function Phone3D({
  children,
  pose = DEFAULT_POSE,
  follow = true,
  float = true,
  hint = false,
  finish = "silver",
  model = "pro",
  swatches = false,
  label,
  className,
}: Phone3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const screenEl = useMemo(() => createScreenElement(PHONE_SCREEN_PX.w, PHONE_SCREEN_PX.h), []);
  const [currentFinish, setFinish] = useState<Finish>(finish);
  const active = useInView(wrapRef);
  const { input, grabbing, touched } = useDragInput(wrapRef, follow);

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <div
        ref={wrapRef}
        className={[styles.stage, grabbing && styles.grabbing].filter(Boolean).join(" ")}
        role={label ? "img" : undefined}
        aria-label={label}
      >
        <Canvas
          frameloop={active ? "always" : "never"}
          dpr={[1, 2]}
          // Plage de profondeur resserrée autour du téléphone : évite le scintillement sur mobile.
          camera={{ position: [0, 0, 34], fov: 30, near: 20, far: 50 }}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping }}
        >
          <Studio />
          <CssLayer />
          <Rig input={input} pose={pose} float={float}>
            <PhoneModel model={model} finish={currentFinish} />
            <ScreenAnchor el={screenEl} scale={phonePxScale(model)} radius={phoneScreenRadiusPx(model)} position={[0, 0, SPECS[model].d / 2 + 0.01]} />
          </Rig>
        </Canvas>
        <div className={styles.shadow} aria-hidden="true" />
      </div>
      {createPortal(<PhoneScreen model={model}>{children}</PhoneScreen>, screenEl)}

      {(hint || swatches) && (
        <div className={controls.controls}>
          {hint && (
            <p className={controls.hint} data-hidden={touched || undefined} aria-hidden="true">
              <Rotate3d size={15} />
              Fais-le tourner
            </p>
          )}
          {swatches && (
            <div className={controls.swatches} role="radiogroup" aria-label="Coloris du téléphone">
              {FINISHES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={currentFinish === f.id}
                  aria-label={f.name}
                  title={f.name}
                  className={controls.swatch}
                  data-finish={f.id}
                  onClick={() => setFinish(f.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Contenu de l'écran du téléphone : l'interface, l'îlot de la caméra et la barre d'accueil.
export function PhoneScreen({ model, children }: { model: Model; children: ReactNode }) {
  return (
    <div
      className={styles.screen}
      data-model={model}
      style={{ width: PHONE_SCREEN_PX.w, height: PHONE_SCREEN_PX.h, borderRadius: phoneScreenRadiusPx(model) }}
    >
      {children}
      <div className={styles.island} aria-hidden="true" />
      <div className={styles.homeBar} aria-hidden="true" />
    </div>
  );
}

// Taille d'un pixel de l'interface en unités 3D : l'image occupe la largeur moins la bordure.
export const phonePxScale = (model: Model) => (SPECS[model].w - 2 * SPECS[model].inset) / PHONE_SCREEN_PX.w;
// Coins de l'image concentriques à ceux du téléphone.
export const phoneScreenRadiusPx = (model: Model) => Math.max(SPECS[model].r - SPECS[model].inset, 0.08) / phonePxScale(model);
