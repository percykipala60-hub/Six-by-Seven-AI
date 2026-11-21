import type { Metadata } from 'next';
import { GameShell } from '@/components/GameShell';

export const metadata: Metadata = {
  title: "Coupe l'arnaque — Six",
  description:
    'Enquête sur des messages piégés et apprends à reconnaître les arnaques dans un jeu Six by Seven.AI.',
  robots: 'noindex, nofollow',
};

export default function CoupeArnaquePage() {
  return (
    <GameShell
      src="/coupe-arnaque/index.html"
      title="Coupe l'arnaque"
      allow="autoplay; clipboard-write; vibration"
      pauseable
    />
  );
}
