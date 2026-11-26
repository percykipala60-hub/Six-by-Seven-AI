import { Suspense } from 'react';
import { RetourGithub } from '@/components/RetourGithub';

export const metadata = { title: 'GitHub — Six' };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RetourGithub />
    </Suspense>
  );
}
