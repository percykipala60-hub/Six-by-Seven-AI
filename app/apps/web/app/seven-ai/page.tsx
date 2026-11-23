import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SevenChatPage } from '@/components/SevenChat';

export const metadata: Metadata = {
  title: 'Chat — Six',
  description: 'Discute librement avec Six : questions, documents, messages vocaux.',
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
