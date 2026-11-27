'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import type { ChatSeven } from '@/lib/seven-chats';
import {
  archiverChat,
  deplacerChat,
  dupliquerChat,
  epinglerChat,
  renommerChat,
} from '@/lib/seven-chats';
import {
  basculerReplie,
  ecouterEnvironnements,
  grouperParEnvironnement,
  lireEnvironnements,
  lireReplies,
  retirerEnvironnement,
  type Environnement,
} from '@/lib/environnements';

/** Une ligne de la liste « Récents » : discussion du Chat ou de Cosinus, ou réponse gardée de Responsive. */
export type ElementRecent = {
  id: string;
  titre: string;
  href: string;
  actif: boolean;
  /** Discussion (renommable) ; absent pour une réponse gardée de Responsive. */
  chat?: ChatSeven;
  onEffacer: () => void;
};

const VISIBLES = 8;
const CLE_REPLIE = 'six-recents-replie';

/** Correspondance souple pour « Rechercher » : sans accents ni majuscules. */
const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Section « Récents » du menu, comme dans Claude : titre repliable, recherche, et sur chaque ligne un menu « … »
 * (Renommer, Effacer). Dans Cosinus, les discussions sont groupées par dossier, comme le panneau de Claude Code.
 */
export function Recents({
  elements,
  archives = [],
  parDossier,
  recherche,
  apresLien,
}: {
  elements: ElementRecent[];
  /** Discussions archivées (section repliée « Archivées », en bas). */
  archives?: ElementRecent[];
  /** Cosinus : grouper par dossier d'environnement. */
  parDossier: boolean;
  recherche: string;
  apresLien: () => void;
}) {
  const [replie, setReplie] = useState(false);
  const [tout, setTout] = useState(false);
  // Menu « … » ouvert : la ligne visée et le bouton qui l'a ouvert (pour placer la bulle à côté).
  const [menu, setMenu] = useState<{ id: string; bouton: HTMLElement } | null>(null);
  const router = useRouter();
  const [renommage, setRenommage] = useState<{ id: string; titre: string } | null>(null);
  const [envs, setEnvs] = useState<Environnement[]>([]);
  const [dossiersReplies, setDossiersReplies] = useState<string[]>([]);
  const [voirArchives, setVoirArchives] = useState(false);
  useEffect(() => {
    try {
      setReplie(localStorage.getItem(CLE_REPLIE) === '1');
    } catch {
      /* stockage bloqué */
    }
    const lire = () => {
      setEnvs(lireEnvironnements());
      setDossiersReplies(lireReplies());
    };
    lire();
    return ecouterEnvironnements(lire);
  }, []);
  const racine = useRef<HTMLDivElement>(null);

  const filtre = sansAccents(recherche.trim());
  const trouves = filtre ? elements.filter((e) => sansAccents(e.titre).includes(filtre)) : elements;
  const basculer = () => {
    setReplie((v) => {
      try {
        localStorage.setItem(CLE_REPLIE, v ? '0' : '1');
      } catch {
        /* stockage bloqué */
      }
      return !v;
    });
  };

  /**
   * « Déplacer vers » : le Chat (discussion simple) ou un environnement de Cosinus (la discussion y continue, avec
   * ses messages). L'endroit actuel n'est pas proposé.
   */
  const destinations = (c: ChatSeven): ActionMenu[] => [
    ...(c.mode === 'sixtouch'
      ? [{ libelle: 'Chat', touche: '', faire: () => deplacerChat(c.id, { mode: 'chat' }) }]
      : []),
    ...envs
      .filter((x) => !(c.mode === 'sixtouch' && c.environnement === x.id))
      .map((x) => ({
        libelle: x.type === 'cloud' ? `Cosinus · Cloud · ${x.nom}` : `Cosinus · ${x.nom}`,
        touche: '',
        faire: () =>
          deplacerChat(c.id, {
            mode: 'sixtouch',
            environnement: x.id,
            ...(x.dossiers[0] ? { dossier: x.dossiers[0] } : {}),
          }),
      })),
  ];

  const ligne = (e: ElementRecent) => (
    <div className="recent" key={e.id} data-actif={e.actif ? '' : undefined}>
      {renommage?.id === e.id ? (
        <form
          className="recent-renommer"
          onSubmit={(ev) => {
            ev.preventDefault();
            renommerChat(e.id, renommage.titre);
            setRenommage(null);
          }}
        >
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- « Renommer » vient d'être choisi
            autoFocus
            value={renommage.titre}
            aria-label="Nouveau titre"
            onChange={(ev) => setRenommage({ id: e.id, titre: ev.target.value })}
            onBlur={() => {
              renommerChat(e.id, renommage.titre);
              setRenommage(null);
            }}
            onKeyDown={(ev) => ev.key === 'Escape' && setRenommage(null)}
          />
        </form>
      ) : (
        <Link
          href={e.href}
          className="recent-lien"
          aria-current={e.actif ? 'page' : undefined}
          onClick={apresLien}
          title={e.titre}
        >
          {e.chat?.epingle && (
            <span className="recent-epingle" aria-label="Épinglée">
              <Icon name="epingle" size={12} stroke={1.9} />
            </span>
          )}
          {e.titre}
        </Link>
      )}
      <button
        type="button"
        className="recent-plus"
        aria-label={`Options de « ${e.titre} »`}
        aria-haspopup="menu"
        aria-expanded={menu?.id === e.id}
        onClick={(ev) => setMenu(menu?.id === e.id ? null : { id: e.id, bouton: ev.currentTarget })}
      >
        <Icon name="points" size={16} stroke={3} />
      </button>
      {menu?.id === e.id && (
        <MenuLigne
          bouton={menu.bouton}
          onFermer={() => setMenu(null)}
          actions={[
            ...(e.chat
              ? [
                  {
                    libelle: e.chat.epingle ? 'Désépingler' : 'Épingler',
                    touche: 'P',
                    faire: () => epinglerChat(e.id, !e.chat?.epingle),
                  },
                  {
                    libelle: 'Renommer',
                    touche: 'R',
                    faire: () => setRenommage({ id: e.id, titre: e.titre }),
                  },
                  {
                    libelle: 'Dupliquer',
                    touche: 'F',
                    faire: () => {
                      const copie = dupliquerChat(e.id);
                      if (copie) {
                        apresLien();
                        router.push(`${e.href.split('?')[0]}?c=${encodeURIComponent(copie)}`);
                      }
                    },
                  },
                  'separateur' as const,
                  {
                    libelle: 'Déplacer vers',
                    touche: '',
                    faire: () => {},
                    sous: destinations(e.chat),
                  },
                  'separateur' as const,
                  {
                    libelle: e.chat.archive ? 'Désarchiver' : 'Archiver',
                    touche: 'A',
                    faire: () => archiverChat(e.id, !e.chat?.archive),
                  },
                ]
              : []),
            { libelle: 'Effacer', touche: 'D', danger: true, faire: e.onEffacer },
          ]}
        />
      )}
    </div>
  );

  let contenu;
  if (parDossier && !filtre) {
    const groupes = grouperParEnvironnement(
      trouves.map((e) => ({
        ...e,
        maj: e.chat?.maj ?? 0,
        dossier: e.chat?.dossier,
        environnement: e.chat?.environnement,
      })),
      envs,
    );
    contenu = groupes.map((g) => {
      const ferme = dossiersReplies.includes(g.id);
      const nouvelle = g.environnement
        ? `/cosinus?e=${encodeURIComponent(g.id)}`
        : g.dossier
          ? `/cosinus?d=${encodeURIComponent(g.dossier)}`
          : '';
      return (
        <div className="recents-dossier" key={g.id}>
          <div className="recents-dossier-tete">
            <button
              type="button"
              className="recents-dossier-titre"
              aria-expanded={!ferme}
              title={
                g.environnement?.dossiers.join('\n') || g.dossier || 'Discussions sans dossier'
              }
              onClick={() => basculerReplie(g.id)}
            >
              <span>{g.nom}</span>
              <Icon name="down" size={13} stroke={2} />
            </button>
            {nouvelle && (
              <Link
                href={nouvelle}
                className="recents-dossier-nouvelle"
                aria-label={`Nouvelle discussion dans ${g.nom}`}
                title="Nouvelle discussion dans cet environnement"
                onClick={apresLien}
              >
                <Icon name="plus" size={14} stroke={2} />
              </Link>
            )}
          </div>
          {!ferme &&
            (g.chats.length ? (
              g.chats.map(ligne)
            ) : (
              <p className="recents-vide">
                Aucune discussion
                {g.environnement && (
                  <>
                    {' · '}
                    <button type="button" onClick={() => retirerEnvironnement(g.id)}>
                      Retirer
                    </button>
                  </>
                )}
              </p>
            ))}
        </div>
      );
    });
  } else {
    contenu = (tout || filtre ? trouves : trouves.slice(0, VISIBLES)).map(ligne);
  }

  return (
    <div className="recents" ref={racine}>
      <button type="button" className="recents-titre" aria-expanded={!replie} onClick={basculer}>
        Récents <Icon name="down" size={13} stroke={2} />
      </button>
      {!replie && (
        <div className="recents-liste">
          {contenu}
          {filtre && trouves.length === 0 && <p className="recents-vide">Aucun résultat.</p>}
          {!filtre && !parDossier && trouves.length > VISIBLES && (
            <button type="button" className="recents-tout" onClick={() => setTout((v) => !v)}>
              {tout ? 'Voir moins' : 'Voir tout'}
            </button>
          )}
          {!filtre && elements.length === 0 && (
            <p className="recents-vide">Vos discussions apparaîtront ici.</p>
          )}
          {archives.length > 0 && (
            <div className="recents-archives">
              <button
                type="button"
                className="recents-titre"
                aria-expanded={voirArchives}
                onClick={() => setVoirArchives((v) => !v)}
              >
                Archivées ({archives.length}) <Icon name="down" size={13} stroke={2} />
              </button>
              {voirArchives &&
                (filtre
                  ? archives.filter((e) => sansAccents(e.titre).includes(filtre))
                  : archives
                ).map(ligne)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ActionMenu = {
  libelle: string;
  touche: string;
  danger?: boolean;
  faire: () => void;
  /** Sous-menu (« Déplacer vers › ») : s'ouvre à côté, au survol ou au clic. */
  sous?: ActionMenu[];
};

/**
 * Menu « … » d'une discussion, comme dans Claude : une bulle posée au-dessus de tout (hors de la liste, donc
 * jamais coupée ni source de défilement), sous le bouton ou au-dessus s'il n'y a pas la place. Elle disparaît
 * au clic ailleurs, avec Échap, au défilement ou au redimensionnement. Chaque action a sa lettre (P, R, F, D).
 */
function MenuLigne({
  bouton,
  actions,
  onFermer,
}: {
  bouton: HTMLElement;
  actions: (ActionMenu | 'separateur')[];
  onFermer: () => void;
}) {
  const bulle = useRef<HTMLDivElement>(null);
  const sousBulle = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [sous, setSous] = useState<{
    libelle: string;
    actions: ActionMenu[];
    ligne: HTMLElement;
  } | null>(null);
  const [posSous, setPosSous] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!sous) {
      setPosSous(null);
      return;
    }
    const r = sous.ligne.getBoundingClientRect();
    const h = sousBulle.current?.offsetHeight ?? 0;
    const w = sousBulle.current?.offsetWidth ?? 0;
    const marge = 8;
    // À droite de la bulle, sinon à gauche ; aligné sur la ligne, sans sortir de l'écran.
    const left =
      r.right + 4 + w <= window.innerWidth - marge ? r.right + 4 : Math.max(marge, r.left - 4 - w);
    setPosSous({ top: Math.min(Math.max(marge, r.top - 5), window.innerHeight - h - marge), left });
  }, [sous]);
  const executer = (a: ActionMenu) => {
    onFermer();
    a.faire();
  };

  useLayoutEffect(() => {
    const r = bouton.getBoundingClientRect();
    const h = bulle.current?.offsetHeight ?? 0;
    const w = bulle.current?.offsetWidth ?? 0;
    const marge = 8;
    const enDessous = r.bottom + 4 + h <= window.innerHeight - marge;
    setPos({
      top: enDessous ? r.bottom + 4 : Math.max(marge, r.top - 4 - h),
      left: Math.min(Math.max(marge, r.right - w), window.innerWidth - w - marge),
    });
    bulle.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [bouton]);

  useEffect(() => {
    const dehors = (e: Event) => {
      const cible = e.target as Node;
      if (
        bulle.current?.contains(cible) ||
        sousBulle.current?.contains(cible) ||
        bouton.contains(cible)
      )
        return;
      onFermer();
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sous) {
          setSous(null);
          return;
        }
        onFermer();
        bouton.focus();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const a = actions.find(
        (x): x is ActionMenu =>
          x !== 'separateur' && !!x.touche && x.touche.toLowerCase() === e.key.toLowerCase(),
      );
      if (a) {
        e.preventDefault();
        executer(a);
      }
    };
    const fermer = () => onFermer();
    document.addEventListener('pointerdown', dehors, true);
    document.addEventListener('keydown', clavier);
    window.addEventListener('scroll', fermer, true);
    window.addEventListener('resize', fermer);
    window.addEventListener('blur', fermer);
    return () => {
      document.removeEventListener('pointerdown', dehors, true);
      document.removeEventListener('keydown', clavier);
      window.removeEventListener('scroll', fermer, true);
      window.removeEventListener('resize', fermer);
      window.removeEventListener('blur', fermer);
    };
  });

  return createPortal(
    <div
      ref={bulle}
      className="recent-menu"
      role="menu"
      style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
    >
      {actions.map((a, i) =>
        a === 'separateur' ? (
          <hr key={`s${i}`} />
        ) : (
          <button
            key={a.libelle}
            type="button"
            role="menuitem"
            className={a.danger ? 'danger' : undefined}
            aria-haspopup={a.sous ? 'menu' : undefined}
            aria-expanded={a.sous ? sous?.libelle === a.libelle : undefined}
            onPointerEnter={(ev) => {
              if (a.sous) setSous({ libelle: a.libelle, actions: a.sous, ligne: ev.currentTarget });
              else setSous(null);
            }}
            onClick={(ev) =>
              a.sous
                ? setSous(
                    sous?.libelle === a.libelle
                      ? null
                      : { libelle: a.libelle, actions: a.sous, ligne: ev.currentTarget },
                  )
                : executer(a)
            }
          >
            <span>{a.libelle}</span>
            {a.sous ? (
              <Icon name="suivant" size={13} stroke={2} />
            ) : (
              <kbd aria-hidden="true">{a.touche}</kbd>
            )}
          </button>
        ),
      )}
      {sous &&
        createPortal(
          <div
            ref={sousBulle}
            className="recent-menu recent-sous-menu"
            role="menu"
            aria-label={sous.libelle}
            style={posSous ?? { top: -9999, left: -9999 }}
          >
            {sous.actions.length === 0 ? (
              <p className="recent-menu-vide">Aucun autre endroit.</p>
            ) : (
              sous.actions.map((x) => (
                <button key={x.libelle} type="button" role="menuitem" onClick={() => executer(x)}>
                  <span>{x.libelle}</span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>,
    document.body,
  );
}
