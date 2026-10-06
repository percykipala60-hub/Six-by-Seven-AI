import { ArrowUpRight } from "lucide-react";
import { beta } from "../../content/site";
import { ButtonLink } from "./Button";

type Props = {
  variant?: "primary" | "secondary";
  size?: "md" | "sm";
  /** « Essayer la bêta web » (long) ou « Bêta web » (court). */
  long?: boolean;
  className?: string;
  onClick?: () => void;
};

// Bouton vers la bêta web. Tant que l'adresse n'est pas renseignée, il mène à l'encart bêta de la page Télécharger.
export function BetaButton({ variant = "primary", size = "md", long = true, className, onClick }: Props) {
  return (
    <ButtonLink
      href={beta.url || "/telecharger#beta"}
      variant={variant}
      size={size}
      className={className}
      onClick={onClick}
      {...(beta.url ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {long ? beta.label : beta.short}
      <ArrowUpRight aria-hidden="true" />
    </ButtonLink>
  );
}
