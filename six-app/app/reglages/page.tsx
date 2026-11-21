import { Suspense } from "react";
import { Settings } from "@/components/Settings";

export const metadata = { title: "Réglages — Six" };

export default function Page() {
  return (
    <div className="app">
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
    </div>
  );
}
