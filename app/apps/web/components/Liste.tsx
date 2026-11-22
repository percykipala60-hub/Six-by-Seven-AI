'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Listes des Réglages : une liste à plat, sans encadré. Chaque rangée a une icône au trait, un titre et une
 * courte ligne grise dessous ; le toucher et la rangée ouverte prennent un fond léger aux coins arrondis.
 * Les groupes sont séparés par un trait fin.
 */

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

/** Trait fin entre deux groupes. */
export function Separateur() {
  return <hr className="lg-sep" />;
}

function Corps({
  icon,
  label,
  sous,
  danger,
  apres,
}: {
  icon?: IconName;
  label: ReactNode;
  sous?: ReactNode;
  danger?: boolean;
  apres?: ReactNode;
}) {
  return (
    <>
      {icon && (
        <span className={`lg-ico${danger ? ' danger' : ''}`} aria-hidden="true">
          <Icon name={icon} size={22} stroke={1.75} />
        </span>
      )}
      <span className="lg-txt">
        <span className={`lg-label${danger ? ' danger' : ''}`}>{label}</span>
        {sous !== undefined && sous !== '' && <span className="lg-sous">{sous}</span>}
      </span>
      {apres}
    </>
  );
}

type Base = {
  icon?: IconName;
  label: ReactNode;
  /** Courte ligne grise sous le titre (valeur actuelle, explication). */
  sous?: ReactNode;
};

/** Rangée qui ouvre une sous-page ou fait une action. */
export function Ligne({
  onClick,
  danger,
  disabled,
  ...b
}: Base & { onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className="lg-ligne" onClick={onClick} disabled={disabled}>
      <Corps {...b} danger={danger} />
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

/** Rangée d'information, sans action. */
export function LigneInfo({ valeur, ...b }: Base & { valeur?: ReactNode }) {
  return (
    <div className="lg-ligne lg-statique">
      <Corps {...b} apres={valeur !== undefined && <span className="lg-val">{valeur}</span>} />
    </div>
  );
}

/** Rangée avec un interrupteur à droite. */
export function LigneInterrupteur({
  id,
  checked,
  onChange,
  disabled,
  ...b
}: Base & {
  id: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="lg-ligne" htmlFor={id}>
      <Corps
        {...b}
        apres={
          <input
            id={id}
            type="checkbox"
            role="switch"
            className="lg-sw"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
        }
      />
    </label>
  );
}

/** Un choix parmi plusieurs, avec un bouton rond à gauche. */
export function LigneChoix({
  choisi,
  onClick,
  label,
  sous,
}: Omit<Base, 'icon'> & { choisi: boolean; onClick: () => void }) {
  return (
    <button type="button" className="lg-ligne" role="radio" aria-checked={choisi} onClick={onClick}>
      <span className="lg-radio" aria-hidden="true">
        <i />
      </span>
      <Corps label={label} sous={sous} />
    </button>
  );
}

/** Petit bouton de texte au bout d'une rangée (« Retirer », « Oublier »). */
export function BoutonTexte({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="lg-texte" onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}

/** En-tête d'une sous-page : bouton retour rond, puis le titre. */
export function EnteteSousPage({ titre, onRetour }: { titre: string; onRetour: () => void }) {
  return (
    <header className="lg-entete">
      <button type="button" className="lg-retour" onClick={onRetour} aria-label="Retour">
        <Icon name="back" size={20} stroke={2} />
      </button>
      {titre && <h1>{titre}</h1>}
    </header>
  );
}
