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
import { effacerChat, ecouterChats, lireChats, type ChatSeven } from '@/lib/seven-chats';
import {
  effacerConversationGardee,
  ecouterConversations,
  lireConversations,
  type ConversationGardee,
} from '@/lib/conversations';
import { memoireActive } from '@/lib/memoire';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';
import { Suivis } from './Suivis';
import { useConfirmer } from './Confirmer';

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
 * Passage d'un geste entre les deux espaces : Responsive (comprendre un message, choisir quoi
 * répondre) et Chat (discussion libre avec Six). Deux icônes côte à côte, celle de l'espace ouvert en relief.
 */
function ChoixMode({ actif }: { actif: 'six' | 'seven' }) {
  return (
    <nav className="choix-mode" aria-label="Espace">
      <Link
        href="/"
        className="choix-mode-btn"
        aria-current={actif === 'six' ? 'page' : undefined}
        aria-label="Responsive : trouver quoi répondre à une conversation"
        title="Responsive"
      >
        <Icon name="repondre" size={18} stroke={1.75} />
      </Link>
      <Link
        href="/seven-ai"
        className="choix-mode-btn"
        aria-current={actif === 'seven' ? 'page' : undefined}
        aria-label="Chat avec Six"
        title="Chat"
      >
        <Icon name="discuter" size={18} stroke={1.75} />
      </Link>
    </nav>
  );
}

