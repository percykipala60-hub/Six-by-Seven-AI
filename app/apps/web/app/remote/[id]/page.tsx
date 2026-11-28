import type { Metadata } from 'next';
import { RemoteVue } from '@/components/RemoteVue';

export const metadata: Metadata = {
  title: 'Discussion partagée',
  // Un partage n'est lisible que par les personnes qui ont le lien : jamais dans les moteurs de recherche.
  robots: 'noindex, nofollow',
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="app">
      <RemoteVue key={id} id={id} />
    </div>
  );
}
