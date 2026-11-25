import type { Metadata } from 'next';
import { PageQr } from '@/components/PageQr';

export const metadata: Metadata = {
  title: 'Connexion par code QR — Six',
  robots: 'noindex, nofollow',
  referrer: 'no-referrer',
};

export default function Page() {
  return (
    <div className="app">
      <PageQr />
    </div>
  );
}
