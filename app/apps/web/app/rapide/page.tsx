import type { Metadata } from 'next';
import { Rapide } from '@/components/Rapide';

export const metadata: Metadata = {
  title: 'Réponse rapide — Six',
  robots: 'noindex, nofollow',
};

// Panneau ouvert par la bulle et le clavier Six (app Android), par-dessus la messagerie.
export default function Page() {
  return <Rapide />;
}
