import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Rotate3d } from "lucide-react";
// Photo de studio HDR (CC0, Poly Haven) : métal et verre reflètent une vraie pièce, pas des formes géométriques.
import studioHdr from "@pmndrs/assets/hdri/studio.exr.js";
import type { Finish, Model } from "../phone/RealPhone";
import { PhoneModel } from "./PhoneModel";
import { SPECS } from "./geometry";
import controls from "../phone/RealPhone.module.css";
import styles from "./Phone3D.module.css";

export type Phone3DProps = {
  children: ReactNode;
  pose?: { x: number; y: number; z: number };
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
  { id: "orange", name: "Orange cosmique" },
  { id: "blue", name: "Bleu intense" },
  { id: "rose", name: "Bois de rose" },
];

// Taille de l'interface affichée sur l'écran, en pixels CSS.
const SCREEN_PX = { w: 276, h: 600 };
const RETURN_DELAY = 2600;
const DEG = Math.PI / 180;
const DEFAULT_POSE = { x: -4, y: -16, z: -1.5 };

type Input = {
  dragging: boolean;
  rot: { x: number; y: number };
  vel: { x: number; y: number };
  look: { x: number; y: number };
  lastRelease: number;
};

// Téléphone en vraie 3D (WebGL) : volumes, métal, verre et reflets calculés par la carte graphique.
export default function Phone3D({
  children,
  // Pose de repos : de face, l'écran légèrement tourné vers la gauche du visiteur (on voit le flanc droit).
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
  const screenEl = useMemo(() => {
    const div = document.createElement("div");
    div.style.width = `${SCREEN_PX.w}px`;
    div.style.height = `${SCREEN_PX.h}px`;
    // Le navigateur masque l'écran tout seul quand le téléphone est vu de dos.
    div.style.backfaceVisibility = "hidden";
    div.style.pointerEvents = "none";
    return div;
  }, []);
  const [currentFinish, setFinish] = useState<Finish>(finish);
  const [active, setActive] = useState(true);
  const [grabbing, setGrabbing] = useState(false);
  const [touched, setTouched] = useState(false);
  const input = useRef<Input>({
    dragging: false,
    rot: { x: pose.x, y: pose.y },
    vel: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    lastRelease: -Infinity,
  });

  // Rendu en pause quand le téléphone n'est pas à l'écran.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Glisser pour faire tourner, avec élan au lâcher. touch-action: pan-y laisse défiler la page au doigt.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const s = input.current;
    let last = { x: 0, y: 0, t: 0 };
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      s.dragging = true;
      setGrabbing(true);
      setTouched(true);
      el.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      s.vel.x = s.vel.y = 0;
    };
    const move = (e: PointerEvent) => {
      if (s.dragging) {
        const now = performance.now();
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        const dt = Math.max(now - last.t, 1);
        s.rot.y += dx * 0.5;
        s.rot.x = Math.min(80, Math.max(-80, s.rot.x + dy * 0.4));
        s.vel.y = (dx * 0.5 * 16) / dt;
        s.vel.x = (dy * 0.4 * 16) / dt;
        last = { x: e.clientX, y: e.clientY, t: now };
      }
    };
    const up = (e: PointerEvent) => {
      if (!s.dragging) return;
      s.dragging = false;
      setGrabbing(false);
      s.lastRelease = performance.now();
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const look = (e: PointerEvent) => {
      s.look.x = (e.clientY / window.innerHeight - 0.5) * 8;
      s.look.y = (e.clientX / window.innerWidth - 0.5) * 12;
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    if (follow && finePointer) window.addEventListener("pointermove", look, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      window.removeEventListener("pointermove", look);
    };
  }, [follow]);

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
          camera={{ position: [0, 0, 31], fov: 30 }}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping }}
        >
          <Studio />
          <Rig input={input} pose={pose} float={float}>
            <PhoneModel model={model} finish={currentFinish} />
            <Screen model={model} el={screenEl} />
          </Rig>
        </Canvas>
        <div className={styles.shadow} aria-hidden="true" />
      </div>
      {createPortal(
        <div className={styles.screen} style={{ width: SCREEN_PX.w, height: SCREEN_PX.h, borderRadius: screenRadiusPx(model) }}>
          {children}
          <div className={styles.island} aria-hidden="true" />
          <div className={styles.homeBar} aria-hidden="true" />
        </div>,
        screenEl,
      )}

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
              {FINISHES.filter((f) => f.id !== "rose").map((f) => (
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

// Éclairage de studio photo : grandes boîtes à lumière qui dessinent des reflets nets sur le métal.
// Tout est généré localement, aucune image d'environnement n'est téléchargée.
function Studio() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 12]} intensity={1.2} />
      <directionalLight position={[-6, 8, -12]} intensity={0.9} />
      <Environment files={studioHdr} resolution={256} frames={1} environmentIntensity={0.9}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 10]} scale={[12, 2.5, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[-10, 0, 4]} rotation-y={Math.PI / 2.5} scale={[16, 3, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[10, 2, 2]} rotation-y={-Math.PI / 2.5} scale={[16, 2, 1]} />
        {/* Lumières derrière le téléphone : le dos est aussi bien éclairé que la face. */}
        <Lightformer form="rect" intensity={2.6} position={[0, 6, -10]} rotation-y={Math.PI} scale={[12, 2.5, 1]} />
        <Lightformer form="rect" intensity={1.8} position={[-9, -2, -6]} rotation-y={Math.PI * 0.75} scale={[14, 3, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[0, -7, -4]} rotation-x={Math.PI / 3} scale={[14, 3, 1]} />
        <Lightformer form="ring" color="#9db4ff" intensity={1.2} position={[6, 8, -10]} scale={4} />
      </Environment>
    </>
  );
}

function Rig({
  input,
  pose,
  float,
  children,
}: {
  input: React.RefObject<Input>;
  pose: { x: number; y: number; z: number };
  float: boolean;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const look = useRef({ x: 0, y: 0 });
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    const s = input.current;
    if (!g || !s) return;
    const k = Math.min(delta * 60, 3);
    const now = performance.now();

    if (!s.dragging) {
      s.rot.y += s.vel.y * k;
      s.rot.x = Math.min(80, Math.max(-80, s.rot.x + s.vel.x * k));
      s.vel.y *= Math.pow(0.94, k);
      s.vel.x *= Math.pow(0.9, k);
      if (now - s.lastRelease > RETURN_DELAY && Math.abs(s.vel.y) < 0.2) {
        s.rot.y += shortest(pose.y - s.rot.y) * 0.05 * k;
        s.rot.x += (pose.x - s.rot.x) * 0.05 * k;
      }
    }

    const settled = !s.dragging && now - s.lastRelease > RETURN_DELAY;
    look.current.x += ((settled ? s.look.x : 0) - look.current.x) * 0.06 * k;
    look.current.y += ((settled ? s.look.y : 0) - look.current.y) * 0.06 * k;

    const t = state.clock.elapsedTime;
    const moving = float && !reduced.current;
    const bob = moving ? Math.sin(t * 0.9) : 0;
    const sway = moving && settled ? Math.sin(t * 0.6) * 2.5 : 0;

    g.rotation.set((s.rot.x + look.current.x + bob * 1.2) * DEG, (s.rot.y + look.current.y + sway) * DEG, pose.z * DEG);
    g.position.y = bob * 0.18;
  });

  return <group ref={group}>{children}</group>;
}

