import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import * as THREE from "three";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { roundedRect } from "./geometry";
import type { FrameState, Stage } from "./engine";
import { studioHdr } from "./studioHdr";

// Briques communes aux scènes 3D (téléphone seul, carrousel d'appareils).

// iPhone et iPad (tous les navigateurs y utilisent le moteur de Safari).
const IOS =
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

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
// Les boîtes à lumière sont toutes tournées vers l'appareil, au centre (comme les Lightformer de drei,
// qui ignoraient leur rotation : seule leur position compte).
const LIGHTFORMERS: { position: [number, number, number]; scale: [number, number, number]; intensity: number; ring?: boolean; color?: string }[] = [
  { position: [0, 6, 10], scale: [12, 2.5, 1], intensity: 3 },
  { position: [-10, 0, 4], scale: [16, 3, 1], intensity: 2.2 },
  { position: [10, 2, 2], scale: [16, 2, 1], intensity: 2.2 },
  { position: [0, 6, -10], scale: [12, 2.5, 1], intensity: 2.6 },
  { position: [-9, -2, -6], scale: [14, 3, 1], intensity: 1.8 },
  { position: [0, -7, -4], scale: [14, 3, 1], intensity: 1.4 },
  { position: [6, 8, -10], scale: [4, 4, 4], intensity: 1.2, ring: true, color: "#9db4ff" },
];

// Photo HDR décodée une seule fois, partagée par toutes les scènes.
let studioTexture: Promise<THREE.DataTexture> | null = null;
function loadStudioTexture() {
  studioTexture ??= new EXRLoader().loadAsync(studioHdr).then((t) => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    return t;
  });
  return studioTexture;
}

// Pose l'éclairage dans la scène ; la promesse se résout quand les reflets sont prêts (la scène n'est
// montrée qu'à ce moment-là, comme avant).
export async function addStudio(stage: Stage) {
  const { scene, renderer } = stage;
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(6, 10, 12);
  const back = new THREE.DirectionalLight(0xffffff, 0.9);
  back.position.set(-6, 8, -12);
  scene.add(key, back);

  // Reflets : la photo HDR en fond d'une petite scène, avec les boîtes à lumière, photographiée une fois
  // dans toutes les directions (cube de 256 px), puis utilisée comme environnement de la vraie scène.
  const hdr = await loadStudioTexture();
  const virtual = new THREE.Scene();
  virtual.background = hdr;
  for (const lf of LIGHTFORMERS) {
    const material = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide, color: lf.color ?? "white" });
    material.color.multiplyScalar(lf.intensity);
    const mesh = new THREE.Mesh(lf.ring ? new THREE.RingGeometry(0.25, 0.5, 64) : new THREE.PlaneGeometry(1, 1), material);
    mesh.position.set(...lf.position);
    mesh.scale.set(...lf.scale);
    virtual.add(mesh);
    mesh.lookAt(0, 0, 0);
  }
  const target = new THREE.WebGLCubeRenderTarget(256);
  target.texture.type = THREE.HalfFloatType;
  const cube = new THREE.CubeCamera(0.1, 1000, target);
  virtual.add(cube);
  const autoClear = renderer.autoClear;
  renderer.autoClear = true;
  cube.update(renderer, virtual);
  renderer.autoClear = autoClear;
  scene.environment = target.texture;
  scene.environmentIntensity = 0.9;
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
    // Au doigt, on attend de connaître la direction du geste avant de faire tourner :
    // un geste vertical fait défiler la page sans bouger le téléphone, un geste horizontal le fait
    // tourner sur lui-même (sans bascule avant/arrière, qui gênait le défilement).
    const SLOP = 8;
    let pending: { x: number; y: number; id: number } | null = null;
    let touch = false;

    const start = (e: PointerEvent) => {
      s.dragging = true;
      setGrabbing(true);
      setTouched(true);
      el.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      s.vel.x = s.vel.y = 0;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      touch = e.pointerType === "touch";
      if (touch) pending = { x: e.clientX, y: e.clientY, id: e.pointerId };
      else start(e);
    };
    const move = (e: PointerEvent) => {
      if (pending && e.pointerId === pending.id) {
        const ax = Math.abs(e.clientX - pending.x);
        const ay = Math.abs(e.clientY - pending.y);
        if (ay > SLOP && ay >= ax) pending = null; // défilement : on laisse faire la page
        else if (ax > SLOP) {
          pending = null;
          start(e);
        }
        return;
      }
      if (!s.dragging) return;
      const now = performance.now();
      const dx = e.clientX - last.x;
      const dy = touch ? 0 : e.clientY - last.y;
      const dt = Math.max(now - last.t, 1);
      s.rot.y += dx * 0.5;
      s.rot.x = Math.min(80, Math.max(-80, s.rot.x + dy * 0.4));
      s.vel.y = (dx * 0.5 * 16) / dt;
      s.vel.x = (dy * 0.4 * 16) / dt;
      last = { x: e.clientX, y: e.clientY, t: now };
    };
    const up = (e: PointerEvent) => {
      pending = null;
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
// `amplitude` : ampleur du flottement (1 = normal, plus petit = plus stable).
export function createRig(input: RefObject<DragInput>, pose: Pose, { float = true, amplitude = 1 } = {}) {
  const g = new THREE.Group();
  const look = { x: 0, y: 0 };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const frame = ({ delta, time }: FrameState) => {
    const s = input.current;
    if (!s) return;
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
    look.x += ((settled ? s.look.x : 0) - look.x) * 0.06 * k;
    look.y += ((settled ? s.look.y : 0) - look.y) * 0.06 * k;

    const t = time;
    const moving = float && !reduced;
    const bob = moving ? Math.sin(t * 0.9) * amplitude : 0;
    const sway = moving && settled ? Math.sin(t * 0.6) * 2.5 * amplitude : 0;

    g.rotation.set(
      (pose.x + s.rot.x + look.x + bob * 1.2) * DEG,
      (pose.y + s.rot.y + look.y + sway) * DEG,
      pose.z * DEG,
    );
    g.position.y = bob * 0.18;
  };

  return { group: g, frame };
}

// Marge de dessin : la zone 3D déborde de 20 % de chaque côté de son emplacement, sans changer la mise en page.
// Un appareil qui penche, flotte ou qu'on fait tourner n'est ainsi jamais coupé par les bords.
// La marge laisse passer les clics (pointer-events: none) ; le glisser reste géré par l'emplacement.
export const OVERSCAN = 0.2;
export const overscanStyle: CSSProperties = {
  position: "absolute",
  inset: `-${OVERSCAN * 100}%`,
  width: "auto",
  height: "auto",
  pointerEvents: "none",
};
// Champ de vision élargi d'autant : l'appareil garde exactement la même taille à l'écran.
export const overscanFov = (fov: number) => (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (1 + 2 * OVERSCAN)) * 180) / Math.PI;

