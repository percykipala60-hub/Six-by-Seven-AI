import type { Metadata } from 'next';
import { RemoteDirect } from '@/components/RemoteDirect';

export const metadata: Metadata = {
  title: 'Remote',
  robots: 'noindex, nofollow',
};

export default function Page() {
  return (
    <div className="app">
      <RemoteDirect />
    </div>
  );
}
