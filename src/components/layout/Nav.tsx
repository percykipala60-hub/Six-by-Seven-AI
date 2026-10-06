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

  const close = () => setOpen(false);

  return (
    <header className={[styles.bar, overHero ? styles.top : styles.solid].join(" ")}>
      <div className={`container ${styles.inner}`}>
        <Link className={styles.logo} to="/" onClick={close}>
          <SixLogo size={30} />
        </Link>

        <nav className={styles.links} aria-label="Navigation principale">
          {nav.links.map((link) => (
            <Link key={link.href} to={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <AppButton kind="web" size="sm" variant="secondary" className={`${styles.cta} ${styles.ctaWeb}`} badge={false} />
          {!onDownloadPage && (
            <AppButton kind="download" size="sm" variant="primary" className={styles.cta} badge={false} />
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
            {!onDownloadPage && <AppButton kind="download" long onClick={close} />}
            <AppButton kind="web" long variant="secondary" onClick={close} />
          </div>
        </div>
      </nav>
    </header>
  );
}
