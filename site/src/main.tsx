import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Les styles globaux passent en premier : les styles des composants peuvent ainsi les surcharger.
import "./styles/fonts.css";
import "./styles/global.css";
import { App } from "./App";
import { startAutoTranslate } from "./i18n/autoTranslate";
import { startChameleonTheme } from "./theme/chameleon";
import { startAnalytics } from "./analytics/analytics";

// Autre langue que le français choisie : Google Traduction traduit la page.
startAutoTranslate();
// Couleurs du site qui changent lentement avec le temps (voir theme/chameleon.ts).
startChameleonTheme();
// Mesure d'audience (Google Analytics), seulement avec l'accord du visiteur.
startAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
