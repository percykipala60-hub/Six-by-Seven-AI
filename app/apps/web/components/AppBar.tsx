'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import Link from 'next/link';
import { ecouterCompte, lireCompte, type Compte } from '@/lib/compte';
import { AvatarContenu } from './AvatarContenu';
import { MenuCompte, useRaccourciReglages } from './MenuCompte';
import { effacerChat, ecouterChats, lireChats, type ChatSeven } from '@/lib/seven-chats';
import { useDiscussionsDistantes } from '@/lib/remote-distant';
import { Recents, type ElementRecent } from './Recents';
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
  | 'plugins'
  | 'remote'
  | 'artefacts'
  | 'projets'
  | 'taches'
  | 'accueil'
  | 'sujets'
  | 'seven-ai'
  | 'sixtouch'
  | 'reglages'
  | 'confidentialite'
  | 'espace-jeu'
  | 'jeu'
  | 'ton-juste'
  | 'coupe-arnaque';

/** Bouton rond du profil : initiale (ou silhouette) et pastille d'état. Ouvre le menu du compte. */
export function Avatar({ size = 36, ancre = 'bas' }: { size?: number; ancre?: 'haut' | 'bas' }) {
  const [c, setC] = useState<Compte>({ statut: 'invite', prenom: '' });
  const [menu, setMenu] = useState(false);
  const fermer = useCallback(() => setMenu(false), []);
  useEffect(() => {
    const lire = () => setC(lireCompte());
    lire();
    return ecouterCompte(lire);
  }, []);
  const etat = c.statut === 'connecte' ? 'connecté' : 'invité, non connecté';
  return (
    <span className="avatar-ancre">
      <button
        type="button"
        className="avatar"
        style={{ width: size, height: size }}
        aria-label={`Menu du compte${c.prenom ? ` de ${c.prenom}` : ''} : ${etat}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
      >
        <AvatarContenu c={c} taille={Math.round(size * 0.5)} />
        <span className={`avatar-dot${c.statut === 'connecte' ? ' on' : ''}`} aria-hidden="true" />
      </button>
      {menu && <MenuCompte compte={c} ancre={ancre} onFermer={fermer} />}
    </span>
  );
}

/**
 * Passage d'un geste entre les deux espaces : Responsive (comprendre un message, choisir quoi
 * répondre) et Chat (discussion libre avec Six). Deux icônes côte à côte, celle de l'espace ouvert en relief.
 */
function ChoixMode({ actif }: { actif: 'six' | 'seven' | 'sixtouch' }) {
  return (
    <nav className="choix-mode" aria-label="Espace">
      <Link
        href="/responsive"
        className="choix-mode-btn"
        aria-current={actif === 'six' ? 'page' : undefined}
        aria-label="Responsive : trouver quoi répondre à une conversation"
        title="Responsive"
      >
        <Icon name="repondre" size={18} stroke={1.75} />
      </Link>
      <Link
        href="/chat"
        className="choix-mode-btn"
        aria-current={actif === 'seven' ? 'page' : undefined}
        aria-label="Chat avec Six"
        title="Chat"
      >
        <Icon name="discuter" size={18} stroke={1.75} />
      </Link>
      <Link
        href="/cosinus"
        className="choix-mode-btn"
        aria-current={actif === 'sixtouch' ? 'page' : undefined}
        aria-label="Cosinus : Six travaille pour vous (navigateur, fichiers)"
        title="Cosinus"
      >
        <Icon name="sixtouch" size={18} stroke={1.75} />
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
  outils,
  outilPanneau,
}: {
  page: Page;
  titre?: string;
  onNouvelle?: () => void;
  /** Boutons propres à la page, à droite de la barre, avant le profil (Chat : volet d'outils). */
  outils?: ReactNode;
  outilPanneau?: ReactNode;
  /** Chat : discussion ouverte, en relief dans la liste du menu. */
  chatActif?: string;
}) {
  const [open, setOpenBrut] = useState(false);
  useRaccourciReglages();
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
    // Page sans panneau (Confidentialité, Conditions…) : le contenu ne garde pas le décalage.
    return () => {
      delete r.dataset.panneau;
    };
  }, [grand, open]);
  const [chats, setChats] = useState<ChatSeven[]>([]);
  const [demandeEffacer, demanderEffacer] = useConfirmer();
  // Trois éléments visibles par défaut sous chaque outil ; « Voir plus » déplie toute la liste.
  const [recherche, setRecherche] = useState('');
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
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
  // « Récents » : les discussions de l'espace ouvert (Responsive : réponses gardées ; ailleurs : toutes).
  const effacerDiscussion = (c: ChatSeven) =>
    demanderEffacer({
      titre: 'Effacer cette discussion ?',
      texte: `« ${c.titre} » sera effacée de cet appareil.`,
      action: 'Effacer',
      danger: true,
      onConfirmer: () => effacerChat(c.id),
    });
  const versRecent = (c: ChatSeven): ElementRecent => {
    const cosinus = c.mode === 'sixtouch';
    return {
      id: c.id,
      titre: c.titre,
      href: `${cosinus ? '/cosinus' : '/chat'}?c=${encodeURIComponent(c.id)}`,
      actif: c.id === chatActif && page === (cosinus ? 'sixtouch' : 'seven-ai'),
      chat: c,
      onEffacer: () => effacerDiscussion(c),
    };
  };
  const recents: ElementRecent[] =
    page === 'accueil'
      ? reponses.map((g) => ({
          id: g.id,
          titre: titreReponse(g),
          href: `/responsive?g=${encodeURIComponent(g.id)}`,
          actif: false,
          onEffacer: () =>
            demanderEffacer({
              titre: 'Effacer cette réponse ?',
              texte: 'Elle sera effacée de cet appareil.',
              action: 'Effacer',
              danger: true,
              onConfirmer: () => effacerConversationGardee(g.id),
            }),
        }))
      : page === 'sixtouch'
        ? chats.filter((c) => c.mode === 'sixtouch' && !c.archive).map(versRecent)
        : page === 'seven-ai'
          ? chats.filter((c) => c.mode !== 'sixtouch' && !c.archive).map(versRecent)
          : chats.filter((c) => !c.archive).map(versRecent);
  // Remote : les discussions des autres appareils du compte s'ajoutent aux Récents (logo Remote) et s'ouvrent dans
  // l'écran de discussion normal (?r=…). Celles de cet appareil y sont déjà.
  const distantes = useDiscussionsDistantes(page !== 'accueil');
  const locales = new Set(chats.map((c) => c.id));
  const baseRemote = page === 'sixtouch' ? '/cosinus' : '/chat';
  if (page !== 'accueil')
    recents.unshift(
      ...distantes
        .filter((d) => !locales.has(d.discussion))
        .map((d): ElementRecent => ({
          id: 'remote-' + d.discussion,
          titre: d.titre || 'Discussion',
          href: `${baseRemote}?r=${encodeURIComponent(d.discussion)}`,
          actif: false,
          remote: true,
          onEffacer: () => {},
        })),
    );
  // Discussions archivées de l'espace ouvert (section « Archivées » en bas de « Récents »).
  const archives: ElementRecent[] =
    page === 'accueil'
      ? []
      : chats
          .filter(
            (c) =>
              c.archive &&
              (page === 'sixtouch'
                ? c.mode === 'sixtouch'
                : page === 'seven-ai'
                  ? c.mode !== 'sixtouch'
                  : true),
          )
          .map(versRecent);
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
        {page === 'accueil' || page === 'seven-ai' || page === 'sixtouch' ? (
          <span className="appbar-title">
            <ChoixMode
              actif={page === 'accueil' ? 'six' : page === 'sixtouch' ? 'sixtouch' : 'seven'}
            />
          </span>
        ) : (
          <span className="appbar-title">{titre ?? 'Six'}</span>
        )}
        {outils}
        <Avatar />
      </header>
      <Rail
        page={page}
        onPanneau={() => setOpen(true)}
        onNouvelle={onNouvelle}
        outilPanneau={outilPanneau}
      />
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
        {page === 'seven-ai' || page === 'sixtouch' ? (
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
          <Link href="/responsive" className="drawer-item drawer-new" onClick={apresLien}>
            <Icon name="nouvelle" /> Nouvelle conversation
          </Link>
        )}
        {/* Comme dans Claude : Rechercher, les trois espaces, puis « Récents » (les discussions de l'espace ouvert ;
            dans Cosinus, groupées par dossier comme dans Claude Code). */}
        <nav aria-label="Navigation principale" className="drawer-nav">
          <button
            type="button"
            className="drawer-item"
            aria-expanded={rechercheOuverte}
            onClick={() => {
              setRechercheOuverte((v) => !v);
              setRecherche('');
            }}
          >
            <Icon name="search" />
            <span>Rechercher</span>
          </button>
          {rechercheOuverte && (
            <input
              className="drawer-recherche"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- la recherche vient d'être ouverte par un clic
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setRechercheOuverte(false);
                  setRecherche('');
                }
              }}
              placeholder="Rechercher une discussion"
              aria-label="Rechercher une discussion"
            />
          )}
          {item('/projets', 'projets', <Icon name="projets" />, 'Projets')}
          {item('/artefacts', 'artefacts', <Icon name="artefacts" />, 'Artéfacts')}
          {item('/plugins', 'plugins', <Icon name="plugins" />, 'Plug-ins')}
          {/* « Plus » ouvre un petit menu à côté (tâches planifiées), au lieu de pousser la liste vers le bas. */}
          <details className="drawer-plus">
            <summary className="drawer-item">
              <Icon name="plus-points" />
              Plus
            </summary>
            <div className="drawer-plus-menu">
              {item('/taches', 'taches', <Icon name="horloge" />, 'Tâches planifiées')}
            </div>
          </details>
          {item('/responsive', 'accueil', <Icon name="repondre" />, 'Responsive')}
          {item('/chat', 'seven-ai', <Icon name="discuter" />, 'Chat')}
          {item('/cosinus', 'sixtouch', <Icon name="sixtouch" />, 'Cosinus')}
        </nav>
        <Recents
          elements={recents}
          archives={archives}
          parDossier={page === 'sixtouch'}
          recherche={recherche}
          apresLien={apresLien}
        />
        <Suivis />
        {outilPanneau}
        <ProfilLigne />
      </div>
    </>
  );
}

const CLE_PANNEAU = 'six-panneau';
const GRAND_ECRAN = '(min-width: 768px)'; // même seuil que la barre verticale (.rail, app/globals.css)

/** Vrai sur grand écran (au moins 768 px de large), suivi en direct quand la fenêtre change de taille. */
function useGrandEcran(): boolean {
  const [grand, setGrand] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(GRAND_ECRAN);
    const lire = () => setGrand(mq.matches);
    // Passage du seuil pendant que la fenêtre change de taille : html.bascule anime la barre qui arrive (globals.css).
    let fin: ReturnType<typeof setTimeout> | undefined;
    const basculer = () => {
      const racine = document.documentElement;
      racine.classList.add('bascule');
      clearTimeout(fin);
      fin = setTimeout(() => racine.classList.remove('bascule'), 600);
      lire();
    };
    lire();
    mq.addEventListener('change', basculer);
    return () => {
      mq.removeEventListener('change', basculer);
      clearTimeout(fin);
      document.documentElement.classList.remove('bascule');
    };
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
  outilPanneau,
}: {
  page: Page;
  onPanneau: () => void;
  onNouvelle?: () => void;
  outilPanneau?: ReactNode;
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
  const nouvelleLabel =
    page === 'seven-ai' || page === 'sixtouch' ? 'Nouvelle discussion' : 'Nouvelle conversation';
  return (
    <nav className="rail" aria-label="Navigation">
      {/* Logo Six en tête : un appui ouvre le panneau complet. */}
      <button
        type="button"
        className="rail-logo"
        onClick={onPanneau}
        aria-label="Ouvrir le panneau"
        title="Ouvrir le panneau"
      >
        <Logo label="" small />
      </button>
      {(page === 'seven-ai' || page === 'sixtouch' || page === 'accueil') && onNouvelle ? (
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
        <Link
          href="/responsive"
          className="rail-btn"
          aria-label={nouvelleLabel}
          title={nouvelleLabel}
        >
          <Icon name="nouvelle" size={20} stroke={1.75} />
        </Link>
      )}
      {lien('/plugins', 'plugins', 'plugins', 'Plug-ins')}
      {lien('/responsive', 'accueil', 'repondre', 'Responsive')}
      {lien('/chat', 'seven-ai', 'discuter', 'Chat')}
      {lien('/cosinus', 'sixtouch', 'sixtouch', 'Cosinus')}
      {lien('/projets', 'projets', 'file', 'Projets')}
      {lien('/taches', 'taches', 'file', 'Tâches planifiées')}
      <span className="rail-fin" aria-hidden="true" />
      {lien('/reglages', 'reglages', 'sliders', 'Réglages')}
      {outilPanneau}
      <Avatar size={32} ancre="haut" />
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
  const [menu, setMenu] = useState(false);
  const fermer = useCallback(() => setMenu(false), []);
  useEffect(() => {
    const lire = () => setC(lireCompte());
    lire();
    return ecouterCompte(lire);
  }, []);
  return (
    <div className="drawer-profile-ancre">
      <button
        type="button"
        className="drawer-profile"
        aria-label={`Menu du compte de ${c.prenom || 'l’invité'}`}
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((ouvert) => !ouvert)}
      >
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
      </button>
      {menu && <MenuCompte compte={c} ancre="panneau" onFermer={fermer} />}
    </div>
  );
}
