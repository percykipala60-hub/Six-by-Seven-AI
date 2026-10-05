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
  /** Affiche la date de sortie tant qu'aucun lien n'est renseigné. */
  badge?: boolean;
  className?: string;
  onClick?: () => void;
};

// « Télécharger » mène à la page de choix de la plateforme.
// « Version web » ouvre l'application en ligne, ou la page de téléchargement tant qu'elle n'est pas publiée.
export function AppButton({ kind, variant = "primary", size = "md", long = false, badge = true, className, onClick }: Props) {
  const copy = app[kind];
  const isWeb = kind === "web";
  const ready = isWeb ? app.webUrl !== "" : app.platforms.some((p) => p.url !== "");
  const href = isWeb ? app.webUrl || `${app.downloadPage}#web` : app.downloadPage;
  const Icon = isWeb ? ArrowUpRight : Download;

  return (
    <ButtonLink
      href={href}
      variant={variant}
      size={size}
      className={className}
      onClick={onClick}
      {...(isWeb && ready ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      title={ready ? undefined : app.release}
    >
      {!isWeb && <Icon aria-hidden="true" />}
      {long ? copy.long : copy.short}
      {isWeb && <Icon aria-hidden="true" />}
      {!ready && badge && <span className={styles.soon}>{app.releaseShort}</span>}
    </ButtonLink>
  );
}
