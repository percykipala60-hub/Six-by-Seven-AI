import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { scenes } from "../content/phoneScenes";
import { PhoneModel } from "../components/phone3d/PhoneModel";
import { LaptopModel, LAPTOP_SCREEN_PX, LAPTOP_SPECS, type LaptopKind } from "../components/phone3d/LaptopModel";
import { SPECS } from "../components/phone3d/geometry";
import { PHONE_SCREEN_PX, PhoneScreen, phonePxScale, phoneScreenRadiusPx } from "../components/phone3d/Phone3D";
import { DEG, ScreenAnchor, Studio, createScreenElement } from "../components/phone3d/stage";
import { AppChat, SixScreen } from "../components/phone/Screens";
import { DesktopScreen } from "../components/phone/DesktopScreen";
import type { Model } from "../components/phone/RealPhone";
import { T, isTouchDevice, layout, mix, range, smooth, timeline, useTimeline } from "./timeline";
import { coveredAt } from "./overlays";

export type PhoneId = "ios" | "android";
export type LaptopId = LaptopKind;
type DeviceId = PhoneId | LaptopId;

// Les quatre appareils sur le cercle, dans l'ordre : téléphone, ordinateur, téléphone, ordinateur.
const ORDER: DeviceId[] = ["ios", "mac", "android", "windows"];
const ANGLE: Record<DeviceId, number> = { ios: 0, mac: Math.PI / 2, android: Math.PI, windows: (3 * Math.PI) / 2 };
const MODEL: Record<PhoneId, Model> = { ios: "pro", android: "ultra" };
const isPhone = (id: DeviceId): id is PhoneId => id === "ios" || id === "android";

// Taille à l'écran : téléphones de 12,5 cm, ordinateurs de 16 cm de large (proportions harmonieuses sur le cercle).
const PHONE_H = 12.5;
const LAPTOP_W = 16;
const SCALE: Record<DeviceId, number> = {
  ios: PHONE_H / SPECS.pro.h,
  android: PHONE_H / SPECS.ultra.h,
  mac: LAPTOP_W / LAPTOP_SPECS.mac.w,
  windows: LAPTOP_W / LAPTOP_SPECS.windows.w,
};
// Pose de trois quarts quand l'appareil s'avance : on garde le profil, la caméra vient à lui.
const HERO_YAW: Record<DeviceId, number> = { ios: -24 * DEG, android: -24 * DEG, mac: -20 * DEG, windows: -20 * DEG };
const LID_ANGLE = 112;

// Zone de l'écran où plonge la caméra (pixels de l'interface, depuis le centre) :
// le centre de l'écran sur téléphone, le panneau principal de l'appli sur ordinateur.
const DIVE_PX: Record<DeviceId, { x: number; y: number; w: number; h: number }> = {
  ios: { x: 0, y: 40, w: PHONE_SCREEN_PX.w, h: PHONE_SCREEN_PX.h * 0.7 },
  android: { x: 0, y: 40, w: PHONE_SCREEN_PX.w, h: PHONE_SCREEN_PX.h * 0.7 },
  mac: { x: 125, y: 10, w: 560, h: 400 },
  windows: { x: 125, y: 10, w: 560, h: 420 },
};

type Shot = { pos: THREE.Vector3; target: THREE.Vector3 };

