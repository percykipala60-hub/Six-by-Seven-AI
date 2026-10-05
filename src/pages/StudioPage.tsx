import { DevicePhone } from "../components/phone3d/DevicePhone";
import type { Finish, Model } from "../components/phone/RealPhone";

// Page temporaire de contrôle visuel : les dos de téléphone, de trois quarts, dans chaque coloris.
const combos: { model: Model; finish: Finish }[] = [
  { model: "pro", finish: "silver" },
  { model: "pro", finish: "orange" },
  { model: "pro", finish: "blue" },
  { model: "ultra", finish: "rose" },
];

export function StudioPage() {
  const params = new URLSearchParams(window.location.search);
  const angle = Number(params.get("y") ?? 160);
  const tilt = Number(params.get("x") ?? 4);
  const only = params.get("c");
  const shown = only === null ? combos : [combos[Number(only)]];
  return (
    <div className="dark" style={{ padding: "90px 24px 40px", display: "flex", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
      {shown.map((c) => (
        <DevicePhone key={c.model + c.finish} model={c.model} finish={c.finish} pose={{ x: tilt, y: angle, z: 0 }} follow={false} float={false}>
          <div style={{ position: "absolute", inset: 0, background: "#f5f6f9" }} />
        </DevicePhone>
      ))}
    </div>
  );
}
