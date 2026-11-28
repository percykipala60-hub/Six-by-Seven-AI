import { AppBar } from '@/components/AppBar';
import { CataloguePlugins } from '@/components/CataloguePlugins';
export default function Page() {
  return (
    <div className="app app-plugins">
      <main className="screen">
        <AppBar page="plugins" titre="" />
        <CataloguePlugins />
      </main>
    </div>
  );
}
