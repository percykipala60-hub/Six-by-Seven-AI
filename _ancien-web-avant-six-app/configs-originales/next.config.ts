import path from 'node:path';
import type { NextConfig } from 'next';
import { loadPublicEnv } from './src/lib/env';

const { NEXT_PUBLIC_API_URL } = loadPublicEnv();

/**
 * CSP de la Phase 1. Next.js injecte des scripts en ligne : 'unsafe-inline' reste nécessaire
 * jusqu'au passage aux nonces (Phase 4). Tout le reste est fermé.
 */
const csp = [
  "default-src 'self'",
  // React a besoin d'eval() en développement (pnpm dev) seulement ; jamais en production.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${NEXT_PUBLIC_API_URL}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pas de fichiers AGENTS.md / CLAUDE.md générés dans le dépôt à chaque `pnpm dev`.
  agentRules: false,
  reactStrictMode: true,
  // Build autonome seulement pour Docker (NEXT_OUTPUT=standalone) ; Vercel n'en a pas besoin.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  // Monorepo : le build autonome doit embarquer packages/shared.
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  transpilePackages: ['@six/shared'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
