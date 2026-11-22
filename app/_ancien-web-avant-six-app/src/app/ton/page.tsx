import type { Metadata } from 'next';
import { loadPublicEnv } from '@/lib/env';
import { ToneChecker } from './ToneChecker';

export const metadata: Metadata = { title: 'Vérifier mon ton' };

export default function TonPage() {
  const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
  return <ToneChecker apiUrl={NEXT_PUBLIC_API_URL} />;
}
