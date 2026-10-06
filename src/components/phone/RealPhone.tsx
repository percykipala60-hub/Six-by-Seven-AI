import { useEffect, useRef, useState, type ReactNode } from "react";
import { Rotate3d } from "lucide-react";
import styles from "./RealPhone.module.css";

type Props = {
  children: ReactNode;
  /** Angle de repos, en degrés. */
  pose?: { x: number; y: number; z: number };
  /** Suit légèrement le pointeur quand on ne le manipule pas. */
  follow?: boolean;
  /** Légère lévitation continue. */
  float?: boolean;
  /** Affiche l'indication « Glisse pour le faire tourner ». */
  hint?: boolean;
  /** Coloris du boîtier. */
  finish?: Finish;
  /** Style du dos : plateau photo pleine largeur, ou objectifs alignés en colonne. */
  model?: Model;
  /** Affiche les pastilles pour changer de coloris. */
  swatches?: boolean;
  label?: string;
  className?: string;
};

export type Finish = "silver" | "orange" | "blue" | "rose" | "violet";
export type Model = "pro" | "ultra";
const FINISHES: { id: Finish; name: string }[] = [
  { id: "silver", name: "Argent" },
  { id: "orange", name: "Orange cosmique" },
  { id: "blue", name: "Bleu intense" },
  { id: "rose", name: "Bois de rose" },
];

const EDGE_LAYERS = 16;
const DEPTH = 12; // épaisseur en px
const RETURN_DELAY = 2600; // ms avant de revenir à la pose de repos

