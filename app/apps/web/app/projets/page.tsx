import { TravailPage } from '@/components/Travail';
export const metadata = { title: 'Projets — Six', robots: 'noindex, nofollow' };
export default function Page() {
  return (
    <div className="app">
      <TravailPage onglet="projets" />
    </div>
  );
}
