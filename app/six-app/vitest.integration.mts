import { defineConfig } from "vitest/config";
import path from "node:path";

// Contrôles qui appellent la vraie API (payants) : lancés seulement à la demande (npm run check-cache).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: { include: ["integration/**/*.test.ts"], testTimeout: 120_000 },
});
