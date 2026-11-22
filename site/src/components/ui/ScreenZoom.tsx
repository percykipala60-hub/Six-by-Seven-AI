import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ZoomIn } from "lucide-react";
import styles from "./ScreenZoom.module.css";

type Props = {
  /** Téléphone (cadre noir arrondi, îlot ou trou de caméra) ou écran d'ordinateur. */
  kind: "phone" | "desktop";
  model?: "pro" | "ultra";
  /** Taille réelle de l'interface, en pixels CSS. */
  width: number;
  height: number;
  /** Ce qui est affiché à l'écran : le même contenu que sur l'appareil 3D. */
  children: ReactNode;
  className?: string;
};

// Loupe : affiche l'écran d'un appareil à plat et en grand, pour lire confortablement ce qui y est écrit.
// Fenêtre native (<dialog>) : Échap, clic à côté ou bouton pour fermer ; le focus reste dans la fenêtre.
export function ScreenZoom({ kind, model = "pro", width, height, children, className }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!open) return;
    // L'écran remplit la fenêtre sans déborder, sans dépasser deux fois sa taille réelle.
    const fit = () => setScale(Math.min((window.innerWidth - 32) / width, (window.innerHeight - 112) / height, kind === "phone" ? 2 : 1.6));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open, width, height, kind]);

  const show = () => {
    dialog.current?.showModal();
    setOpen(true);
  };

  return (
    <>
      <button type="button" className={[styles.trigger, className].filter(Boolean).join(" ")} onClick={show}>
        <ZoomIn size={16} aria-hidden="true" />
        Agrandir l'écran
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label="Écran agrandi"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="Fermer">
          <X size={22} />
        </button>
        {open && (
          <div className={styles.frame} data-kind={kind} style={{ width: width * scale, height: height * scale }}>
            <div className={styles.screen} data-kind={kind} style={{ width, height, transform: `scale(${scale})` }}>
              {children}
              {kind === "phone" && <i className={styles.camera} data-model={model} aria-hidden="true" />}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
