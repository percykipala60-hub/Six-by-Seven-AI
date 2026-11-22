import { useCallback, useEffect, useRef, useState } from "react";

export type CopyStatus = "idle" | "copied" | "failed";

// Copie un texte dans le presse-papiers. Le statut revient à "idle" après `resetMs`.
export function useCopyToClipboard(resetMs = 1600) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      let next: CopyStatus = "copied";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        next = "failed";
      }
      setStatus(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus("idle"), resetMs);
      return next === "copied";
    },
    [resetMs],
  );

  return { status, copy };
}
