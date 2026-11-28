import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { RetourParametres } from '@/components/RetourParametres';
import { CompteSync } from '@/components/CompteSync';
import { PorteCompte } from '@/components/Connexion';
import { Clavier } from '@/components/Clavier';
import { Fond } from '@/components/Fond';
import { PontBureau } from '@/components/PontBureau';
import { NetworkStatus } from '@/components/NetworkStatus';
import { InterAppLaunchHandler } from '@/components/InterAppNotifications';
import { ThemeIcon } from '@/components/ThemeIcon';
import { ANCIENS_ACCENTS } from '@/lib/theme-ids';
import { PRODUIT } from '@/lib/marque';
import { SCRIPT_ACCES } from '@/lib/accessibilite';

export const metadata: Metadata = {
  title: PRODUIT,
  description:
    'Collez une conversation. Six la comprend et vous propose trois réponses. Vous choisissez, vous envoyez.',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  // Fond par défaut ; ensuite la barre suit le thème choisi (lib/theme-icon.ts).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6fa' },
    { media: '(prefers-color-scheme: dark)', color: '#12151c' },
  ],
  width: 'device-width',
  initialScale: 1,
  // L'app s'affiche comme une appli : pas de zoom au pincement ni au double appui.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // la saisie en bas tient compte de l’encoche et de la barre de gestes (safe-area)
  // Android : le clavier réduit la hauteur de l'écran au lieu de faire glisser la page (le fond reste en place).
  interactiveWidget: 'resizes-content',
};

// Applique le thème, la couleur, la police et le fond choisis avant l'affichage, pour éviter un flash.
// Contenu fixe, sans donnée utilisateur ; les anciens noms de couleur sont convertis au passage.
const THEME_SCRIPT = `try{var t=localStorage.getItem("six-theme"),a=localStorage.getItem("six-accent"),M=${JSON.stringify(ANCIENS_ACCENTS)},f=localStorage.getItem("six-font"),fd=localStorage.getItem("six-fond"),r=document.documentElement;if(t==="light"||t==="dark")r.dataset.theme=t;if(a&&M[a]){a=M[a];localStorage.setItem("six-accent",a)}if(a&&a!=="bleu")r.dataset.accent=a;if(a==="rose")r.dataset.theme="light";if(f==="times"||f==="georgia"||f==="calibri")r.dataset.font=f;if(fd==="aurore"||fd==="points"||fd==="uni")r.dataset.fond=fd;${SCRIPT_ACCES}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Code fixe, sans données utilisateur : évite le flash du thème choisi avant l'hydratation. */}
        {/* eslint-disable-next-line no-restricted-syntax */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Fond />
        <Clavier />
        <NetworkStatus />
        <InterAppLaunchHandler />
        <ThemeIcon />
        <Suspense fallback={null}>
          <RetourParametres />
        </Suspense>
        <CompteSync />
        <PontBureau />
        <PorteCompte>{children}</PorteCompte>
      </body>
    </html>
  );
}