export default function ExperienceScene({ phone, laptop }: { phone: PhoneId; laptop: LaptopId }) {
  const els = useMemo(
    () => ({
      ios: createScreenElement(PHONE_SCREEN_PX.w, PHONE_SCREEN_PX.h),
      android: createScreenElement(PHONE_SCREEN_PX.w, PHONE_SCREEN_PX.h),
      mac: createScreenElement(LAPTOP_SCREEN_PX.mac.w, LAPTOP_SCREEN_PX.mac.h),
      windows: createScreenElement(LAPTOP_SCREEN_PX.windows.w, LAPTOP_SCREEN_PX.windows.h),
    }),
    [],
  );
  const groups = useRef<Partial<Record<DeviceId, THREE.Group>>>({});
  // Sur téléphone : moins de pixels à calculer et pas d'anticrénelage (mémoire et fluidité).
  const [light] = useState(isTouchDevice);
  const markers = useRef<Partial<Record<DeviceId, THREE.Object3D>>>({});

  return (
    <>
      <Canvas
        // Sur téléphone, une image n'est calculée que lorsque la visite avance (voir Invalidator) :
        // à l'arrêt, la carte graphique se repose et tout le reste de la page reste fluide.
        frameloop={light ? "demand" : "always"}
        dpr={light ? [1, 1.25] : [1, 2]}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        camera={{ position: [0, 14, 90], fov: 35, near: 1, far: 500 }}
        gl={{ antialias: !light, alpha: true, toneMapping: THREE.NeutralToneMapping, powerPreference: "high-performance" }}
      >
        <Studio />
        <Layers />
        {light && <Invalidator />}
        <Director phone={phone} laptop={laptop} groups={groups} markers={markers} still={light} />
        {ORDER.map((id) => (
          <group key={id} ref={(g) => void (g ? (groups.current[id] = g) : delete groups.current[id])}>
            {isPhone(id) ? (
              <>
                <PhoneModel model={MODEL[id]} finish={id === "ios" ? "silver" : "violet"} />
                <ScreenAnchor
                  el={els[id]}
                  scale={phonePxScale(MODEL[id])}
                  radius={phoneScreenRadiusPx(MODEL[id])}
                  position={[0, 0, SPECS[MODEL[id]].d / 2 + 0.01]}
                />
                <DiveMarker id={id} markers={markers} />
              </>
            ) : (
              // Centre visuel de l'ordinateur ouvert ramené à l'origine du groupe.
              <group position={[0, -11, 4]}>
                <LaptopModel kind={id} screenEl={els[id]} lidAngle={LID_ANGLE} />
                <DiveMarker id={id} markers={markers} />
              </group>
            )}
          </group>
        ))}
      </Canvas>

      <ChosenPhoneScreen id={phone} el={els[phone]} />
      {createPortal(
        <PhoneScreen model={MODEL[phone === "ios" ? "android" : "ios"]}>
          <SixScreen scene={scenes[2]} step={3} />
        </PhoneScreen>,
        els[phone === "ios" ? "android" : "ios"],
      )}
      {(["mac", "windows"] as const).map((os) =>
        createPortal(<DesktopScreen key={os} os={os} width={LAPTOP_SCREEN_PX[os].w} height={LAPTOP_SCREEN_PX[os].h} />, els[os]),
      )}
    </>
  );
}

// Écran du téléphone choisi : la conversation, le message qui arrive, Six qui s'ouvre, puis la réponse envoyée.
function ChosenPhoneScreen({ id, el }: { id: PhoneId; el: HTMLDivElement }) {
  const phase = useTimeline((p) => (p < T.phoneMessage ? 0 : p < T.phoneOpenSix ? 1 : p < T.phoneExit[0] ? 2 : 3));
  const scene = scenes[0];
  let content: ReactNode;
  if (phase === 0) content = <AppChat scene={scene} showIncoming={false} />;
  else if (phase === 1) content = <AppChat scene={scene} showIncoming />;
  else if (phase === 2) content = <SixScreen scene={scene} step={0} />;
  else content = <AppChat scene={scene} showIncoming sent={scene.suggestions?.[scene.pick ?? 0]} />;
  return createPortal(<PhoneScreen model={MODEL[id]}>{content}</PhoneScreen>, el);
}

// Point visé par la caméra quand elle entre dans l'écran, posé sur la dalle (normale vers l'extérieur).
function DiveMarker({ id, markers }: { id: DeviceId; markers: RefObject<Partial<Record<DeviceId, THREE.Object3D>>> }) {
  const ref = (o: THREE.Object3D | null) => void (o ? (markers.current[id] = o) : delete markers.current[id]);
  const dive = DIVE_PX[id];
  if (isPhone(id)) {
    const s = phonePxScale(MODEL[id]);
    return <object3D ref={ref} position={[dive.x * s, -dive.y * s, SPECS[MODEL[id]].d / 2 + 0.01]} />;
  }
  const spec = LAPTOP_SPECS[id];
  const s = spec.disp.w / LAPTOP_SCREEN_PX[id].w;
  const tilt = (LID_ANGLE - 90) * DEG;
  // Même pivot que le capot dans LaptopModel : la charnière, à l'arrière de la base.
  return (
    <group position={[0, spec.h + 0.2, -spec.d / 2 + spec.hingeInset]} rotation={[-tilt, 0, 0]}>
      <object3D ref={ref} position={[dive.x * s, spec.disp.bottom + spec.disp.h / 2 - dive.y * s, 0.03]} />
    </group>
  );
}

