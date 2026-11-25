import path from 'node:path';
import type { NextConfig } from 'next';

// Monorepo pnpm : les paquets sont des liens vers ../../node_modules, la racine de Turbopack doit donc être la racine du dépôt.
const racine = path.join(process.cwd(), '../..');

const config = {
  poweredByHeader: false,
  turbopack: { root: racine },
  outputFileTracingRoot: racine,
  devIndicators: false, // pas de pastille « N » de Next.js par-dessus l'app (simulateur, téléphone)
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean),
  agentRules: false, // Next ne génère plus AGENTS.md/CLAUDE.md dans le dossier
  // Build autonome seulement pour Docker (NEXT_OUTPUT=standalone).
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  // Le Chat s'appelait /seven-ai, Cosinus s'appelait SixTouch (/sixtouch) : les anciens liens (raccourcis iPhone,
  // favoris) y mènent toujours.
  async redirects() {
    return [
      { source: '/seven-ai', destination: '/chat', permanent: true },
      { source: '/sixtouch', destination: '/cosinus', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, // SAMEORIGIN : la page /jeu affiche le jeu (même site) dans un cadre
          // Directives sans risque pour les scripts de Next et la lecture des captures (OCR) : intégration seulement dans
          // une page de Six (le jeu), pas de plugin, pas de formulaire vers un autre site.
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
          {
            key: 'Permissions-Policy',
            // Micro et caméra autorisés pour Six lui-même (messages vocaux, dictée, scanner du code QR de connexion),
            // jamais pour un site intégré.
            value: 'camera=(self), microphone=(self), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
} as NextConfig;

export default config;
