import type { AnchorHTMLAttributes } from "react";
import { Link } from "react-router";
import styles from "./Button.module.css";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: "primary" | "secondary" | "light" | "outlineDark";
  size?: "md" | "sm";
};

// Lien en forme de bouton. Les chemins internes ("/...") passent par le routeur, sans recharger la page.
export function ButtonLink({ variant = "primary", size = "md", className, href, ...rest }: Props) {
  const classes = [styles.btn, styles[variant], size === "sm" && styles.sm, className].filter(Boolean).join(" ");
  if (href.startsWith("/")) return <Link to={href} className={classes} {...rest} />;
  return <a href={href} className={classes} {...rest} />;
}
