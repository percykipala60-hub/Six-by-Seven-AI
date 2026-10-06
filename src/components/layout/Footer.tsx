import { Link } from "react-router";
import { footer, socials, type SocialId } from "../../content/site";
import { SixLogo } from "../brand/Logos";
import { APP_PATHS, SOCIAL_PATHS } from "../phone3d/brandLogos";
import styles from "./Footer.module.css";

// Logos officiels des réseaux, en aplat.
const SOCIAL_LOGO: Record<SocialId, string> = {
  whatsapp: APP_PATHS.whatsapp,
  instagram: APP_PATHS.instagram,
  tiktok: SOCIAL_PATHS.tiktok,
  facebook: SOCIAL_PATHS.facebook,
  linkedin: SOCIAL_PATHS.linkedin,
};

// Lien interne (routeur) ou externe (nouvel onglet).
function FooterLink({ href, label }: { href: string; label: string }) {
  if (href.startsWith("http"))
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    );
  return <Link to={href}>{label}</Link>;
}

// Pied de page en colonnes séparées par des filets, puis une barre légale avec les réseaux.
export function Footer() {
  return (
    <footer className={styles.footer}>
      <nav className={`container ${styles.columns}`} aria-label="Plan du site">
        {footer.columns.map((col) => (
          <div key={col.title} className={styles.column}>
            <h2 className={styles.colTitle}>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.href}>
                  <FooterLink {...l} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`container ${styles.copyright}`}>
        <SixLogo size={26} />
        <p>{footer.copyright}</p>
      </div>

      <div className={styles.bar}>
        <div className={`container ${styles.barInner}`}>
          <ul className={styles.legal}>
            <li className={styles.locale}>{footer.locale}</li>
            {footer.legal.map((l) => (
              <li key={l.href}>
                <Link to={l.href}>{l.label}</Link>
              </li>
            ))}
          </ul>
          <div className={styles.follow}>
            <span>{footer.follow}</span>
            <ul aria-label="Réseaux sociaux">
              {socials.map((s) => (
                <li key={s.id}>
                  {s.href ? (
                    <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d={SOCIAL_LOGO[s.id]} />
                      </svg>
                    </a>
                  ) : (
                    <span className={styles.soon} aria-label={`${s.name} (${footer.soon})`} title={`${s.name} · ${footer.soon}`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d={SOCIAL_LOGO[s.id]} />
                      </svg>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
