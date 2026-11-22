import type { Metadata } from 'next';
import { loadPublicEnv } from '@/lib/env';
import { QuoiDire } from './QuoiDire';

export const metadata: Metadata = { title: 'Quoi dire ?' };

export default function QuoiDirePage() {
  const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
  return <QuoiDire apiUrl={NEXT_PUBLIC_API_URL} />;
}
