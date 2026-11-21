import type { Metadata } from 'next';
import Link from 'next/link';
import { loadPublicEnv } from '@/lib/env';
import { ApiStatus } from '../components/ApiStatus';
import { Icon } from '../components/icons';
import { BottomNav, Tile } from '../components/ui';

export const metadata: Metadata = { title: 'Accueil' };

export default function AccueilPage() {
  const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex flex-col gap-1 px-5 pt-8 pb-4">
        <p className="text-[14px] text-muted">Bonjour</p>
        <h1 className="font-display text-[30px] leading-tight font-bold">
          Qu’est-ce qu’on <span className="text-accent">répond</span> ?
        </h1>
      </div>
      <div className="flex flex-col gap-4 px-5">
        <Link
          href="/repondre"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-accent px-5 font-display text-base font-semibold text-on-accent"
        >
          <Icon name="plus" /> Nouvelle conversation
        </Link>
        <p className="pt-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Choisir une source
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Tile
            href="/repondre?source=fichier"
            title="WhatsApp"
            hint="Export .txt ou .zip"
            icon={<Icon name="whatsapp" />}
          />
          <Tile
            href="/repondre"
            title="Texte"
            hint="Coller des messages"
            icon={<Icon name="texte" />}
          />
        </div>
        <p className="pt-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          Outils
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Tile
            href="/ton"
            title="Vérifier mon ton"
            hint="Avant d’envoyer ton message"
            icon={<Icon name="ton" />}
          />
          <Tile
            href="/quoi-dire"
            title="Quoi dire ?"
            hint="Lancer ou relancer"
            icon={<Icon name="idee" />}
          />
        </div>
        <Tile
          href="/arnaques"
          title="Arnaques de chez nous"
          hint="Les reconnaître en 10 secondes"
          icon={<Icon name="bouclier" />}
        />
        <p className="flex items-start gap-2 rounded-2xl bg-surface px-4 py-3 text-[13px] text-muted ring-1 ring-line">
          <Icon name="cadenas" size={18} />
          Aucune conversation n’est gardée. Ferme l’app, tout disparaît.
        </p>
        <div className="flex justify-center pb-4">
          <ApiStatus apiUrl={NEXT_PUBLIC_API_URL} />
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
