import type { Metadata } from 'next';
import { NouveauMotDePasse } from '@/components/NouveauMotDePasse';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe — Six',
  robots: 'noindex, nofollow',
  // Le jeton du lien est dans l'adresse : il ne part vers aucun autre site.
  referrer: 'no-referrer',
};

export default function Page() {
  return (
    <div className="app">
      <NouveauMotDePasse />
    </div>
  );
}