// Image 3D puis interfaces (CSS 3D) dessinées ensemble à chaque image ; rien n'est dessiné
// quand un guide recouvre toute la scène.
function Layers() {
  const { scene, camera, size, gl } = useThree();
  const css = useMemo(() => {
    const r = new CSS3DRenderer();
    Object.assign(r.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0" });
    return r;
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    Object.assign(canvas.style, { position: "relative", zIndex: "1" });
    canvas.parentElement?.insertBefore(css.domElement, canvas);
    return () => css.domElement.remove();
  }, [gl, css]);
  useEffect(() => css.setSize(size.width, size.height), [css, size]);

  useFrame(() => {
    const covered = coveredAt(timeline.p);
    // Opacité (et non visibility) : les écrans posés sur les appareils règlent eux-mêmes leur
    // visibility et resteraient visibles à travers le fond transparent du guide.
    const op = covered ? "0" : "1";
    if (gl.domElement.style.opacity !== op) {
      gl.domElement.style.opacity = op;
      css.domElement.style.opacity = op;
    }
    if (covered) return;
    gl.render(scene, camera);
    css.render(scene, camera);
  }, 1);
  return null;
}

// Demande une nouvelle image à chaque mouvement de la ligne de temps (mode « à la demande »).
function Invalidator() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const redraw = () => invalidate();
    timeline.listeners.add(redraw);
    invalidate();
    return () => {
      timeline.listeners.delete(redraw);
    };
  }, [invalidate]);
  return null;
}

type DirectorProps = {
  /** Pas de balancement ni de flottement (téléphone : la scène ne bouge que quand on avance). */
  still?: boolean;
  phone: PhoneId;
  laptop: LaptopId;
  groups: RefObject<Partial<Record<DeviceId, THREE.Group>>>;
  markers: RefObject<Partial<Record<DeviceId, THREE.Object3D>>>;
};

