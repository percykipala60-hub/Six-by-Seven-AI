import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { roundedRect } from "./geometry";

// Outils de modélisation : creuser de vrais trous dans un volume (ports, grilles, logements de touches)
// et transformer un tracé SVG en surface 3D (logos).

const KEEP = new THREE.MeshBasicMaterial();
const CUT = new THREE.MeshBasicMaterial();

function prepare(g: THREE.BufferGeometry) {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(out.attributes)) if (name !== "position" && name !== "normal") out.deleteAttribute(name);
  out.clearGroups();
  return out;
}

/**
 * Retire les volumes `cutters` du volume `base`. La géométrie obtenue a deux groupes :
 * 0 pour la surface d'origine, 1 pour les parois des trous (à rendre avec un matériau sombre).
 * `shaped` : volumes retirés dont les parois gardent la matière d'origine (un creux façonné dans le métal,
 * comme l'encoche d'ouverture d'un ordinateur).
 */
export function carve(base: THREE.BufferGeometry, cutters: THREE.BufferGeometry[], shaped: THREE.BufferGeometry[] = []) {
  if (shaped.length > 0) {
    const evaluator = new Evaluator();
    evaluator.attributes = ["position", "normal"];
    evaluator.useGroups = false;
    const res = evaluator.evaluate(new Brush(prepare(base), KEEP), new Brush(mergeGeometries(shaped.map(prepare))!, KEEP), SUBTRACTION);
    base = res.geometry;
  }
  if (cutters.length === 0) {
    const g = prepare(base);
    g.addGroup(0, Infinity, 0);
    return g;
  }
  const a = new Brush(prepare(base), KEEP);
  const b = new Brush(mergeGeometries(cutters.map(prepare))!, CUT);
  a.updateMatrixWorld();
  b.updateMatrixWorld();
  const evaluator = new Evaluator();
  evaluator.attributes = ["position", "normal"];
  evaluator.useGroups = true;
  const result = evaluator.evaluate(a, b, SUBTRACTION);
  const geometry = result.geometry;
  const mats = result.material as THREE.Material[];
  for (const group of geometry.groups) group.materialIndex = mats[group.materialIndex ?? 0] === CUT ? 1 : 0;
  return geometry;
}

/** Volume plein prêt à l'affichage avec la même paire de matériaux qu'un volume creusé (tout dans le groupe 0). */
export function solid(g: THREE.BufferGeometry) {
  const out = prepare(g);
  out.addGroup(0, Infinity, 0);
  return out;
}

/** Prisme à section de rectangle arrondi (largeur selon x, hauteur selon y), centré, d'axe z. */
export function roundedPrism(w: number, h: number, r: number, depth: number, curve = 10) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, h, Math.min(r, w / 2, h / 2)), { depth, bevelEnabled: false, curveSegments: curve });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Cylindre d'axe z, centré. */
export function zCylinder(r: number, depth: number, segments = 24) {
  return new THREE.CylinderGeometry(r, r, depth, segments).rotateX(Math.PI / 2);
}

/**
 * Logo à partir d'un tracé SVG (cadre 24 × 24) : surface plane dans le plan xy, centrée,
 * à la hauteur `height` (ou à la largeur `width`), face vers +z. `depth` > 0 donne un léger relief.
 */
export function logoGeometry(path: string, size: { height?: number; width?: number }, depth = 0) {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}"/></svg>`);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  const g = depth > 0 ? new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 24 }) : new THREE.ShapeGeometry(shapes, 24);
  // Le SVG a l'axe y vers le bas : on le retourne.
  g.scale(1, -1, 1);
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const bw = box.max.x - box.min.x;
  const bh = box.max.y - box.min.y;
  const s = size.height ? size.height / bh : (size.width ?? 1) / bw;
  g.translate(-(box.min.x + bw / 2), -(box.min.y + bh / 2), depth > 0 ? -depth : 0);
  g.scale(s, s, 1);
  // Le retournement inverse l'ordre des sommets : on rétablit les normales vers +z.
  const index = g.index;
  if (!index) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      const tmp = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)];
      pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
      pos.setXYZ(i + 2, tmp[0], tmp[1], tmp[2]);
    }
  } else {
    const arr = index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) [arr[i + 1], arr[i + 2]] = [arr[i + 2], arr[i + 1]];
    index.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

// --- Calcul en arrière-plan -------------------------------------------------------------------

type Pending = { resolve: (g: THREE.BufferGeometry) => void };
let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();
const cache = new Map<string, Promise<THREE.BufferGeometry>>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./carve.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<import("./carve.worker").CarveResponse>) => {
      const { id, position, normal, groups } = e.data;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(position, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
      for (const gr of groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      pending.get(id)?.resolve(g);
      pending.delete(id);
    };
  }
  return worker;
}

const raw = (g: THREE.BufferGeometry) => {
  const p = prepare(g);
  return { position: p.attributes.position.array as Float32Array, normal: p.attributes.normal.array as Float32Array };
};

/** Creuse dans un fil séparé ; le résultat est mis en cache par `key` (un même appareil n'est calculé qu'une fois). */
type Build = () => { base: THREE.BufferGeometry; cutters: THREE.BufferGeometry[]; shaped?: THREE.BufferGeometry[] };

export function carveAsync(key: string, build: Build) {
  let job = cache.get(key);
  if (!job) {
    job = new Promise<THREE.BufferGeometry>((resolve) => {
      const { base, cutters, shaped = [] } = build();
      const id = nextId++;
      pending.set(id, { resolve });
      const b = raw(base);
      const c = cutters.map(raw);
      const sh = shaped.map(raw);
      const buffers = [b, ...c, ...sh].flatMap((x) => [x.position.buffer, x.normal.buffer]);
      getWorker().postMessage({ id, base: b, cutters: c, shaped: sh }, buffers);
    });
    cache.set(key, job);
  }
  return job;
}

/**
 * Volume creusé pour l'affichage : le maillage montre d'abord le volume plein, puis reçoit la version
 * percée dès qu'elle est prête (`onReady` : demander une nouvelle image). Renvoie de quoi annuler.
 */
export function carveInto(mesh: THREE.Mesh, key: string, build: Build, onReady?: () => void) {
  let alive = true;
  carveAsync(key, build).then((g) => {
    if (!alive) return;
    mesh.geometry = g;
    onReady?.();
  });
  return () => {
    alive = false;
  };
}