// Téléphone en 3D CSS, manipulable à 360°. Volontairement sans moteur 3D : le site doit rester léger.
// Toute l'animation passe par des transformations, le navigateur ne repeint jamais le téléphone.
export function RealPhone({ children, pose = { x: 6, y: -20, z: 2 }, follow = true, float = true, hint = false, finish = "silver", model = "pro", swatches = false, label, className }: Props) {
  const [currentFinish, setFinish] = useState<Finish>(finish);
  const stageRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    const rig = rigRef.current;
    const glare = glareRef.current;
    if (!stage || !rig || !glare) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const rot = { x: pose.x, y: pose.y };
    const vel = { x: 0, y: 0 };
    const look = { x: 0, y: 0 };
    const lookTarget = { x: 0, y: 0 };
    let dragging = false;
    let last = { x: 0, y: 0, t: 0 };
    let lastRelease = -Infinity;
    let raf = 0;
    let visible = true;
    const start = performance.now();

    const onLook = (e: PointerEvent) => {
      lookTarget.x = (e.clientY / window.innerHeight - 0.5) * -8;
      lookTarget.y = (e.clientX / window.innerWidth - 0.5) * 12;
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      setGrabbing(true);
      setTouched(true);
      stage.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      vel.x = vel.y = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const dt = Math.max(now - last.t, 1);
      rot.y += dx * 0.5;
      rot.x = clamp(rot.x - dy * 0.4, -80, 80);
      // Vitesse en degrés par image (16 ms), pour l'élan au lâcher.
      vel.y = (dx * 0.5 * 16) / dt;
      vel.x = (-dy * 0.4 * 16) / dt;
      last = { x: e.clientX, y: e.clientY, t: now };
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      setGrabbing(false);
      lastRelease = performance.now();
      if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    };

    const tick = (now: number) => {
      const t = (now - start) / 1000;

      if (!dragging) {
        // Élan après le lâcher, qui s'amortit.
        rot.y += vel.y;
        rot.x = clamp(rot.x + vel.x, -80, 80);
        vel.y *= 0.94;
        vel.x *= 0.9;

        // Retour en douceur vers la pose de repos, par le chemin le plus court.
        if (now - lastRelease > RETURN_DELAY && Math.abs(vel.y) < 0.2) {
          rot.y += shortest(pose.y - rot.y) * 0.05;
          rot.x += (pose.x - rot.x) * 0.05;
        }
      }

      const settled = !dragging && now - lastRelease > RETURN_DELAY;
      look.x += ((settled ? lookTarget.x : 0) - look.x) * 0.06;
      look.y += ((settled ? lookTarget.y : 0) - look.y) * 0.06;

      const bob = float && !reduced ? Math.sin(t * 0.9) : 0;
      const sway = float && !reduced && settled ? Math.sin(t * 0.6) * 2.5 : 0;
      const rx = rot.x + look.x + bob * 1.2;
      const ry = rot.y + look.y + sway;

      rig.style.transform = `translate3d(0, ${(bob * 8).toFixed(2)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${pose.z}deg)`;
      glare.style.transform = `translate3d(${(-shortest(ry) * 1.6).toFixed(2)}%, 0, 0)`;
      if (visible) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was) raf = requestAnimationFrame(tick);
    });
    io.observe(stage);

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    if (follow && finePointer && !reduced) window.addEventListener("pointermove", onLook, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointermove", onLook);
    };
  }, [pose.x, pose.y, pose.z, follow, float]);

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <div
        ref={stageRef}
        className={[styles.stage, grabbing && styles.grabbing].filter(Boolean).join(" ")}
        data-finish={currentFinish}
        data-model={model}
        role={label ? "img" : undefined}
        aria-label={label}
      >
        <div className={styles.scaler}>
          <div
            ref={rigRef}
            className={styles.rig}
            style={{ transform: `rotateX(${pose.x}deg) rotateY(${pose.y}deg) rotateZ(${pose.z}deg)` }}
          >
            {Array.from({ length: EDGE_LAYERS }, (_, i) => (
              <div
                key={i}
                className={styles.edge}
                style={{ transform: `translateZ(${(-(i * DEPTH) / (EDGE_LAYERS - 1)).toFixed(2)}px)` }}
                aria-hidden="true"
              />
            ))}
            <span className={`${styles.btn} ${styles.action}`} aria-hidden="true" />
            <span className={`${styles.btn} ${styles.volUp}`} aria-hidden="true" />
            <span className={`${styles.btn} ${styles.volDown}`} aria-hidden="true" />
            <span className={`${styles.btn} ${styles.power}`} aria-hidden="true" />

            <BackFace model={model} />

            <div className={styles.front}>
              <div className={styles.bezel}>
                <div className={styles.screen} aria-hidden={label ? true : undefined}>
                  {children}
                  <div className={styles.island} aria-hidden="true" />
                  <div className={styles.homeBar} aria-hidden="true" />
                  <div ref={glareRef} className={styles.glare} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.shadow} aria-hidden="true" />
      </div>
      {(hint || swatches) && (
        <div className={styles.controls}>
          {hint && (
            <p className={styles.hint} data-hidden={touched || undefined} aria-hidden="true">
              <Rotate3d size={15} />
              Fais-le tourner
            </p>
          )}
          {swatches && (
            <div className={styles.swatches} role="radiogroup" aria-label="Coloris du téléphone">
              {FINISHES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={currentFinish === f.id}
                  aria-label={f.name}
                  title={f.name}
                  className={styles.swatch}
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

// Deux dos inspirés des téléphones haut de gamme actuels, sans aucun logo :
// « pro » : plateau photo sur toute la largeur, trois objectifs en triangle ;
// « ultra » : dos lisse, objectifs posés un par un en colonne.
function BackFace({ model }: { model: Model }) {
  return (
    <div className={styles.backFace} aria-hidden="true">
      {model === "pro" ? (
        <div className={styles.backBody}>
          <div className={styles.plateau}>
            <span className={styles.lens} />
            <span className={styles.lens} />
            <span className={styles.lens} />
            <span className={styles.flash} />
            <span className={styles.lidar} />
            <span className={styles.mic} />
          </div>
          <div className={styles.glassPanel} />
        </div>
      ) : (
        <div className={`${styles.backBody} ${styles.ultraBody}`}>
          <span className={styles.uLens} style={{ top: 24, left: 22 }} />
          <span className={styles.uLens} style={{ top: 86, left: 22 }} />
          <span className={styles.uLens} style={{ top: 148, left: 22 }} />
          <span className={styles.uLens} style={{ top: 24, left: 84 }} />
          <span className={styles.uLaser} style={{ top: 92, left: 101 }} />
          <span className={styles.uFlash} style={{ top: 122, left: 101 }} />
        </div>
      )}
    </div>
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
// Ramène un angle dans [-180, 180] pour tourner par le chemin le plus court.
const shortest = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
