import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Les styles globaux passent en premier : les styles des composants peuvent ainsi les surcharger.
import "./styles/global.css";
import { App } from "./App";
import { startAutoTranslate } from "./i18n/autoTranslate";

// Autre langue que le français choisie : Google Traduction traduit la page.
startAutoTranslate();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
