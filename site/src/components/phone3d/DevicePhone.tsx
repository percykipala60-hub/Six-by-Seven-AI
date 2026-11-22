import { lazy, Suspense, useState } from "react";
import { canRender3D } from "./canRender3D";
import { SafeBoundary } from "../ui/SafeBoundary";
import { RealPhone } from "../phone/RealPhone";
import type { Phone3DProps } from "./Phone3D";

const Phone3D = lazy(() => import("./Phone3D"));

// Téléphone 3D (WebGL) chargé après la page ; la version CSS s'affiche en attendant,
// et reste en place si le navigateur ne gère pas la 3D.
export function DevicePhone(props: Phone3DProps) {
  const [webgl] = useState(canRender3D);
  const fallback = <RealPhone {...props} />;
  if (!webgl) return fallback;
  return (
    <SafeBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <Phone3D {...props} />
      </Suspense>
    </SafeBoundary>
  );
}
