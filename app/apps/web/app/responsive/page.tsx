import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Flow } from '@/components/Flow';

export const metadata: Metadata = {
  title: 'Responsive — Six',
  description:
    'Colle une conversation : Six repère les arnaques, explique le vrai sens et propose trois réponses.',
};

export default function Page() {
  return (
    <div className="app">
      <Suspense fallback={null}>
        <Flow />
      </Suspense>
    </div>
  );
}