// Moteur CSS 3D de three.js : un seul par scène, il affiche toutes les interfaces posées sur des écrans.
// Le calque des interfaces passe SOUS l'image 3D : chaque écran y est visible à travers une « fenêtre »
// découpée dans l'image (voir createScreenAnchor). Ce qui se trouve devant l'écran (coque, capot, clavier)
// le cache donc naturellement, quel que soit l'angle. Si le navigateur affiche les interfaces décalées
// (vu sur Safari, iPhone), createScreenAligner les remet en face de leur fenêtre.
export function addCssLayer(stage: Stage) {
  const css = stage.addCssLayer();
  const align = createScreenAligner();
  // Rendu en dernier (priorité 1), une fois toutes les animations de l'image appliquées : l'image 3D et
  // les interfaces sont dessinées avec exactement la même position. Sinon l'interface avait une image
  // de retard et ses coins tremblaient autour de la fenêtre pendant les mouvements.
  stage.onFrame(({ scene, camera }) => {
    stage.renderer.render(scene, camera);
    css.render(scene, camera);
    align(scene, camera, css, stage.renderer.domElement);
  }, 1);
}

// Recalage des interfaces sur l'image 3D. Sur certains téléphones (Safari, iPhone), le navigateur n'affiche
// pas les interfaces CSS 3D exactement là où la 3D les attend : l'image de l'écran apparaissait plus bas
// que sa fenêtre (bande en haut, bas de l'écran caché). De temps en temps, on compare donc la place
// réelle d'un écran (getBoundingClientRect) à celle calculée par la 3D, et on décale tout le calque des
// interfaces de l'écart mesuré. Là où tout est déjà aligné, l'écart est nul et rien ne bouge.
// Les anciennes versions de Safari (iPhone) affichaient ces interfaces environ 2 % trop bas ; on les
// remontait alors de 2,2 %. Les versions récentes les placent correctement : la remontée laissait une
// bande vide en bas de chaque écran (vidéo du 10 octobre 2026). Plus aucune correction sur iPhone.

