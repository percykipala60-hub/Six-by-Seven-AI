import type { Metadata } from 'next';
import { AlerteConnexion } from '@/components/AlerteConnexion';

export const metadata: Metadata = {
  title: 'Sécurité du compte — Six',
  robots: 'noindex, nofollow',
  referrer: 'no-referrer',
};

export default function Page() {
  return (
    <div className="app">
      <AlerteConnexion />
    </div>
  );
}
