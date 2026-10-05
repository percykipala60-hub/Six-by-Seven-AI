import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Les styles globaux passent en premier : les styles des composants peuvent ainsi les surcharger.
import "./styles/global.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
