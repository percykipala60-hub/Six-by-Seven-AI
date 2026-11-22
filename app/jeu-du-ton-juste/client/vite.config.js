import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, /api est relayé vers le serveur d'évaluation (port 3010 par défaut) : pas de souci d'origine dans le navigateur.
// Port 5180 : le 5173 est souvent déjà pris par d'autres projets Vite. Le 3010 évite le 3001,
// régulièrement occupé par un autre projet local. Règle VITE_API_TARGET si tu changes le serveur.
// Mode « six » (npm run build:six) : le jeu est construit dans l'application Six, servi sous /ton-juste/,
// et note les réponses par la route /api/ton-juste de Six, avec la clé de Six.
const proxy = {
  '/api': { target: process.env.VITE_API_TARGET || 'http://localhost:3010', changeOrigin: true },
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'six' ? '/ton-juste/' : '/',
  build:
    mode === 'six' ? { outDir: '../../apps/web/public/ton-juste', emptyOutDir: true } : undefined,
  server: { port: 5180, strictPort: true, proxy },
  preview: { port: 4173, proxy },
}));
