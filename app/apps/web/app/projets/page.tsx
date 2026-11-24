import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProjetsPage } from '@/components/Projets';

export const metadata: Metadata = {
  title: 'Projets — Six',
  description: 'Range tes discussions par projet, avec des consignes et des documents.',
  robots: 'noindex, nofollow',
};

export default function Page() {
  return (
    <div className="app">
      <Suspense fallback={null}>
        <ProjetsPage />
      </Suspense>
    </div>
  );
}
