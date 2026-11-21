'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Listes groupées des Réglages, à la manière d'un téléphone : un titre de groupe, des rangées séparées par un
 * trait fin qui commence après l'icône, et une note sous le groupe.
 */

/** Couleur de la petite tuile d'icône d'une rangée. */
export type Teinte = 'bleu' | 'gris' | 'orange' | 'violet' | 'rouge' | 'vert' | 'indigo' | 'rose';

export function Groupe({
  titre,
  pied,
  children,
}: {
  titre?: string;
  pied?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="lg">
      {titre && <h2 className="lg-titre">{titre}</h2>}
      <div className="lg-liste">{children}</div>
      {pied && <p className="lg-pied">{pied}</p>}
    </section>
  );
}

function Tuile({ icon, teinte }: { icon: IconName; teinte: Teinte }) {
  return (
    <span className="lg-ico" data-teinte={teinte} aria-hidden="true">
      <Icon name={icon} size={17} stroke={2.2} />
    </span>
  );
}

function Corps({
  icon,
  teinte,
  label,
  sous,
  valeur,
  fleche = true,
}: {
  icon?: IconName;
  teinte?: Teinte;
  label: ReactNode;
  sous?: ReactNode;
  valeur?: ReactNode;
  fleche?: boolean;
}) {
  return (
    <>
      {icon && <Tuile icon={icon} teinte={teinte ?? 'gris'} />}
      <span className="lg-txt">
        <span className="lg-label">{label}</span>
        {sous && <span className="lg-sous">{sous}</span>}
      </span>
      {valeur !== undefined && <span className="lg-val">{valeur}</span>}
      {fleche && <Icon name="chevron" size={16} className="lg-fleche" />}
    </>
  );
}

type Base = {
  icon?: IconName;
  teinte?: Teinte;
  label: ReactNode;
  sous?: ReactNode;
  valeur?: ReactNode;
};

/** Rangée qui ouvre une sous-page ou fait une action. */
export function Ligne({ onClick, ...b }: Base & { onClick: () => void }) {
  return (
    <button type="button" className="lg-ligne" onClick={onClick}>
      <Corps {...b} />
    </button>
  );
}

/** Rangée qui mène vers une autre page de Six, ou vers un site (externe). */
export function LigneLien({ href, externe, ...b }: Base & { href: string; externe?: boolean }) {
  if (externe)
    return (
      <a className="lg-ligne" href={href} target="_blank" rel="noopener noreferrer">
        <Corps {...b} />
      </a>
    );
  return (
    <Link className="lg-ligne" href={href}>
      <Corps {...b} />
    </Link>
  );
}

/** Rangée avec un interrupteur. */
export function LigneInterrupteur({
  id,
  checked,
  onChange,
  disabled,
  ...b
}: Omit<Base, 'valeur'> & {
  id: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="lg-ligne" htmlFor={id}>
      <Corps {...b} fleche={false} />
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="lg-sw"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** Rangée de choix unique : une coche marque l'option retenue. */
export function LigneChoix({
  choisi,
  onClick,
  ...b
}: Omit<Base, 'valeur'> & { choisi: boolean; onClick: () => void }) {
  return (
    <button type="button" className="lg-ligne" role="radio" aria-checked={choisi} onClick={onClick}>
      <Corps {...b} fleche={false} />
      <Icon name="check" size={18} stroke={2.6} className="lg-coche" />
    </button>
  );
}

/** Action en texte, seule dans sa rangée (rouge si on ne peut pas la rattraper). */
export function LigneAction({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`lg-ligne lg-action${danger ? ' danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

/** En-tête d'une sous-page : retour à gauche, titre au centre. */
export function EnteteSousPage({
  titre,
  retour,
  onRetour,
}: {
  titre: string;
  retour: string;
  onRetour: () => void;
}) {
  return (
    <header className="lg-entete">
      <button type="button" className="lg-retour" onClick={onRetour}>
        <Icon name="back" size={20} stroke={2.4} />
        <span>{retour}</span>
      </button>
      <h1>{titre}</h1>
      <span aria-hidden="true" />
    </header>
  );
}
