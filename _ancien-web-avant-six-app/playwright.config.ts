import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/** Option : un Chromium déjà installé (connexion lente, pas de téléchargement). Jamais en CI. */
const chromiumPath = process.env.PW_CHROMIUM_PATH;

/**
 * Chromium (Android bas de gamme simulé) ET WebKit (iPhone) : chaque test tourne sur les deux.
 * L'API n'est pas lancée : la page doit afficher un état « injoignable » propre, jamais planter.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Dans WebKit (iPhone), les requêtes d'une page contrôlée par le service worker de la PWA
    // échappent à page.route : la fausse API n'était jamais appelée. Aucun test ne dépend du
    // service worker ; on le bloque pour que les mêmes tests valent sur Chromium et WebKit.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'android-chromium',
      use: {
        ...devices['Moto G4'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
