import type { Metadata } from 'next';
import Link from 'next/link';
import { AppBar } from '@/components/AppBar';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'Espace jeu — Six',
  description: 'Retrouve les jeux Six au même endroit.',
  robots: 'noindex, nofollow',
};

const games = [
  {
    href: '/jeu',
    icon: 'moto' as const,
    title: 'Kin Rush',
    description: 'Traverse Kinshasa en moto-taxi.',
  },
  {
    href: '/ton-juste',
    icon: 'bulb' as const,
    title: 'Le jeu du ton juste',
    description: 'Trouve les mots adaptés à chaque situation.',
  },
  {
    href: '/coupe-arnaque',
    icon: 'shield' as const,
    title: "Coupe l'arnaque",
    description: 'Repère les pièges dans des messages suspects.',
  },
];

export default function EspaceJeuPage() {
  return (
    <main className="screen">
      <AppBar page="espace-jeu" titre="Espace jeu" />
      <div className="intro">
        <h1>
          Espace <em>jeu</em>
        </h1>
        <p className="muted">Choisis un jeu et lance une partie.</p>
      </div>
      <div className="game-hub-grid">
        {games.map((game) => (
          <Link className="game-hub-card" href={game.href} key={game.href}>
            <span className="game-hub-icon" aria-hidden="true">
              <Icon name={game.icon} size={22} />
            </span>
            <span className="game-hub-copy">
              <strong>{game.title}</strong>
              <span className="muted">{game.description}</span>
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        ))}
      </div>
    </main>
  );
}