// L'interface React posée sur l'écran, via le moteur CSS 3D de three.js :
// elle reste dans l'arbre React de la page (pas de seconde racine) et suit exactement le téléphone.
function Screen({ model, el }: { model: Model; el: HTMLDivElement }) {
  const { d } = SPECS[model];
  const { scene, camera, size, gl } = useThree();
  const anchor = useRef<THREE.Group>(null);

  const renderer = useMemo(() => {
    const r = new CSS3DRenderer();
    Object.assign(r.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    return r;
  }, []);

  useEffect(() => {
    const host = gl.domElement.parentElement;
    host?.appendChild(renderer.domElement);
    return () => renderer.domElement.remove();
  }, [gl, renderer]);

  useEffect(() => renderer.setSize(size.width, size.height), [renderer, size]);

  useEffect(() => {
    const a = anchor.current;
    if (!a) return;
    const obj = new CSS3DObject(el);
    // 1 px CSS = 1 unité : on ramène les 276 px de l'interface à la largeur de l'image.
    obj.scale.setScalar(pxScale(model));
    a.add(obj);
    return () => {
      a.remove(obj);
    };
  }, [el, model]);

  // Masque l'écran dès qu'il ne fait plus face à la caméra.
  const tmp = useMemo(() => ({ n: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Quaternion() }), []);
  useFrame(() => {
    const a = anchor.current;
    if (a) {
      a.getWorldPosition(tmp.p);
      a.getWorldQuaternion(tmp.q);
      tmp.n.set(0, 0, 1).applyQuaternion(tmp.q);
      const facing = tmp.n.dot(camera.position.clone().sub(tmp.p)) > 0;
      const vis = facing ? "visible" : "hidden";
      if (el.style.visibility !== vis) el.style.visibility = vis;
    }
    renderer.render(scene, camera);
  });

  return <group ref={anchor} position={[0, 0, d / 2 + 0.01]} />;
}

// Taille d'un pixel de l'interface en unités 3D : l'image occupe la largeur moins la bordure.
const pxScale = (model: Model) => (SPECS[model].w - 2 * SPECS[model].inset) / SCREEN_PX.w;
// Coins de l'image concentriques à ceux du téléphone.
const screenRadiusPx = (model: Model) => Math.max(SPECS[model].r - SPECS[model].inset, 0.08) / pxScale(model);

const shortest = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
