import { Link } from "react-router";
import { brand, footer, socials } from "../../content/site";
import { SevenMark, SixLogo } from "../brand/Logos";
import { SocialIcon } from "../brand/SocialIcon";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={`dark ${styles.footer}`}>
      <div className={`container ${styles.top}`}>
        <div className={styles.brand}>
          <SixLogo size={34} />
          <p>{brand.tagline}</p>
        </div>

        {footer.columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className={styles.colTitle}>{col.title}</h2>
            <ul>
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link to={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className={`container ${styles.bottom}`}>
        <div className={styles.company}>
          <SevenMark size={22} title="Seven.AI" />
          <span>{footer.copyright}</span>
        </div>
        <ul className={styles.socials} aria-label="Réseaux sociaux">
          {socials.map((s) => (
            <li key={s.id}>
              {s.href ? (
                <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                  <SocialIcon id={s.id} />
                </a>
              ) : (
                <span className={styles.soon} aria-label={`${s.name} (${footer.soon})`} title={`${s.name} · ${footer.soon}`}>
                  <SocialIcon id={s.id} />
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
