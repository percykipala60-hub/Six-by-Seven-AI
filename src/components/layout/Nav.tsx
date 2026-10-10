import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import { app, nav } from "../../content/site";
import { SixLogo } from "../brand/Logos";
import { AppButton } from "../ui/AppButton";
import styles from "./Nav.module.css";

// Barre de navigation : transparente en haut de l'accueil, puis voilée de blanc au défilement.
export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const overHero = pathname === "/" && !scrolled && !open;
  // Sur la page de téléchargement, le bouton « Télécharger » ferait doublon : on le masque.
  const onDownloadPage = pathname === app.downloadPage;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Sur l'accueil, le lien de la section en cours de lecture est mis en évidence.
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (pathname !== "/") {
      setCurrent(null);
      return;
    }
    const ids = nav.links.map((l) => l.href.split("#")[1]).filter(Boolean);
    // Toutes les sections sont observées : dans une section sans lien (ex. la sortie), aucun lien n'est souligné.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(ids.includes(e.target.id) ? e.target.id : null);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    document.querySelectorAll("main section").forEach((el) => io.observe(el));
    const onTop = () => window.scrollY < window.innerHeight * 0.5 && setCurrent(null);
    window.addEventListener("scroll", onTop, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onTop);
    };
  }, [pathname]);

  const close = () => setOpen(false);

  return (
    <header className={[styles.bar, overHero ? styles.top : styles.solid].join(" ")}>
      <div className={`container ${styles.inner}`}>
        <Link className={styles.logo} to="/" onClick={close}>
          <SixLogo size={30} />
        </Link>

        <nav className={styles.links} aria-label="Navigation principale">
          {nav.links.map((link) => (
            <Link key={link.href} to={link.href} aria-current={current === link.href.split("#")[1] ? "location" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <AppButton kind="web" size="sm" variant="secondary" className={`${styles.cta} ${styles.ctaWeb}`} />
          {!onDownloadPage && (
            <AppButton kind="download" size="sm" variant="primary" className={styles.cta} />
          )}
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <nav id="menu-mobile" className={styles.mobile} hidden={!open} aria-label="Navigation mobile">
        <div className="container">
          {nav.links.map((link) => (
            <Link key={link.href} to={link.href} onClick={close}>
              {link.label}
            </Link>
          ))}
          <div className={styles.mobileCtas}>
            <AppButton kind="web" onClick={close} />
            {!onDownloadPage && <AppButton kind="download" long variant="secondary" onClick={close} />}
          </div>
        </div>
      </nav>
    </header>
  );
}
