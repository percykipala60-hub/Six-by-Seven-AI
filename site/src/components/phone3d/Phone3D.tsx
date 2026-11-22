import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { Rotate3d } from "lucide-react";
import type { Finish, Model } from "../phone/RealPhone";
import { createPhone } from "./PhoneModel";
import { SPECS } from "./geometry";
import { Stage } from "./engine";
import { addCssLayer, addStudio, createRig, createScreenAnchor, createScreenElement, useDragInput, useInView, type Pose, overscanFov, overscanStyle } from "./stage";
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
  const host = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<{ stage: Stage; rig: THREE.Group } | null>(null);

  // Scène 3D : éclairage, puis le téléphone sur son support tournant, avec l'interface sur l'écran.
  useEffect(() => {
    const stage = new Stage(host.current!, {
      style: overscanStyle as Partial<CSSStyleDeclaration>,
      dpr: [1, 2],
      // Plage de profondeur resserrée autour du téléphone : évite le scintillement sur mobile.
      camera: { position: [0, 0, 34], fov: overscanFov(30), near: 20, far: 50 },
      toneMapping: THREE.NeutralToneMapping,
      adaptive: true,
    });
    let alive = true;
    addStudio(stage).then(() => {
      if (!alive) return;
      addCssLayer(stage);
      const rig = createRig(input, pose, { float });
      const anchor = createScreenAnchor({ el: screenEl, scale: phonePxScale(model), radius: phoneScreenRadiusPx(model), position: [0, 0, SPECS[model].d / 2 + 0.01] });
      rig.group.add(anchor.group);
      stage.scene.add(rig.group);
      stage.onFrame(rig.frame);
      stage.onFrame(anchor.frame);
      setScene({ stage, rig: rig.group });
    });
    return () => {
      alive = false;
      setScene(null);
      stage.dispose();
    };
    // La scène est créée une fois ; le coloris change plus bas, sans tout reconstruire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le téléphone, reconstruit quand on change de coloris.
  useEffect(() => {
    if (!scene) return;
    const phone = createPhone({ model, finish: currentFinish, onChange: () => scene.stage.invalidate() });
    scene.rig.add(phone.group);
    scene.stage.invalidate();
    return () => {
      scene.rig.remove(phone.group);
      phone.dispose();
    };
  }, [scene, model, currentFinish]);

  useEffect(() => scene?.stage.setFrameloop(active ? "always" : "never"), [scene, active]);

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <div
        ref={wrapRef}
        className={[styles.stage, grabbing && styles.grabbing].filter(Boolean).join(" ")}
        role={label ? "img" : undefined}
        aria-label={label}
      >
        <div ref={host} style={{ display: "contents" }} />
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
