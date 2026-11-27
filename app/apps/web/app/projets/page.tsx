import { TravailPage } from '@/components/Travail';
export const metadata = { title: 'Projets — Six', robots: 'noindex, nofollow' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ projet?: string }>;
}) {
  const { projet } = await searchParams;
  return (
    <div className="app">
      <TravailPage onglet="projets" projetId={projet} />
    </div>
  );
}
