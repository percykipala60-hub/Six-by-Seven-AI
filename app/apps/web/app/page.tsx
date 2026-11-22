import { Suspense } from 'react';
import { Flow } from '@/components/Flow';

export default function Page() {
  return (
    <div className="app">
      <Suspense fallback={null}>
        <Flow />
      </Suspense>
    </div>
  );
}
