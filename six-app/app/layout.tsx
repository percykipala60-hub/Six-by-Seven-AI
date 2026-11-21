import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Register } from "@/components/Register";
import { ThemeIcon } from "@/components/ThemeIcon";

export const metadata: Metadata = {
  title: "Six — Seven.AI",
  description: "Colle une conversation. Six la comprend et te propose trois réponses. Tu choisis, tu envoies.",
  manifest: "/manifest.json",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  // Fond par défaut ; ensuite la barre suit le thème choisi (lib/theme-icon.ts).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#12151c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // la saisie en bas tient compte de l’encoche et de la barre de gestes (safe-area)
};

// Applique le thème choisi avant l'affichage pour éviter un flash. Contenu fixe, sans donnée utilisateur.
const THEME_SCRIPT = `try{var t=localStorage.getItem("six-theme"),a=localStorage.getItem("six-accent"),f=localStorage.getItem("six-font"),r=document.documentElement;if(t==="light"||t==="dark")r.dataset.theme=t;if(a&&a!=="bleu")r.dataset.accent=a;if(f==="times"||f==="georgia"||f==="calibri")r.dataset.font=f}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Register />
        <ThemeIcon />
        {children}
      </body>
    </html>
  );
}
