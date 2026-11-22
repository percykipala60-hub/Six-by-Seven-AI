import { Link } from "react-router";
import { SixMark } from "../components/brand/Logos";
import { ButtonLink } from "../components/ui/Button";
import { contact, notFound } from "../content/site";
import { usePageMeta } from "../hooks/usePageMeta";
import styles from "./NotFoundPage.module.css";

// Page introuvable : un mot d'explication, le retour à l'accueil, et les pages qu'on cherche le plus souvent.
export function NotFoundPage() {
  usePageMeta({ title: notFound.title, noindex: true });
  return (
    <div className={`container ${styles.page}`}>
      <SixMark size={56} />
      <p className={styles.code}>{notFound.code}</p>
      <h1>{notFound.title}</h1>
      <p className={styles.text}>{notFound.text}</p>
      <ButtonLink href="/">{notFound.home}</ButtonLink>
      <ul className={styles.links}>
        {notFound.links.map((l) => (
          <li key={l.href}>
            <Link to={l.href}>{l.label}</Link>
          </li>
        ))}
      </ul>
      <p className={styles.contact}>
        {notFound.contact} <a href={`mailto:${contact.email}`}>{contact.email}</a>
      </p>
    </div>
  );
}
