import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SevenChatPage } from '@/components/SevenChat';

export const metadata: Metadata = {
  title: 'Cosinus — Six',
  description:
    'Six travaille pour toi : rapports, recherches, analyse de documents, d’images et de vidéos.',
  robots: 'noindex, nofollow',
};

export default function Page() {
  return (
    <div className="app">
      <Suspense fallback={null}>
        <SevenChatPage mode="sixtouch" />
      </Suspense>
    </div>
  );
}
