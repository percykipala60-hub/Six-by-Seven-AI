import { lazy, Suspense, useState } from "react";
import { SixAppIcon } from "../brand/Logos";
import type { DeviceShowcaseProps } from "./DeviceShowcase3D";

const DeviceShowcase3D = lazy(() => import("./DeviceShowcase3D"));

const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

// Carrousel 3D chargé après la page ; l'icône de Six s'affiche en attendant
// (et reste en place si le navigateur ne gère pas la 3D).
export function DeviceShowcase(props: DeviceShowcaseProps) {
  const [webgl] = useState(hasWebGL);
  const fallback = (
    <div style={{ display: "grid", placeItems: "center", width: "100%", aspectRatio: "1.15" }}>
      <SixAppIcon size={120} />
    </div>
  );
  if (!webgl) return fallback;
  return (
    <Suspense fallback={fallback}>
      <DeviceShowcase3D {...props} />
    </Suspense>
  );
}