// Mise en scène : rotation du cercle, appareil qui s'avance, et trajet de la caméra, tout dérivé du défilement.
function Director({ phone, laptop, groups, markers, still: calm = false }: DirectorProps) {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const tmp = useMemo(
    () => ({
      a: { pos: new THREE.Vector3(), target: new THREE.Vector3() } as Shot,
      b: { pos: new THREE.Vector3(), target: new THREE.Vector3() } as Shot,
      v: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      n: new THREE.Vector3(),
    }),
    [],
  );

  // Angles du cercle qui amènent le téléphone, puis l'ordinateur, face à la caméra.
  const thetaPhone = -ANGLE[phone];
  const thetaLaptop = thetaPhone + shortest(-ANGLE[laptop] - thetaPhone);

  const theta = useMemo(
    () =>
      keyframes([
        [0, thetaPhone + Math.PI * 1.5],
        [T.phoneFront[1], thetaPhone],
        [T.phoneExit[0] + 0.7, thetaPhone],
        [T.laptopFront[1], thetaLaptop],
        [T.laptopExit[0] + 0.7, thetaLaptop],
        [T.total, thetaLaptop - Math.PI],
      ]),
    [thetaPhone, thetaLaptop],
  );
  const focusPhone = useMemo(
    () => keyframes([[T.phoneFront[0], 0], [T.phoneFront[1], 1], [T.phoneExit[0] + 0.7, 1], [T.phoneExit[1], 0]]),
    [],
  );
  const focusLaptop = useMemo(
    () => keyframes([[T.laptopFront[0], 0], [T.laptopFront[1], 1], [T.laptopExit[0] + 0.7, 1], [T.laptopExit[1], 0]]),
    [],
  );

  useFrame((state) => {
    const p = timeline.p;
    const t = state.clock.elapsedTime;
    const aspect = size.width / Math.max(size.height, 1);
    const portrait = aspect < 0.9;
    const R = portrait ? 19 : 26;
    const tanH = Math.tan((cam.fov * DEG) / 2);

    // Petit balancement du cercle quand il est vu en entier (au début et à la fin).
    const idle = calm ? 0 : Math.max(1 - range(p, 0.4, 1.1), range(p, T.laptopExit[1] - 0.3, T.total));
    const th = theta(p) + Math.sin(t * 0.35) * 0.12 * idle;
    // Immobile pendant qu'on entre dans un écran (sinon l'image tremble à cette distance).
    const still = Math.max(
      range(p, T.phoneDive[0] - 0.4, T.phoneDive[0]) * (1 - range(p, T.phoneExit[0] + 0.3, T.phoneExit[1])),
      range(p, T.laptopDive[0] - 0.4, T.laptopDive[0]) * (1 - range(p, T.laptopExit[0] + 0.3, T.laptopExit[1])),
    );

    for (const id of ORDER) {
      const g = groups.current[id];
      if (!g) continue;
      const f = id === phone ? focusPhone(p) : id === laptop ? focusLaptop(p) : 0;
      const othersFocus = Math.max(focusPhone(p), focusLaptop(p)) * (f > 0 ? 0 : 1);
      const a = ANGLE[id] + th;
      const bob = calm ? 0 : Math.sin(t * 0.9 + ANGLE[id] * 2) * 0.35 * (1 - still);
      // Sur le cercle : position et orientation (les appareils restent un peu tournés vers nous).
      const ringX = Math.sin(a) * R;
      const ringZ = Math.cos(a) * R;
      // Orientation continue (sans saut quand l'appareil passe derrière le cercle).
      const ringYaw = Math.sin(a) * 0.6;
      // Celui qui s'avance sort du cercle vers la caméra ; les autres rapetissent jusqu'à disparaître,
      // pour laisser toute la place à l'appareil et aux légendes.
      const keep = 1 - smooth(othersFocus);
      g.visible = keep > 0.01;
      g.position.set(mix(ringX, 0, f), bob - othersFocus * 4, mix(ringZ, R + 6, f));
      g.rotation.set(mix(-6 * DEG, isPhone(id) ? -4 * DEG : 4 * DEG, f), mix(ringYaw, HERO_YAW[id], smooth(f)), isPhone(id) ? -1.5 * DEG * f : 0);
      g.scale.setScalar(SCALE[id] * Math.max(keep, 0.001));
    }
    // Pas de mise à jour de toutes les pièces des appareils ici (des milliers d'objets) : le repère
    // visé par la caméra met à jour sa seule chaîne de parents quand on lit sa position (getWorldPosition).

    // Plans de caméra.
    const ring = (out: Shot) => {
      const w = (2 * R + 34) * (portrait ? 0.52 : 1);
      // Au début, le texte d'accueil occupe le haut de l'écran (à la fin, la dernière légende) :
      // le cercle se range dans l'espace libre en dessous, au-dessus de l'invitation à défiler,
      // puis remonte et grandit quand le texte s'efface.
      const start = 1 - range(p, 0.6, 1.4);
      const end = range(p, T.laptopExit[1] - 0.6, T.laptopExit[1]);
      const textBottom = Math.max(start * Math.min(layout.introBottom + 0.02, 0.75), end * (portrait ? 0.3 : 0.24));
      const zoneBottom = 1 - (size.height > 680 || portrait ? 60 / size.height : 0.02) * start;
      const free = Math.max(zoneBottom - textBottom, 0.2);
      // Hauteur apparente du cercle : environ 44 unités, plus l'avant qui est plus proche.
      const dist = Math.max(w / (2 * tanH * aspect), 44 / (2 * tanH * free)) + R * 0.6;
      out.target.set(0, 0, 0);
      out.pos.set(0, 0.24, 1).normalize().multiplyScalar(dist);
      const center = textBottom + free / 2; // centre de l'espace libre, depuis le haut de l'écran
      const lift = 2 * dist * tanH * (center - 0.5);
      out.target.y += lift;
      out.pos.y += lift;
    };
    const hero = (id: DeviceId, out: Shot) => {
      const g = groups.current[id]!;
      const phoneish = isPhone(id);
      // Cadre : le téléphone occupe ~70 % de la hauteur, l'ordinateur la moitié de la largeur (un peu plus sur téléphone).
      // Sur téléphone, l'appareil tient entre la barre du haut du site et la légende du bas : il occupe
      // environ 60 % de la hauteur, centré vers 40 % depuis le haut (rien n'est caché sous la barre).
      const h = phoneish ? PHONE_H * (portrait ? 1.7 : 1.4) : LAPTOP_W * 1.15;
      const w = phoneish ? PHONE_H * 1.1 : LAPTOP_W / (portrait ? 0.74 : 0.46);
      const dist = Math.max(h / (2 * tanH), w / (2 * tanH * aspect));
      out.target.copy(g.position);
      // Légendes à gauche sur grand écran (l'appareil passe à droite), en bas sur téléphone (il monte).
      const visH = 2 * dist * tanH;
      if (portrait) out.target.y -= visH * 0.09;
      else out.target.x -= visH * aspect * (phoneish ? 0.17 : 0.235);
      out.pos.set(0, 0.16, 1).normalize().multiplyScalar(dist).add(out.target);
    };
    const dive = (id: DeviceId, out: Shot) => {
      const m = markers.current[id]!;
      const g = groups.current[id]!;
      m.getWorldPosition(out.target);
      m.getWorldQuaternion(tmp.q);
      tmp.n.set(0, 0, 1).applyQuaternion(tmp.q);
      const px = (isPhone(id) ? phonePxScale(MODEL[id]) : LAPTOP_SPECS[id].disp.w / LAPTOP_SCREEN_PX[id].w) * g.scale.x;
      const W = DIVE_PX[id].w * px;
      const H = DIVE_PX[id].h * px;
      // Assez près pour que la zone remplisse toute la fenêtre.
      const dist = Math.min(W / (2 * tanH * aspect), H / (2 * tanH)) * 0.8;
      out.pos.copy(tmp.n).multiplyScalar(dist).add(out.target);
    };

    type Key = [number, (o: Shot) => void, ((x: number) => number)?];
    const K: Key[] = [
      [0, ring],
      [T.phoneFront[0], ring],
      [T.phoneFront[1], (o) => hero(phone, o)],
      [T.phoneDive[0], (o) => hero(phone, o)],
      [T.phoneDive[1], (o) => dive(phone, o)],
      [T.phoneExit[0] + 0.25, (o) => dive(phone, o)],
      [T.phoneExit[0] + 0.75, (o) => hero(phone, o)],
      [T.phoneExit[1], ring],
      [T.laptopFront[0], ring],
      [T.laptopFront[1], (o) => hero(laptop, o)],
      [T.laptopDive[0], (o) => hero(laptop, o)],
      [T.laptopDive[1], (o) => dive(laptop, o)],
      [T.laptopExit[0] + 0.25, (o) => dive(laptop, o)],
      [T.laptopExit[0] + 0.75, (o) => hero(laptop, o)],
      [T.laptopExit[1], ring],
      [T.total, ring],
    ];
    let k = K.length - 2;
    for (let i = 0; i < K.length - 1; i++) {
      if (p < K[i + 1][0]) {
        k = i;
        break;
      }
    }
    const [p0, s0] = K[k];
    const [p1, s1, ease = smooth] = K[k + 1];
    s0(tmp.a);
    s1(tmp.b);
    const e = ease(range(p, p0, p1));
    cam.position.lerpVectors(tmp.a.pos, tmp.b.pos, e);
    tmp.v.lerpVectors(tmp.a.target, tmp.b.target, e);
    cam.lookAt(tmp.v);
    // Profondeur resserrée autour de ce qu'on regarde : pas de scintillement, même tout près de l'écran.
    const d = cam.position.distanceTo(tmp.v);
    cam.near = Math.min(Math.max(d * 0.25, 0.2), 10);
    cam.far = d + 160;
    cam.updateProjectionMatrix();
  });

  return null;
}

// Interpolation par paliers : valeur en fonction de p, adoucie entre deux paliers.
function keyframes(k: [number, number][]) {
  return (p: number) => {
    if (p <= k[0][0]) return k[0][1];
    for (let i = 0; i < k.length - 1; i++) {
      const [a, va] = k[i];
      const [b, vb] = k[i + 1];
      if (p <= b) return mix(va, vb, smooth(range(p, a, b)));
    }
    return k[k.length - 1][1];
  };
}

const TAU = Math.PI * 2;
// Angle ramené dans [-π, π].
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const shortest = wrap;
