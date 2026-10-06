/// <reference lib="webworker" />
import * as THREE from "three";
import { carve } from "./carve";

// Calcul des trous hors du fil principal : la page reste fluide pendant que les volumes sont creusés.
type Raw = { position: Float32Array; normal: Float32Array };
export type CarveRequest = { id: number; base: Raw; cutters: Raw[]; shaped: Raw[] };
export type CarveResponse = { id: number; position: Float32Array; normal: Float32Array; groups: { start: number; count: number; materialIndex: number }[] };

const toGeometry = (raw: Raw) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(raw.position, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(raw.normal, 3));
  return g;
};

self.onmessage = (e: MessageEvent<CarveRequest>) => {
  const { id, base, cutters, shaped } = e.data;
  const result = carve(toGeometry(base), cutters.map(toGeometry), shaped.map(toGeometry));
  const position = result.attributes.position.array as Float32Array;
  const normal = result.attributes.normal.array as Float32Array;
  const groups = result.groups.map((g) => ({ start: g.start, count: g.count, materialIndex: g.materialIndex ?? 0 }));
  (self as unknown as Worker).postMessage({ id, position, normal, groups } satisfies CarveResponse, [position.buffer, normal.buffer]);
};