/** Barre du haut de l'app : menu latéral à gauche, titre, profil à droite. Remplace la barre d'onglets. */
export function AppBar({
  page,
  titre,
  onNouvelle,
  chatActif,
}: {
  page: Page;
  titre?: string;
  onNouvelle?: () => void;
  /** Chat : discussion ouverte, en relief dans la liste du menu. */
  chatActif?: string;
}) {
  const [open, setOpenBrut] = useState(false);
  // Grand écran (ordinateur, tablette à l'horizontale) : le menu devient un panneau fixe à gauche,
  // ouvert (libellés et listes) ou réduit (colonne d'icônes). Petit écran : menu glissant, comme avant.
  const grand = useGrandEcran();
  useEffect(() => {
    if (!grand) {
      setOpenBrut(false);
      return;
    }
    try {
      setOpenBrut(localStorage.getItem(CLE_PANNEAU) === 'ouvert');
    } catch {
      /* stockage bloqué : panneau réduit */
    }
  }, [grand]);
  const setOpen = (ouvert: boolean) => {
    setOpenBrut(ouvert);
    if (grand) {
      try {
        localStorage.setItem(CLE_PANNEAU, ouvert ? 'ouvert' : 'reduit');
      } catch {
        /* préférence non gardée */
      }
    }
  };
  // Un lien du menu referme le menu glissant sur téléphone ; sur grand écran, le panneau reste.
  const apresLien = () => {
    if (!grand) setOpenBrut(false);
  };
  useEffect(() => {
    const r = document.documentElement;
    if (grand) r.dataset.panneau = open ? 'ouvert' : 'reduit';
    else delete r.dataset.panneau;
  }, [grand, open]);
  const [chats, setChats] = useState<ChatSeven[]>([]);
  const [demandeEffacer, demanderEffacer] = useConfirmer();
  // Trois éléments visibles par défaut sous chaque outil ; « Voir plus » déplie toute la liste.
  const [plusReponses, setPlusReponses] = useState(false);
  const [plusChats, setPlusChats] = useState(false);
  const [reponses, setReponses] = useState<ConversationGardee[]>([]);
  useEffect(() => {
    const lire = () => setChats(lireChats());
    lire();
    return ecouterChats(lire);
  }, []);
  useEffect(() => {
    const lire = () => setReponses(memoireActive() ? lireConversations() : []);
    lire();
    return ecouterConversations(lire);
  }, []);
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
    if (open || grand) return;

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
      if (dx > 56 && dx > Math.abs(dy) * 1.25) setOpenBrut(true);
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchend', onTouchEnd, true);
    };
  }, [open, grand]);

  useEffect(() => {
    if (!open || grand) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenBrut(false);
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
  }, [open, grand]);

  const item = (href: string, id: Page | '', icon: ReactNode, label: string) => (
    <Link
      href={href}
      className="drawer-item"
      aria-current={id === page ? 'page' : undefined}
      onClick={apresLien}
      title={label}
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
      <Rail page={page} onPanneau={() => setOpen(true)} onNouvelle={onNouvelle} />
      {demandeEffacer}
      <div
        className={`drawer-scrim${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        id="six-menu"
        ref={panel}
        className={`drawer${open ? ' open' : ''}`}
        role={grand ? 'navigation' : 'dialog'}
        aria-modal={grand ? undefined : true}
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
            aria-label={grand ? 'Réduire le panneau' : 'Fermer le menu'}
            title={grand ? 'Réduire le panneau' : undefined}
            onClick={() => setOpen(false)}
          >
            <Icon name={grand ? 'panneau' : 'x'} />
          </button>
        </div>
        {page === 'seven-ai' ? (
          <button
            className="drawer-item drawer-new"
            onClick={() => {
              apresLien();
              onNouvelle?.();
            }}
          >
            <Icon name="nouvelle" /> Nouvelle discussion
          </button>
        ) : page === 'accueil' && onNouvelle ? (
          <button
            className="drawer-item drawer-new"
            onClick={() => {
              apresLien();
              onNouvelle();
            }}
          >
            <Icon name="nouvelle" /> Nouvelle conversation
          </button>
        ) : (
          <Link href="/" className="drawer-item drawer-new" onClick={apresLien}>
            <Icon name="nouvelle" /> Nouvelle conversation
          </Link>
        )}
        {/* Chaque outil, avec juste dessous son propre historique : Responsive → réponses gardées,
            Chat → discussions avec Six. Réglages et confidentialité restent en bas. */}
        <nav aria-label="Navigation principale" className="drawer-nav">
          {item('/', 'accueil', <Icon name="repondre" />, 'Responsive')}
          {reponses.length > 0 && (
            <div className="drawer-sous" role="group" aria-label="Réponses gardées">
              {(plusReponses ? reponses : reponses.slice(0, PAR_DEFAUT)).map((g) => {
                const titre = titreReponse(g);
                return (
                  <div className="drawer-chat-ligne" key={g.id}>
                    <Link
                      href={`/?g=${encodeURIComponent(g.id)}`}
                      className="drawer-chat"
                      onClick={apresLien}
                      title={titre}
                    >
                      {titre}
                    </Link>
                    <button
                      type="button"
                      className="drawer-chat-effacer"
                      aria-label={`Effacer « ${titre} »`}
                      title="Effacer"
                      onClick={() =>
                        demanderEffacer({
                          titre: 'Effacer cette réponse ?',
                          texte: 'Elle sera effacée de ce téléphone.',
                          action: 'Effacer',
                          danger: true,
                          onConfirmer: () => effacerConversationGardee(g.id),
                        })
                      }
                    >
                      <Icon name="trash" size={15} stroke={1.75} />
                    </button>
                  </div>
                );
              })}
              {reponses.length > PAR_DEFAUT && (
                <button
                  type="button"
                  className="drawer-voir-plus"
                  aria-expanded={plusReponses}
                  onClick={() => setPlusReponses((v) => !v)}
                >
                  {plusReponses ? 'Voir moins' : `Voir plus (${reponses.length - PAR_DEFAUT})`}
                </button>
              )}
            </div>
          )}
          {item('/seven-ai', 'seven-ai', <Icon name="discuter" />, 'Chat')}
          {chats.length > 0 && (
            <div className="drawer-sous" role="group" aria-label="Discussions avec Six">
              {(plusChats ? chats : chats.slice(0, PAR_DEFAUT)).map((c) => (
                <div
                  className="drawer-chat-ligne"
                  key={c.id}
                  data-actif={page === 'seven-ai' && c.id === chatActif ? '' : undefined}
                >
                  <Link
                    href={`/seven-ai?c=${encodeURIComponent(c.id)}`}
                    className="drawer-chat"
                    aria-current={page === 'seven-ai' && c.id === chatActif ? 'page' : undefined}
                    onClick={apresLien}
                    title={c.titre}
                  >
                    {c.titre}
                  </Link>
                  <button
                    type="button"
                    className="drawer-chat-effacer"
                    aria-label={`Effacer la discussion « ${c.titre} »`}
                    title="Effacer"
                    onClick={() =>
                      demanderEffacer({
                        titre: 'Effacer cette discussion ?',
                        texte: `« ${c.titre} » sera effacée de ce téléphone.`,
                        action: 'Effacer',
                        danger: true,
                        onConfirmer: () => effacerChat(c.id),
                      })
                    }
                  >
                    <Icon name="trash" size={15} stroke={1.75} />
                  </button>
                </div>
              ))}
              {chats.length > PAR_DEFAUT && (
                <button
                  type="button"
                  className="drawer-voir-plus"
                  aria-expanded={plusChats}
                  onClick={() => setPlusChats((v) => !v)}
                >
                  {plusChats ? 'Voir moins' : `Voir plus (${chats.length - PAR_DEFAUT})`}
                </button>
              )}
            </div>
          )}
        </nav>
        <nav aria-label="Réglages" className="drawer-nav drawer-bas">
          {item('/reglages', 'reglages', <Icon name="sliders" />, 'Réglages')}
          <a
            href={LIEN_CONFIDENTIALITE}
            className="drawer-item"
            target="_blank"
            rel="noopener noreferrer"
            onClick={apresLien}
          >
            <Icon name="lock" />
            <span>Confidentialité</span>
          </a>
        </nav>
        <Suivis />
        <Link href="/reglages?v=compte" className="drawer-profile" onClick={apresLien}>
          <ProfilLigne />
        </Link>
      </div>
    </>
  );
}

const CLE_PANNEAU = 'six-panneau';
const PAR_DEFAUT = 3; // éléments d'historique visibles sous chaque outil avant « Voir plus »
const GRAND_ECRAN = '(min-width: 900px)';

/** Vrai sur grand écran (au moins 900 px de large), suivi en direct quand la fenêtre change de taille. */
function useGrandEcran(): boolean {
  const [grand, setGrand] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(GRAND_ECRAN);
    const lire = () => setGrand(mq.matches);
    lire();
    mq.addEventListener('change', lire);
    return () => mq.removeEventListener('change', lire);
  }, []);
  return grand;
}

/**
 * Grand écran, panneau réduit : colonne d'icônes à gauche (ouvrir le panneau, nouvelle conversation,
 * les deux espaces, Quoi dire, jeux ; réglages et profil en bas). Cachée sur téléphone par le CSS.
 */
function Rail({
  page,
  onPanneau,
  onNouvelle,
}: {
  page: Page;
  onPanneau: () => void;
  onNouvelle?: () => void;
}) {
  const lien = (href: string, id: Page, icon: IconName, label: string) => (
    <Link
      href={href}
      className="rail-btn"
      aria-current={id === page ? 'page' : undefined}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={20} stroke={1.75} />
    </Link>
  );
  const nouvelleLabel = page === 'seven-ai' ? 'Nouvelle discussion' : 'Nouvelle conversation';
  return (
    <nav className="rail" aria-label="Navigation">
      <button
        type="button"
        className="rail-btn"
        onClick={onPanneau}
        aria-label="Ouvrir le panneau"
        title="Ouvrir le panneau"
      >
        <Icon name="panneau" size={20} stroke={1.75} />
      </button>
      {(page === 'seven-ai' || page === 'accueil') && onNouvelle ? (
        <button
          type="button"
          className="rail-btn"
          onClick={onNouvelle}
          aria-label={nouvelleLabel}
          title={nouvelleLabel}
        >
          <Icon name="nouvelle" size={20} stroke={1.75} />
        </button>
      ) : (
        <Link href="/" className="rail-btn" aria-label={nouvelleLabel} title={nouvelleLabel}>
          <Icon name="nouvelle" size={20} stroke={1.75} />
        </Link>
      )}
      <span className="rail-sep" aria-hidden="true" />
      {lien('/', 'accueil', 'repondre', 'Responsive')}
      {lien('/seven-ai', 'seven-ai', 'discuter', 'Chat')}
      <span className="rail-fin" aria-hidden="true" />
      {lien('/reglages', 'reglages', 'sliders', 'Réglages')}
      <Avatar size={32} />
    </nav>
  );
}

/** Titre d'une réponse gardée : le réseau et le début de l'extrait (déjà masqué), sinon la réponse. */
function titreReponse(g: ConversationGardee): string {
  const base = (g.extrait || g.reponse).replace(/\s+/g, ' ').trim();
  const court = base.length > 40 ? `${base.slice(0, 39).trimEnd()}…` : base;
  return g.canal ? `${g.canal} · ${court}` : court || 'Réponse';
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
