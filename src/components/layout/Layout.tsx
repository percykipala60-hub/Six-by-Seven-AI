import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { MobileCta } from "./MobileCta";
import { WaveField } from "../ui/WaveField";
import { restoreScrollAfterLanguage } from "../../i18n/autoTranslate";

// Fait défiler jusqu'à l'ancre (/#comment) ou en haut de page à chaque navigation.
// À l'ouverture de la page, on ne force pas le haut : après un changement de langue, on revient où
// l'on était ; après un simple rechargement, le navigateur remet lui-même la page où elle était.
function ScrollManager() {
  const { pathname, hash } = useLocation();
  // Adresse affichée précédemment (null à l'ouverture de la page).
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const previous = shown.current;
    const key = pathname + hash;
    if (previous === key) return; // même page (double passage en développement)
    shown.current = key;
    if (previous === null) {
      // Ouverture de la page. Après un changement de langue, on revient où l'on était. Lors d'un
      // rechargement (y compris ceux que Safari fait tout seul), on ne saute pas à l'ancre de l'adresse
      // (#comment menait à « Colle la discussion ») : le navigateur remet la page où elle était.
      if (restoreScrollAfterLanguage()) return;
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav?.type === "reload" || nav?.type === "back_forward") return;
    }
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    if (previous === null) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function Layout() {
  return (
    <>
      <ScrollManager />
      {/* Vagues bleues façon PS4 en fond de tout le site, sur toutes les pages. */}
      <WaveField fixed />
      <Nav />
      <main>
        <Outlet />
      </main>
      <Footer />
      <MobileCta />
    </>
  );
}
