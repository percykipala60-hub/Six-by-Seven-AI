import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { roundedRect } from "./geometry";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
// Photo de studio HDR (CC0, Poly Haven) : métal et verre reflètent une vraie pièce, pas des formes géométriques.
import studioHdr from "@pmndrs/assets/hdri/studio.exr.js";

// Briques communes aux scènes 3D (téléphone seul, carrousel d'appareils).

export const DEG = Math.PI / 180;
const RETURN_DELAY = 2600;

export type Pose = { x: number; y: number; z: number };

// Rotation imprimée par le visiteur, en degrés, ajoutée à la pose de repos de l'appareil.
export type DragInput = {
  dragging: boolean;
  rot: { x: number; y: number };
  vel: { x: number; y: number };
  look: { x: number; y: number };
  lastRelease: number;
};

// Ramène un angle dans [-180, 180] pour revenir par le chemin le plus court.
export const shortest = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

// Éclairage de studio photo : la photo HDR donne les reflets réalistes, les boîtes à lumière
// ajoutent des reflets nets sur le métal, devant comme derrière l'appareil.
export function Studio() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 12]} intensity={1.2} />
      <directionalLight position={[-6, 8, -12]} intensity={0.9} />
      <Environment files={studioHdr} resolution={256} frames={1} environmentIntensity={0.9}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 10]} scale={[12, 2.5, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[-10, 0, 4]} rotation-y={Math.PI / 2.5} scale={[16, 3, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[10, 2, 2]} rotation-y={-Math.PI / 2.5} scale={[16, 2, 1]} />
        <Lightformer form="rect" intensity={2.6} position={[0, 6, -10]} rotation-y={Math.PI} scale={[12, 2.5, 1]} />
        <Lightformer form="rect" intensity={1.8} position={[-9, -2, -6]} rotation-y={Math.PI * 0.75} scale={[14, 3, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[0, -7, -4]} rotation-x={Math.PI / 3} scale={[14, 3, 1]} />
        <Lightformer form="ring" color="#9db4ff" intensity={1.2} position={[6, 8, -10]} scale={4} />
      </Environment>
    </>
  );
}

// Glisser pour faire tourner, avec élan au lâcher. touch-action: pan-y laisse défiler la page au doigt.
export function useDragInput(wrapRef: RefObject<HTMLDivElement | null>, follow: boolean) {
  const input = useRef<DragInput>({
    dragging: false,
    rot: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    lastRelease: -Infinity,
  });
  const [grabbing, setGrabbing] = useState(false);
  const [touched, setTouched] = useState(false);

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
      if (!s.dragging) return;
      const now = performance.now();
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const dt = Math.max(now - last.t, 1);
      s.rot.y += dx * 0.5;
      s.rot.x = Math.min(80, Math.max(-80, s.rot.x + dy * 0.4));
      s.vel.y = (dx * 0.5 * 16) / dt;
      s.vel.x = (dy * 0.4 * 16) / dt;
      last = { x: e.clientX, y: e.clientY, t: now };
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
  }, [wrapRef, follow]);

  return { input, grabbing, touched };
}

// Met en pause le rendu quand la scène n'est pas à l'écran.
export function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

// Fait tourner ses enfants : pose de repos + rotation du visiteur + léger flottement.
export function Rig({
  input,
  pose,
  float = true,
  amplitude = 1,
  children,
}: {
  input: RefObject<DragInput>;
  pose: Pose;
  float?: boolean;
  /** Ampleur du flottement (1 = normal, plus petit = plus stable). */
  amplitude?: number;
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
      // Retour en douceur à la pose de repos, par le chemin le plus court.
      if (now - s.lastRelease > RETURN_DELAY && Math.abs(s.vel.y) < 0.2) {
        s.rot.y += shortest(-s.rot.y) * 0.05 * k;
        s.rot.x += -s.rot.x * 0.05 * k;
      }
    }

    const settled = !s.dragging && now - s.lastRelease > RETURN_DELAY;
    look.current.x += ((settled ? s.look.x : 0) - look.current.x) * 0.06 * k;
    look.current.y += ((settled ? s.look.y : 0) - look.current.y) * 0.06 * k;

    const t = state.clock.elapsedTime;
    const moving = float && !reduced.current;
    const bob = moving ? Math.sin(t * 0.9) * amplitude : 0;
    const sway = moving && settled ? Math.sin(t * 0.6) * 2.5 * amplitude : 0;

    g.rotation.set(
      (pose.x + s.rot.x + look.current.x + bob * 1.2) * DEG,
      (pose.y + s.rot.y + look.current.y + sway) * DEG,
      pose.z * DEG,
    );
    g.position.y = bob * 0.18;
  });

  return <group ref={group}>{children}</group>;
}