export function createScreenAligner() {
  const corr = { x: 0, y: 0 };
  let last = -Infinity;
  let runs = 0;
  const v = new THREE.Vector3();
  return (scene: THREE.Scene, camera: THREE.Camera, css: CSS3DRenderer, canvas: HTMLCanvasElement) => {
    // Pas sur iPhone : Safari y place déjà les écrans correctement, mais sa mise en page ne reflète pas
    // leur position réelle ; le recalage les décalait à tort vers le bas (bande vide en haut).
    if (IOS) return;
    const now = performance.now();
    if (runs > 3 && now - last < 300) return;
    last = now;
    runs++;
    // Repère : l'écran visible le plus grand.
    let best: { el: HTMLElement; x0: number; y0: number; x1: number; y1: number } | null = null;
    let bestArea = 0;
    const box = canvas.getBoundingClientRect();
    scene.traverse((o) => {
      if (!(o instanceof CSS3DObject)) return;
      const obj = o;
      if (obj.element.style.visibility === "hidden") return;
      for (let p: THREE.Object3D | null = obj; p; p = p.parent) if (!p.visible) return;
      const w = parseFloat(obj.element.style.width) / 2;
      const h = parseFloat(obj.element.style.height) / 2;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [cx, cy] of [[-w, -h], [w, -h], [w, h], [-w, h]]) {
        v.set(cx, cy, 0).applyMatrix4(obj.matrixWorld).project(camera);
        if (v.z < -1 || v.z > 1) return; // coin derrière la caméra : mesure impossible
        const x = ((v.x + 1) / 2) * box.width;
        const y = ((1 - v.y) / 2) * box.height;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      const area = (x1 - x0) * (y1 - y0);
      if (area > bestArea && x1 - x0 > 20) {
        bestArea = area;
        best = { el: obj.element, x0, y0, x1, y1 };
      }
    });
    if (!best) return;
    const { el, x0, y0, x1, y1 } = best as { el: HTMLElement; x0: number; y0: number; x1: number; y1: number };
    const r = el.getBoundingClientRect();
    const ex = r.left - box.left + r.width / 2 - (x0 + x1) / 2;
    const ey = r.top - box.top + r.height / 2 - (y0 + y1) / 2;
    if (Math.abs(ex) > 200 || Math.abs(ey) > 200) return; // mesure aberrante
    if (Math.abs(ex) < 0.5 && Math.abs(ey) < 0.5) return;
    corr.x -= ex;
    corr.y -= ey;
    css.domElement.style.translate = `${corr.x.toFixed(1)}px ${corr.y.toFixed(1)}px`;
  };
}

// Élément DOM qui portera l'interface d'un écran (rempli via un portail React côté page).
export function createScreenElement(width: number, height: number) {
  const div = document.createElement("div");
  div.style.width = `${width}px`;
  div.style.height = `${height}px`;
  div.style.pointerEvents = "none";
  if (IOS) {
    // Safari (iPhone) redessinait toute l'interface à chaque changement de taille pendant les transitions :
    // l'écran clignotait (vide un instant) et les transitions saccadaient. Ainsi, il la garde prête et se
    // contente de la déplacer et de l'agrandir.
    div.style.willChange = "transform";
    div.style.backfaceVisibility = "hidden";
    div.style.setProperty("-webkit-backface-visibility", "hidden");
  }
  return div;
}

// Matériau de la fenêtre : écrit un pixel totalement transparent, sans mélange, là où se trouve l'écran.
const HOLE = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: false, opacity: 0, blending: THREE.NoBlending });

// Accroche un élément DOM sur une surface de la scène. `scale` : taille d'un pixel CSS en unités 3D,
// `radius` : arrondi des coins de l'écran, en pixels CSS.
// L'élément est masqué dès que la surface ne fait plus face à la caméra (ou que l'appareil est caché).
export function createScreenAnchor({ el, scale, position, radius = 0 }: { el: HTMLDivElement; scale: number; position: [number, number, number]; radius?: number }) {
  // Fenêtre découpée dans l'image 3D, un peu plus petite que l'interface pour ne jamais laisser voir de liseré.
  const w = (parseFloat(el.style.width) - 3) * scale;
  const h = (parseFloat(el.style.height) - 3) * scale;
  const hole = new THREE.ShapeGeometry(roundedRect(w, h, Math.min(Math.max(radius - 1.5, 0) * scale, w / 2, h / 2)), 24);
  const a = new THREE.Group();
  a.position.set(...position);
  const holeMesh = new THREE.Mesh(hole, HOLE);
  a.add(holeMesh);
  const obj = new CSS3DObject(el);
  obj.scale.setScalar(scale);
  a.add(obj);
  const tmp = { n: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3() };

  const frame = ({ camera }: FrameState) => {
    a.getWorldPosition(tmp.p);
    a.getWorldQuaternion(tmp.q);
    a.getWorldScale(tmp.s);
    tmp.n.set(0, 0, 1).applyQuaternion(tmp.q);
    // Vu presque par la tranche, l'interface (CSS) et l'appareil (WebGL) ne tombent plus pile l'un sur
    // l'autre. Au-delà d'environ 80°, on masque donc l'interface : on voit le verre de l'appareil.
    const facing = tmp.n.dot(tmp.v.copy(camera.position).sub(tmp.p).normalize()) > 0.17;
    let visibleChain = true;
    for (let o: THREE.Object3D | null = a; o; o = o.parent) if (!o.visible) visibleChain = false;
    const shown = facing && tmp.s.x > 0.02 && visibleChain;
    const vis = shown ? "visible" : "hidden";
    if (el.style.visibility !== vis) el.style.visibility = vis;
    holeMesh.visible = shown;
  };

  return { group: a, frame };
}
