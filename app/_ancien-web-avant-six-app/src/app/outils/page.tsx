import type { Metadata } from 'next';
import { Icon } from '../components/icons';
import { BottomNav, Tile } from '../components/ui';

export const metadata: Metadata = { title: 'Outils' };

export default function OutilsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <h1 className="px-5 pt-8 pb-4 font-display text-[30px] font-bold">
        Les <span className="text-accent">outils</span> de Six
      </h1>
      <div className="flex flex-col gap-3 px-5 pb-6">
        <Tile
          href="/ton"
          title="Vérifier mon ton"
          hint="Tu écris seul : Six te dit comment ce sera reçu, et propose une version plus juste."
          icon={<Icon name="ton" />}
        />
        <Tile
          href="/quoi-dire"
          title="Quoi dire ?"
          hint="Briser la glace, reprendre contact, relancer, souhaiter, écrire à un pro."
          icon={<Icon name="idee" />}
        />
        <Tile
          href="/arnaques"
          title="Arnaques de chez nous"
          hint="Faux agent mobile money, faux recruteur, bourse fictive, code PIN demandé."
          icon={<Icon name="bouclier" />}
        />
        <Tile
          href="/confidentialite"
          title="Confidentialité"
          hint="Ce qui se passe avec tes messages, en 4 étapes."
          icon={<Icon name="cadenas" />}
        />
        <Tile
          href="/jeu"
          title="Kin Rush"
          hint="Course de moto-taxi à travers Kinshasa. Un jeu Six by Seven.AI."
          icon={<Icon name="bouclier" />}
        />
      </div>
      <BottomNav />
    </main>
  );
}