// Moteur CSS 3D de three.js : un seul par scène, il affiche toutes les interfaces posées sur des écrans.
// Le calque des interfaces passe SOUS l'image 3D : chaque écran y est visible à travers une « fenêtre »
// découpée dans l'image (voir ScreenAnchor). Ce qui se trouve devant l'écran (coque, capot, clavier)
// le cache donc naturellement, quel que soit l'angle.
export function CssLayer() {
  const { scene, camera, size, gl } = useThree();
  const renderer = useMemo(() => {
    const r = new CSS3DRenderer();
    Object.assign(r.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    return r;
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    Object.assign(canvas.style, { position: "relative", zIndex: "1" });
    renderer.domElement.style.zIndex = "0";
    canvas.parentElement?.insertBefore(renderer.domElement, canvas);
    return () => renderer.domElement.remove();
  }, [gl, renderer]);

  useEffect(() => renderer.setSize(size.width, size.height), [renderer, size]);
  // Rendu en dernier (priorité 1), une fois toutes les animations de l'image appliquées : l'image 3D et
  // les interfaces sont dessinées avec exactement la même position. Sinon l'interface avait une image
  // de retard et ses coins tremblaient autour de la fenêtre pendant les mouvements.
  useFrame(() => {
    gl.render(scene, camera);
    renderer.render(scene, camera);
  }, 1);
  return null;
}

// Élément DOM qui portera l'interface d'un écran (rempli via un portail React côté page).
export function createScreenElement(width: number, height: number) {
  const div = document.createElement("div");
  div.style.width = `${width}px`;
  div.style.height = `${height}px`;
  div.style.pointerEvents = "none";
  return div;
}

// Matériau de la fenêtre : écrit un pixel totalement transparent, sans mélange, là où se trouve l'écran.
const HOLE = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: false, opacity: 0, blending: THREE.NoBlending });

// Accroche un élément DOM sur une surface de la scène. `scale` : taille d'un pixel CSS en unités 3D,
// `radius` : arrondi des coins de l'écran, en pixels CSS.
// L'élément est masqué dès que la surface ne fait plus face à la caméra (ou que l'appareil est caché).
export function ScreenAnchor({ el, scale, position, radius = 0 }: { el: HTMLDivElement; scale: number; position: [number, number, number]; radius?: number }) {
  // Fenêtre découpée dans l'image 3D, un peu plus petite que l'interface pour ne jamais laisser voir de liseré.
  const hole = useMemo(() => {
    const w = (parseFloat(el.style.width) - 3) * scale;
    const h = (parseFloat(el.style.height) - 3) * scale;
    return new THREE.ShapeGeometry(roundedRect(w, h, Math.min(Math.max(radius - 1.5, 0) * scale, w / 2, h / 2)), 24);
  }, [el, scale, radius]);
  const { camera } = useThree();
  const anchor = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ n: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), []);

  useEffect(() => {
    const a = anchor.current;
    if (!a) return;
    const obj = new CSS3DObject(el);
    obj.scale.setScalar(scale);
    a.add(obj);
    return () => {
      a.remove(obj);
    };
  }, [el, scale]);

  useFrame(() => {
    const a = anchor.current;
    if (!a) return;
    a.getWorldPosition(tmp.p);
    a.getWorldQuaternion(tmp.q);
    a.getWorldScale(tmp.s);
    tmp.n.set(0, 0, 1).applyQuaternion(tmp.q);
    const facing = tmp.n.dot(camera.position.clone().sub(tmp.p)) > 0;
    let visibleChain = true;
    for (let o: THREE.Object3D | null = a; o; o = o.parent) if (!o.visible) visibleChain = false;
    const shown = facing && tmp.s.x > 0.02 && visibleChain;
    const vis = shown ? "visible" : "hidden";
    if (el.style.visibility !== vis) el.style.visibility = vis;
  });

  return (
    <group ref={anchor} position={position}>
      <mesh geometry={hole} material={HOLE} />
    </group>
  );
}
