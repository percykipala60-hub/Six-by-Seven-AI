'use client';

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import Link from 'next/link';
import { ecouterCompte, lireCompte, type Compte } from '@/lib/compte';
import { AvatarContenu } from './AvatarContenu';
import { LIEN_CONFIDENTIALITE } from '@/lib/liens';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { Suivis } from './Suivis';

type Page =
  | 'accueil'
  | 'sujets'
  | 'seven-ai'
  | 'reglages'
  | 'confidentialite'
  | 'espace-jeu'
  | 'jeu'
  | 'ton-juste'
  | 'coupe-arnaque';

/** Bouton rond du profil : initiale (ou silhouette) et pastille d'état. */
export function Avatar({ size = 36 }: { size?: number }) {
  const [c, setC] = useState<Compte>({ statut: 'invite', prenom: '' });
  useEffect(() => {
    const lire = () => setC(lireCompte());
    lire();
    return ecouterCompte(lire);
  }, []);
  const etat = c.statut === 'connecte' ? 'connecté' : 'invité, non connecté';
  return (
    <Link
      href="/reglages?v=compte"
      className="avatar"
      style={{ width: size, height: size }}
      aria-label={`Profil${c.prenom ? ` de ${c.prenom}` : ''} : ${etat}`}
    >
      <AvatarContenu c={c} taille={Math.round(size * 0.5)} />
      <span className={`avatar-dot${c.statut === 'connecte' ? ' on' : ''}`} aria-hidden="true" />
    </Link>
  );
}

/**
 * Passage d'un geste entre les deux espaces de l'accueil : Six (comprendre un message, choisir quoi
 * répondre) et Seven AI (discussion libre). Deux icônes côte à côte, celle de l'espace ouvert en relief.
 */
function ChoixMode({ actif }: { actif: 'six' | 'seven' }) {
  return (
    <nav className="choix-mode" aria-label="Espace">
      <Link
        href="/"
        className="choix-mode-btn"
        aria-current={actif === 'six' ? 'page' : undefined}
        aria-label="Six : répondre à un message"
        title="Six"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M15 3.5Q9.5 8 8.4 13.2M8.4 13.2a4.6 4.6 0 1 0 1.1-1.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <Link
        href="/seven-ai"
        className="choix-mode-btn"
        aria-current={actif === 'seven' ? 'page' : undefined}
        aria-label="Seven AI : discuter"
        title="Seven AI"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M5.5 5H18Q13 11 11.7 19.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </nav>
  );
}

/** Barre du haut de l'app : menu latéral à gauche, titre, profil à droite. Remplace la barre d'onglets. */
export function AppBar({
  page,
  titre,
  onNouvelle,
}: {
  page: Page;
  titre?: string;
  onNouvelle?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function onDrawerTouchStart(e: ReactTouchEvent<HTMLDivElement>) {
    const touch = e.changedTouches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onDrawerTouchEnd(e: ReactTouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    const touch = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dx < -56 && Math.abs(dx) > Math.abs(dy) * 1.25) setOpen(false);
  }

  useEffect(() => {
    if (open) return;

    let start: { x: number; y: number } | null = null;
    const onTouchStart = (e: globalThis.TouchEvent) => {
      const touch = e.changedTouches[0];
      const target = e.target;
      if (
        !touch ||
        touch.clientX > 28 ||
        (target instanceof Element &&
          target.closest('a, button, input, textarea, select, [contenteditable="true"]'))
      ) {
        start = null;
        return;
      }
      start = { x: touch.clientX, y: touch.clientY };
    };
    const onTouchEnd = (e: globalThis.TouchEvent) => {
      const origin = start;
      const touch = e.changedTouches[0];
      start = null;
      if (!origin || !touch) return;

      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (dx > 56 && dx > Math.abs(dy) * 1.25) setOpen(true);
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchend', onTouchEnd, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab' && panel.current) {
        // Le focus reste dans le menu tant qu'il est ouvert.
        const f = panel.current.querySelectorAll<HTMLElement>('a, button');
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    const elementToRestoreFocus = opener.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.style.overflow = '';
      elementToRestoreFocus?.focus();
    };
  }, [open]);

  const item = (href: string, id: Page | '', icon: ReactNode, label: string) => (
    <Link
      href={href}
      className="drawer-item"
      aria-current={id === page ? 'page' : undefined}
      onClick={() => setOpen(false)}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );

  return (
    <>
      <header className="appbar">
        <button
          ref={opener}
          className="appbar-btn appbar-menu"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          aria-controls="six-menu"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" size={24} stroke={2.2} />
        </button>
        {page === 'accueil' || page === 'seven-ai' ? (
          <span className="appbar-title">
            <ChoixMode actif={page === 'accueil' ? 'six' : 'seven'} />
          </span>
        ) : (
          <span className="appbar-title">{titre ?? 'Six'}</span>
        )}
        <Avatar />
      </header>
      <div
        className={`drawer-scrim${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        id="six-menu"
        ref={panel}
        className={`drawer${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        onTouchStart={onDrawerTouchStart}
        onTouchEnd={onDrawerTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        <div className="drawer-head">
          <Logo small />
          <span className="word">Six</span>
          <button
            type="button"
            className="drawer-close"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
          >
            <Icon name="x" />
          </button>
        </div>
        {page === 'accueil' && onNouvelle ? (
          <button
            className="drawer-item drawer-new"
            onClick={() => {
              setOpen(false);
              onNouvelle();
            }}
          >
            <Icon name="plus" /> Nouvelle conversation
          </button>
        ) : (
          <Link href="/" className="drawer-item drawer-new" onClick={() => setOpen(false)}>
            <Icon name="plus" /> Nouvelle conversation
          </Link>
        )}
        <nav aria-label="Navigation principale" className="drawer-nav">
          {item('/', 'accueil', <Icon name="home" />, 'Accueil')}
          {item('/sujets', 'sujets', <Icon name="quoiDire" />, 'Quoi dire ?')}
          {item('/seven-ai', 'seven-ai', <Icon name="sparkles" />, 'Seven AI')}
          {item('/espace-jeu', 'espace-jeu', <Icon name="jeu" />, 'Espace jeu')}
          {item('/reglages', 'reglages', <Icon name="sliders" />, 'Réglages')}
          <a
            href={LIEN_CONFIDENTIALITE}
            className="drawer-item"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <Icon name="lock" />
            <span>Confidentialité</span>
          </a>
        </nav>
        <Suivis />
        <Link href="/reglages?v=compte" className="drawer-profile" onClick={() => setOpen(false)}>
          <ProfilLigne />
        </Link>
      </div>
    </>
  );
}

function ProfilLigne() {
  const [c, setC] = useState<Compte>({ statut: 'invite', prenom: '' });
  useEffect(() => {
    const lire = () => setC(lireCompte());
    lire();
    return ecouterCompte(lire);
  }, []);
  return (
    <>
      <span className="avatar avatar-static" aria-hidden="true">
        <AvatarContenu c={c} taille={18} />
        <span className={`avatar-dot${c.statut === 'connecte' ? ' on' : ''}`} />
      </span>
      <span className="grow">
        <b>{c.prenom || 'Invité'}</b>
        <span className="muted small">
          {c.statut === 'connecte' ? c.identifiant : 'Non connecté, tout reste ici'}
        </span>
      </span>
      <Icon name="chevron" size={18} />
    </>
  );
}
