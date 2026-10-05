import { lazy, Suspense, useState } from "react";
import { RealPhone } from "../phone/RealPhone";
import type { Phone3DProps } from "./Phone3D";

const Phone3D = lazy(() => import("./Phone3D"));

const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

// Téléphone 3D (WebGL) chargé après la page ; la version CSS s'affiche en attendant,
// et reste en place si le navigateur ne gère pas la 3D.
export function DevicePhone(props: Phone3DProps) {
  const [webgl] = useState(hasWebGL);
  const fallback = <RealPhone {...props} />;
  if (!webgl) return fallback;
  return (
    <Suspense fallback={fallback}>
      <Phone3D {...props} />
    </Suspense>
  );
}
