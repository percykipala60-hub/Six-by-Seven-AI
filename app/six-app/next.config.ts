import type { NextConfig } from "next";

const config = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  agentRules: false, // Next ne génère plus AGENTS.md/CLAUDE.md dans le dossier
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          // Directives sans risque pour les scripts de Next et la lecture des captures (OCR) : pas d'intégration dans
          // une autre page, pas de plugin, pas de formulaire vers un autre site.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // Le service worker doit toujours être revérifié par le navigateur.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
} as NextConfig;

export default config;
