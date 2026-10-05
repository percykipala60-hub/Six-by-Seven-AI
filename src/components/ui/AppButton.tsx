import { ArrowUpRight, Download } from "lucide-react";
import { app } from "../../content/site";
import { ButtonLink } from "./Button";
import styles from "./AppButton.module.css";

type Props = {
  kind: "download" | "web";
  variant?: "primary" | "secondary" | "light" | "outlineDark";
  size?: "md" | "sm";
  /** Libellé court (« Télécharger ») ou long (« Télécharger l'application »). */
  long?: boolean;
  /** Affiche la date de sortie tant que le lien n'est pas renseigné. */
  badge?: boolean;
  className?: string;
  onClick?: () => void;
};

// Bouton « Télécharger » ou « Version web ». Tant que le lien n'est pas renseigné,
// il mène à la section de téléchargement et affiche la date de sortie.
export function AppButton({ kind, variant = "primary", size = "md", long = false, badge = true, className, onClick }: Props) {
  const url = kind === "download" ? app.downloadUrl : app.webUrl;
  const copy = app[kind];
  const ready = url !== "";
  const Icon = kind === "download" ? Download : ArrowUpRight;

  return (
    <ButtonLink
      href={ready ? url : `/#${app.sectionId}`}
      variant={variant}
      size={size}
      className={className}
      onClick={onClick}
      {...(ready && kind === "web" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      title={ready ? undefined : app.release}
    >
      {kind === "download" && <Icon aria-hidden="true" />}
      {long ? copy.long : copy.short}
      {kind === "web" && <Icon aria-hidden="true" />}
      {!ready && badge && <span className={styles.soon}>{app.releaseShort}</span>}
    </ButtonLink>
  );
}
