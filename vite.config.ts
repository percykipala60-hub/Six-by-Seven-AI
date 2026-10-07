import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Port fourni par l'environnement (PORT) quand il existe, sinon 5173 par défaut.
  server: { port: Number(process.env.PORT) || 5173 },
});
