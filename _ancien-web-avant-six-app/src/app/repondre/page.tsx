import type { Metadata } from 'next';
import { loadPublicEnv } from '@/lib/env';
import { Flow } from './Flow';

export const metadata: Metadata = { title: 'Répondre' };

export default async function RepondrePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
  const params = await searchParams;
  return (
    <Flow
      apiUrl={NEXT_PUBLIC_API_URL}
      initialSource={params.source === 'fichier' ? 'fichier' : 'texte'}
      shared={params.partage === '1'}
    />
  );
}
