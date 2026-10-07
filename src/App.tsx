import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/layout/Layout";
import { HomePage } from "./pages/HomePage";
import { LegalPage } from "./pages/LegalPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { DownloadPage } from "./pages/DownloadPage";
import { StudioPage } from "./pages/StudioPage";
import { ExperiencePage } from "./pages/ExperiencePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="legal/:slug" element={<LegalPage />} />
          <Route path="telecharger" element={<DownloadPage />} />
          <Route path="decouvrir" element={<ExperiencePage />} />
          {/* Studio de contrôle des modèles 3D : disponible en développement seulement. */}
          {import.meta.env.DEV && <Route path="studio" element={<StudioPage />} />}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
