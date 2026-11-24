import type { Metadata } from 'next';
import { RetourConnexion } from '@/components/RetourConnexion';

export const metadata: Metadata = {
  title: 'Retour dans Six',
  robots: 'noindex, nofollow',
  // Le code de connexion est dans l'adresse : il ne part vers aucun autre site.
  referrer: 'no-referrer',
};

export default function Page() {
  return (
    <div className="app">
      <RetourConnexion />
    </div>
  );
}
