import { TravailPage } from '@/components/Travail';
export const metadata = { title: 'Tâches planifiées — Six', robots: 'noindex, nofollow' };
export default function Page() {
  return (
    <div className="app">
      <TravailPage onglet="taches" />
    </div>
  );
}
