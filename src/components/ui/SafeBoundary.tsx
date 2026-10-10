import { Component, type ReactNode } from "react";

// Garde-fou : si ce qu'il entoure plante (la 3D surtout), seule cette partie est remplacée par `fallback`.
// Sans lui, une seule erreur effaçait toute la page.
type Props = { fallback: ReactNode; children: ReactNode };

export class SafeBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("Partie de la page désactivée après une erreur :", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
