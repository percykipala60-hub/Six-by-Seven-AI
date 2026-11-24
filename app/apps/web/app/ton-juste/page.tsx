import type { Metadata } from 'next';
import { GameShell } from '@/components/GameShell';
import { PRODUIT } from '@/lib/marque';

export const metadata: Metadata = {
  title: 'Le jeu du ton juste — Six',
  description: `Trouve les mots justes dans 15 situations de la vie de tous les jours. Un jeu ${PRODUIT}.`,
  robots: 'noindex, nofollow',
};

// Le jeu est construit dans public/ton-juste (pnpm build:ton-juste). allow-forms : sans lui, le bouton « Soumettre » du jeu ne fait rien.
// Il est affiché en plein écran sous une fine barre de retour vers Six.
export default function TonJustePage() {
  return <GameShell src="/ton-juste/index.html" title="Le jeu du ton juste" />;
}
