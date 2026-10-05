import { SixMark } from "../components/brand/Logos";
import { ButtonLink } from "../components/ui/Button";

export function NotFoundPage() {
  return (
    <div
      className="container"
      style={{
        minHeight: "70vh",
        display: "grid",
        placeContent: "center",
        justifyItems: "center",
        textAlign: "center",
        gap: 20,
        paddingTop: 72,
      }}
    >
      <SixMark size={64} />
      <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)" }}>Cette page n'existe pas.</h1>
      <ButtonLink href="/">Retour à l'accueil</ButtonLink>
    </div>
  );
}
