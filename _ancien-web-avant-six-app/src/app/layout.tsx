import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { COMPANY_NAME, PRODUCT_NAME, TAGLINE } from '@six/shared';
import Script from 'next/script';
import { THEME_BOOT_SCRIPT } from '@/lib/settings-boot';
import { SettingsApplier } from './components/SettingsApplier';
import './globals.css';

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: `${TAGLINE} Six t'aide à répondre à une conversation, sans jamais parler à ta place.`,
  applicationName: PRODUCT_NAME,
  authors: [{ name: COMPANY_NAME }],
  icons: {
    icon: [
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: PRODUCT_NAME, statusBarStyle: 'black-translucent' },
  // Balise historique encore lue par Safari iOS pour ouvrir l'app en plein écran.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0f1c',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning>
      <body className="antialiased">
        {/* Avant l'affichage : pas d'éclair de mauvais thème. */}
        <Script id="six-theme" strategy="beforeInteractive">
          {THEME_BOOT_SCRIPT}
        </Script>
        <SettingsApplier />
        {children}
      </body>
    </html>
  );
}
