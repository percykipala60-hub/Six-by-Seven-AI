import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SevenChatPage } from '@/components/SevenChat';

export const metadata: Metadata = {
  title: 'Seven AI — Six',
  description:
    "Discute avec Seven AI, l'assistant intégré de Six : il connaît l'app sur le bout des doigts et répond à toutes tes questions.",
  robots: 'noindex, nofollow',
};

export default function Page() {
  return (
    <div className="app">
      <Suspense fallback={null}>
        <SevenChatPage />
      </Suspense>
    </div>
  );
}
