import type { Metadata } from 'next';
import { GameShell } from '@/components/GameShell';

export const metadata: Metadata = {
  title: 'Kin Rush — Six',
  description: 'Course de moto-taxi à travers Kinshasa. Un jeu Six by Seven.AI.',
  robots: 'noindex, nofollow',
};

// Le jeu est un fichier HTML autonome (public/jeu), affiché en plein écran sous une fine barre de retour vers Six.
export default function JeuPage() {
  return (
    <GameShell
      src="/jeu/index.html"
      title="Kin Rush"
      allow="autoplay; accelerometer; gyroscope; vibration"
      pauseable
    />
  );
}
