'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** En-tête des étapes : retour, progression « 3/11 », titre en deux tons comme les maquettes. */
export function StepHeader({
  step,
  total = 11,
  onBack,
  kicker,
}: {
  step?: number | undefined;
  total?: number;
  onBack?: (() => void) | undefined;
  kicker?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 pt-4 pb-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-text"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <span className="size-10 shrink-0" aria-hidden="true" />
      )}
      {step ? (
        <div className="flex grow items-center gap-3">
          <div
            className="h-1.5 grow overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={step}
            aria-label={`Étape ${step} sur ${total}`}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${(step / total) * 100}%` }}
            />
          </div>
          <span className="text-[12px] text-muted tabular-nums">
            {step}/{total}
          </span>
        </div>
      ) : (
        <p className="grow text-center text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">
          {kicker}
        </p>
      )}
    </div>
  );
}

/** Titre en deux tons : « Que veux-tu <bleu>obtenir</bleu> ? » */
export function Title({
  children,
  accent,
  after,
  sub,
}: {
  children?: ReactNode;
  accent?: string;
  after?: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-5 pt-2 pb-4">
      <h1 className="font-display text-[26px] leading-tight font-bold tracking-tight">
        {children}
        {accent ? <span className="text-accent">{accent}</span> : null}
        {after}
      </h1>
      {sub ? <p className="text-[14px] leading-relaxed text-muted">{sub}</p> : null}
    </div>
  );
}

export function Card({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section className={`rounded-[20px] bg-surface px-4 py-3.5 ${className}`}>
      {label ? (
        <p className="mb-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
          {label}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export function Chip({
  children,
  pressed,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  pressed?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-full border px-4 text-[14px] transition-colors disabled:opacity-50 ${
        pressed
          ? 'border-accent bg-accent text-on-accent'
          : 'border-line bg-surface text-text hover:border-accent'
      }`}
    >
      {children}
    </button>
  );
}

/** Choix exclusif en ligne (Court / Moyen / Détaillé). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-2xl bg-ground p-1 ring-1 ring-line"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-10 grow rounded-xl px-3 text-[14px] transition-colors ${
            value === option.value ? 'bg-accent text-on-accent' : 'text-muted'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-1">
      <span className="flex flex-col">
        <span className="text-[15px]">{label}</span>
        {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-7 w-12 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:outline-3 peer-focus-visible:outline-accent" />
        <span className="absolute top-1 left-1 size-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** Une option dans une liste à choix unique (écran « Objectif »). */
export function RadioRow({
  checked,
  onSelect,
  children,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors ${
        checked ? 'bg-accent/15 ring-accent' : 'bg-surface ring-line hover:ring-accent'
      }`}
    >
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold">{children}</span>
        {hint ? <span className="text-[13px] text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-full ring-2 ${checked ? 'ring-accent' : 'ring-line'}`}
      >
        {checked ? <span className="size-2.5 rounded-full bg-accent" /> : null}
      </span>
    </button>
  );
}

/** Jauge à niveaux (Calme / Pressant / Tendu, ou ton perçu). Jamais un pourcentage. */
export function LevelGauge({
  levels,
  index,
  label,
}: {
  levels: readonly string[];
  index: number;
  label: string;
}) {
  const colors = ['#22b07d', '#f0a03c', '#ff7a59', '#ff4f3a'];
  const position = levels.length > 1 ? (index / (levels.length - 1)) * 100 : 0;
  return (
    <div
      className="flex flex-col gap-2"
      role="img"
      aria-label={`${label} : ${levels[index] ?? ''}`}
    >
      <div
        className="relative h-2.5 rounded-full"
        style={{
          background: `linear-gradient(90deg, ${colors.slice(0, Math.max(2, levels.length)).join(', ')})`,
        }}
      >
        <span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ground bg-text"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="flex justify-between text-[12px]">
        {levels.map((level, i) => (
          <span key={level} className={i === index ? 'font-semibold text-text' : 'text-muted'}>
            {level}
          </span>
        ))}
      </div>
    </div>
  );
}

const NAV = [
  {
    href: '/accueil',
    label: 'Accueil',
    icon: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  },
  { href: '/outils', label: 'Outils', icon: 'M4 6h16M4 12h16M4 18h10' },
  {
    href: '/reglages',
    label: 'Réglages',
    icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  },
] as const;

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="sticky bottom-0 mt-auto grid grid-cols-3 border-t border-line bg-ground/95 px-2 pt-2 pb-3 backdrop-blur"
    >
      {NAV.map((item) => {
        const active = path === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[12px] ${
              active ? 'text-text' : 'text-muted'
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d={item.icon}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Lien-carte de l'accueil et des outils. */
export function Tile({
  href,
  title,
  hint,
  icon,
}: {
  href: string;
  title: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-24 flex-col gap-2 rounded-[20px] bg-surface p-4 ring-1 ring-line transition-colors hover:ring-accent"
    >
      <span
        className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent-soft"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="text-[12px] leading-snug text-muted">{hint}</span>
    </Link>
  );
}

/** Copie dans le presse-papiers ; si le navigateur refuse, le texte reste sélectionnable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
