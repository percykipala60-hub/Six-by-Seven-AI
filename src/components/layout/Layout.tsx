import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { MobileCta } from "./MobileCta";
import { WaveField } from "../ui/WaveField";

// Fait défiler jusqu'à l'ancre (/#comment) ou en haut de page à chaque navigation.
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
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
