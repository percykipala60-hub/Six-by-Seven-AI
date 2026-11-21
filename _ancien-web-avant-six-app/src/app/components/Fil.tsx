import type { ReactNode } from 'react';

/**
 * « Le fil » : à gauche de chaque ligne, deux traits. Blanc = l'humain, bleu = Six.
 * Un point bleu marque l'endroit où Six intervient.
 */
export function FilRow({
  children,
  dot = false,
  six = true,
  className = '',
}: {
  children: ReactNode;
  dot?: boolean;
  six?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 px-5 ${className}`}>
      <div aria-hidden="true" className="relative flex w-5 shrink-0 justify-center gap-1">
        <span className="w-0.5 bg-text/80" />
        <span className={`w-0.5 ${six ? 'bg-accent' : 'bg-transparent'}`} />
        {dot ? (
          <span className="absolute top-2 left-[5px] size-2.5 rounded-full bg-accent shadow-[0_0_0_3px_var(--color-ground)]" />
        ) : null}
      </div>
      <div className="flex min-w-0 grow flex-col pb-3">{children}</div>
    </div>
  );
}

/** Message de la conversation. Toujours du texte brut : jamais de HTML. */
export function Bubble({
  children,
  mine = false,
  author,
}: {
  children: ReactNode;
  mine?: boolean;
  author?: string;
}) {
  return (
    <div
      className={`max-w-[86%] px-3.5 py-2.5 text-[15px] leading-snug break-words whitespace-pre-wrap ${
        mine
          ? 'self-end rounded-[18px_4px_18px_18px] bg-line'
          : 'self-start rounded-[4px_18px_18px_18px] bg-surface'
      }`}
    >
      {author ? (
        <span className="mb-0.5 block text-xs font-semibold text-muted">{author}</span>
      ) : null}
      {children}
    </div>
  );
}

/** Ce que Six dit : en bleu, en italique, sur son propre fil. */
export function SixSays({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 pt-1 pb-0.5 text-[15px] leading-relaxed text-accent-soft italic">
      {children}
    </p>
  );
}

export function Header({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: (() => void) | undefined;
}) {
  return (
    <header className="flex items-center gap-3 px-5 pt-4 pb-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="truncate font-display text-[17px] font-semibold">{title}</h1>
        {subtitle ? <p className="truncate text-[13px] text-muted">{subtitle}</p> : null}
      </div>
    </header>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="min-h-12 w-full rounded-2xl bg-accent px-5 py-3 font-display text-base font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  compact = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** Boutons côte à côte : moins de marge, jamais sur deux lignes. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 w-full rounded-2xl border border-line py-3 text-base whitespace-nowrap text-text transition-colors hover:bg-surface ${compact ? 'px-2' : 'px-5'}`}
    >
      {children}
    </button>
  );
}

/** Zone d'actions collée en bas, au-dessus de la barre d'accueil de l'iPhone. */
export function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-gradient-to-t from-ground from-70% to-transparent px-5 pt-6 pb-4">
      {children}
    </div>
  );
}
