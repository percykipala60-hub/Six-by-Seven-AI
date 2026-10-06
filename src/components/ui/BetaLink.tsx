import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { beta } from "../../content/site";
import styles from "./BetaLink.module.css";

type Props = { tone?: "light"; className?: string };

// Lien « Essayer la bêta » précédé de l'étiquette « Bêta ».
// Tant que l'adresse n'est pas renseignée, il mène à l'encart bêta de la page Télécharger.
export function BetaLink({ tone = "light", className }: Props) {
  const content = (
    <>
      <span className={styles.tag}>{beta.tag}</span>
      {beta.label}
      <ArrowUpRight size={15} aria-hidden="true" />
    </>
  );
  const classes = [styles.link, styles[tone], className].filter(Boolean).join(" ");
  if (beta.url) {
    return (
      <a className={classes} href={beta.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return (
    <Link className={classes} to="/telecharger#beta">
      {content}
    </Link>
  );
}
