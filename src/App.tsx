import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/layout/Layout";
import { HomePage } from "./pages/HomePage";
import { LegalPage } from "./pages/LegalPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { DownloadPage } from "./pages/DownloadPage";

// Studio de contrôle des modèles 3D : chargé à la demande, en développement seulement. Importé directement,
// il entraînait toute la 3D (three.js, modèles) dans le fichier principal du site, même en production.
const StudioPage = import.meta.env.DEV ? lazy(() => import("./pages/StudioPage").then((m) => ({ default: m.StudioPage }))) : null;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="legal/:slug" element={<LegalPage />} />
          <Route path="telecharger" element={<DownloadPage />} />
          {/* Ancienne adresse de la visite animée, devenue l'accueil. */}
          <Route path="decouvrir" element={<Navigate to="/" replace />} />
          {StudioPage && (
            <Route
              path="studio"
              element={
                <Suspense fallback={null}>
                  <StudioPage />
                </Suspense>
              }
            />
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
