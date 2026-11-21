import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CompteSync } from '@/components/CompteSync';
import { Fond } from '@/components/Fond';
import { NetworkStatus } from '@/components/NetworkStatus';
import { InterAppLaunchHandler } from '@/components/InterAppNotifications';
import { ThemeIcon } from '@/components/ThemeIcon';
import { ANCIENS_ACCENTS } from '@/lib/theme-ids';

export const metadata: Metadata = {
  title: 'Six — Seven.AI',
  description:
    'Colle une conversation. Six la comprend et te propose trois réponses. Tu choisis, tu envoies.',
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
  viewportFit: 'cover', // la saisie en bas tient compte de l’encoche et de la barre de gestes (safe-area)
};

// Applique le thème choisi avant l'affichage pour éviter un flash. Contenu fixe, sans donnée utilisateur.
// Deuxième rôle : neutraliser les injections de l'hébergeur (Netlify) qui cassent l'hydratation React
// (#418 → rendu client de secours → app instable, surtout au premier affichage des thèmes) :
// - un commentaire promotionnel « This site is hosted on Netlify » injecté dans <head> après <meta charSet> ;
// - un script « hud » (badge « Déployer sur Netlify ») injecté en fin de <body> : <script src="/.netlify/scripts/hud">
// PRÉCAUTION CRITIQUE : React 19 pose SES propres commentaires-ancres dans <head> (`<!--$-->`, `<!-- -->`)
// et EN AJOUTE pendant l'hydratation. On ne retire donc QUE les commentaires dont le contenu mentionne
// « netlify » — retirer tous les commentaires (ancienne version) ou les nouveaux commentaires de head
// cassait l'hydratation (#418 systématique), exactement le mal qu'on voulait soigner.
const THEME_SCRIPT = `try{var t=localStorage.getItem("six-theme"),a=localStorage.getItem("six-accent"),M=${JSON.stringify(ANCIENS_ACCENTS)},f=localStorage.getItem("six-font"),fd=localStorage.getItem("six-fond"),r=document.documentElement;if(t==="light"||t==="dark")r.dataset.theme=t;if(a&&M[a]){a=M[a];localStorage.setItem("six-accent",a)}if(a&&a!=="bleu")r.dataset.accent=a;if(f==="times"||f==="georgia"||f==="calibri")r.dataset.font=f;if(fd==="aurore"||fd==="points"||fd==="uni")r.dataset.fond=fd;var NETRX=/netlify/i;var h=document.head;if(h){var aS=[];for(var n=h.firstChild;n;n=n.nextSibling){if(n.nodeType===8&&NETRX.test(n.nodeValue||""))aS.push(n)}for(var i=0;i<aS.length;i++)h.removeChild(aS[i])}var EST=function(x){return x.nodeType===1&&x.tagName==="SCRIPT"&&(x.getAttribute("data-netlify-site-id")||String(x.getAttribute("src")||"").indexOf("/.netlify/")===0)};var RET=function(x){if(x.parentNode)x.parentNode.removeChild(x)};var NET=function(x){if(!x||!x.nodeType)return;if(EST(x)){RET(x);return}if(x.nodeType===1&&x.querySelectorAll){var s=x.querySelectorAll('script[data-netlify-site-id],script[src^="/.netlify/"]');for(var k=0;k<s.length;k++)RET(s[k])}else if(x.nodeType===8&&x.parentNode===h&&NETRX.test(x.nodeValue||"")){RET(x)}};var O=new MutationObserver(function(ms){for(var m=0;m<ms.length;m++){var ns=ms[m].addedNodes;for(var j=0;j<ns.length;j++)NET(ns[j])}});O.observe(r,{childList:true,subtree:true});window.addEventListener("load",function(){setTimeout(function(){O.disconnect()},3000)})}catch(e){}`;

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
        <NetworkStatus />
        <InterAppLaunchHandler />
        <ThemeIcon />
        <CompteSync />
        {children}
      </body>
    </html>
  );
}
