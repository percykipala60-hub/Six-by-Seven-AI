import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { app } from "../../content/site";
import { AppButton } from "../ui/AppButton";
import styles from "./MobileCta.module.css";

// Sur téléphone, une fois le haut de l'accueil passé : le bouton « Télécharger » reste sous le pouce.
// La barre s'efface quand la section de téléchargement ou le pied de page sont à l'écran.
export function MobileCta() {
  const { pathname } = useLocation();
  const [past, setPast] = useState(false);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (pathname !== "/") return;
    const onScroll = () => setPast(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    // Masquée aussi pendant la visite animée : ses légendes et ses boutons occupent déjà le bas de l'écran.
    const targets = [document.querySelector("[data-experience]"), document.getElementById(app.sectionId), document.querySelector("footer")].filter(
      Boolean,
    ) as Element[];
    const seen = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target));
      setCovered(seen.size > 0);
    });
    targets.forEach((t) => io.observe(t));
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [pathname]);

  if (pathname !== "/") return null;
  const shown = past && !covered;
  return (
    <div className={styles.bar} data-shown={shown || undefined} aria-hidden={!shown} inert={!shown}>
      <AppButton kind="download" long className={styles.btn} />
    </div>
  );
}
