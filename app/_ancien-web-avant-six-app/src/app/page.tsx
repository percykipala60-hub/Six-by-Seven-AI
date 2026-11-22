import Link from 'next/link';
import { COMPANY_NAME, PRODUCT_NAME } from '@six/shared';
import { SixMark } from './components/SixMark';
import { Icon } from './components/icons';
type PromiseRow = { text: string; icon: 'cadenas' | 'bouclier' | 'signal' };

const promises: PromiseRow[] = [
  { text: 'Rien n’est stocké', icon: 'cadenas' },
  { text: 'Anti-arnaque', icon: 'bouclier' },
  { text: 'Marche en 3G', icon: 'signal' },
];

/** Bienvenue : la promesse et la confiance avant toute demande. */
export default function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="flex flex-col items-center gap-6 pt-16 text-center">
        <SixMark size={72} title={PRODUCT_NAME} />
        <h1 className="font-display text-[34px] leading-[1.1] font-bold tracking-tight">
          Six ne parle jamais <span className="text-accent">à ta place</span>
        </h1>
        <p className="text-base leading-relaxed text-muted">
          Colle une conversation. Six la comprend, repère les arnaques et te propose trois réponses.
          Tu choisis, tu envoies.
        </p>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Nos engagements">
          {promises.map(({ text, icon }) => (
            <li
              key={text}
              className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm ring-1 ring-line"
            >
              <Icon name={icon} size={16} />
              {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto flex flex-col gap-3 pt-10 pb-6">
        <Link
          href="/accueil"
          className="flex min-h-12 items-center justify-center rounded-2xl bg-accent px-5 py-3 font-display text-base font-semibold text-on-accent"
        >
          Commencer
        </Link>
        <Link
          href="/confidentialite"
          className="flex min-h-12 items-center justify-center rounded-2xl text-[15px] text-muted ring-1 ring-line"
        >
          Ce qui se passe avec mes messages
        </Link>
        <p className="pt-2 text-center text-xs text-muted">
          par 7 <span className="text-accent">AI</span>
          <span className="sr-only"> ({COMPANY_NAME})</span>
        </p>
      </div>
    </main>
  );
}
