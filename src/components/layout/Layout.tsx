import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { MobileCta } from "./MobileCta";

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
      <Nav />
      <main>
        <Outlet />
      </main>
      <Footer />
      <MobileCta />
    </>
  );
}
