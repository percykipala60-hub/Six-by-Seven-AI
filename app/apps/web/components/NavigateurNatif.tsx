'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { PoigneeNavigateur } from './NavigateurComplet';
import { Icon } from './Icon';

/**
 * Navigateur de Cosinus dans l'application de bureau (apps/bureau) : un vrai navigateur Chromium posé par l'app de
 * bureau exactement sur cette zone. Tous les sites s'affichent, nets et fluides. Ici, on ne fait que lui donner sa
 * place (position et taille), l'adresse à ouvrir, et suivre ce qu'il affiche.
 */

export type EtatNatif = {
  url: string;
  titre: string;
  charge: boolean;
  retour: boolean;
  avant: boolean;
};
type PontBureau = {
  version: number;
  navigateur: {
    /** Discussion affichée : ses propres onglets et son propre profil (cookies, connexions aux sites). */
    contexte?: (contexte: string) => Promise<boolean>;
    afficher: (b: { x: number; y: number; largeur: number; hauteur: number }) => Promise<boolean>;
    cacher: () => Promise<boolean>;
    ouvrir: (url: string) => Promise<boolean>;
    retour: () => Promise<boolean>;
    avant: () => Promise<boolean>;
    recharger: () => Promise<boolean>;
    etat: () => Promise<boolean>;
    surEtat: (f: (e: EtatNatif) => void) => () => void;
    nouvelOnglet?: (url?: string) => Promise<boolean>;
    choisirOnglet?: (id: number) => Promise<boolean>;
    fermerOnglet?: (id: number) => Promise<boolean>;
    rechercher?: (
      texte: string,
      options?: { suite?: boolean; precedent?: boolean },
    ) => Promise<boolean>;
    arreterRecherche?: () => Promise<boolean>;
    menu?: (x: number, y: number) => Promise<boolean>;
    surOnglets?: (f: (e: { actif: number; onglets: OngletNatif[] }) => void) => () => void;
    surCommande?: (f: (c: { type: string }) => void) => () => void;
    surRecherche?: (f: (r: { trouves: number; position: number }) => void) => () => void;
  };
};
export type OngletNatif = { id: number; titre: string; url: string; charge: boolean };

/** Le pont de l'application de bureau, s'il existe (absent dans un navigateur web ordinaire). */
export function pontBureau(): PontBureau | null {
  if (typeof window === 'undefined') return null;
  const p = (window as unknown as { sixBureau?: PontBureau }).sixBureau;
  return p?.navigateur ? p : null;
}

export function NavigateurNatif({
  contexte,
  url,
  rechargement,
  onAdresse,
  poignee,
  masque,
}: {
  /** Discussion (« chat:… » ou « cosinus:… ») : rien ne se partage avec les autres discussions. */
  contexte: string;
  url: string;
  rechargement: number;
  onAdresse: (url: string) => void;
  poignee?: Ref<PoigneeNavigateur>;
  /** Quelque chose s'affiche par-dessus la page (annotations) : le navigateur se retire le temps qu'il faut. */
  masque?: boolean;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const [charge, setCharge] = useState(false);
  const rappel = useRef(onAdresse);
  rappel.current = onAdresse;
  const derniere = useRef('');
  const pont = pontBureau();

  // En premier (avant d'afficher ou d'ouvrir une page) : les onglets de cette discussion seulement.
  useEffect(() => {
    void pont?.navigateur.contexte?.(contexte);
  }, [pont, contexte]);

  useImperativeHandle(
    poignee,
    () => ({
      retour: () => void pont?.navigateur.retour(),
      avant: () => void pont?.navigateur.avant(),
      ouvrir: (u: string) => {
        derniere.current = u;
        void pont?.navigateur.ouvrir(u);
      },
    }),
    [pont],
  );

  // Place et taille : suivies en continu (redimensionnement du volet, de la fenêtre) ; retiré en quittant la vue.
  useEffect(() => {
    const el = zone.current;
    if (!pont || !el) return;
    if (masque) {
      void pont.navigateur.cacher();
      return;
    }
    let image = 0;
    const placer = () => {
      cancelAnimationFrame(image);
      image = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        void pont.navigateur.afficher({
          x: r.left,
          y: r.top,
          largeur: r.width,
          hauteur: r.height,
        });
      });
    };
    placer();
    const obs = new ResizeObserver(placer);
    obs.observe(el);
    window.addEventListener('resize', placer);
    return () => {
      cancelAnimationFrame(image);
      obs.disconnect();
      window.removeEventListener('resize', placer);
      void pont.navigateur.cacher();
    };
  }, [pont, masque]);

  useEffect(() => {
    if (!pont) return;
    const fin = pont.navigateur.surEtat((e) => {
      setCharge(e.charge);
      // Onglet vide (nouvel onglet) : la barre d'adresse se vide aussi.
      if (!e.url || e.url === 'about:blank') {
        if (derniere.current) {
          derniere.current = '';
          rappel.current('');
        }
      } else if (/^https?:\/\//.test(e.url) && e.url !== derniere.current) {
        derniere.current = e.url;
        rappel.current(e.url);
      }
    });
    void pont.navigateur.etat();
    return fin;
  }, [pont]);

  // Adresse tapée dans la barre (pas celle où la page est allée d'elle-même).
  useEffect(() => {
    if (!pont || !url || url === derniere.current) return;
    derniere.current = url;
    void pont.navigateur.ouvrir(url);
  }, [pont, url]);

  const premier = useRef(rechargement);
  useEffect(() => {
    if (pont && rechargement !== premier.current) void pont.navigateur.recharger();
  }, [pont, rechargement]);

  return (
    <div ref={zone} className="volet-natif">
      {charge && <span className="volet-complet-charge" aria-hidden="true" />}
    </div>
  );
}

/** Rangée d'onglets du navigateur de l'app de bureau (au-dessus de la barre d'adresse). */
export function OngletsNatifs({ onNouvel }: { onNouvel?: () => void }) {
  const pont = pontBureau();
  const [etat, setEtat] = useState<{ actif: number; onglets: OngletNatif[] }>({
    actif: 0,
    onglets: [],
  });
  useEffect(() => {
    if (!pont?.navigateur.surOnglets) return;
    const fin = pont.navigateur.surOnglets(setEtat);
    void pont.navigateur.etat();
    return fin;
  }, [pont]);
  const n = pont?.navigateur;
  if (!n?.nouvelOnglet) return null;
  const libelle = (o: OngletNatif) => {
    if (o.titre && o.titre !== o.url) return o.titre;
    try {
      return new URL(o.url).hostname.replace(/^www\./, '') || 'Nouvel onglet';
    } catch {
      return 'Nouvel onglet';
    }
  };
  return (
    <div className="nav-onglets" role="tablist" aria-label="Onglets du navigateur">
      {etat.onglets.map((o) => (
        <div
          key={o.id}
          className={`nav-onglet${o.id === etat.actif ? ' actif' : ''}`}
          title={o.url || libelle(o)}
        >
          <button
            type="button"
            role="tab"
            aria-selected={o.id === etat.actif}
            className="nav-onglet-titre"
            onClick={() => void n.choisirOnglet?.(o.id)}
          >
            {o.charge && <span className="nav-onglet-charge" aria-hidden="true" />}
            <span>{libelle(o)}</span>
          </button>
          <button
            type="button"
            className="nav-onglet-fermer"
            aria-label={`Fermer l'onglet ${libelle(o)}`}
            onClick={() => void n.fermerOnglet?.(o.id)}
          >
            <Icon name="x" size={12} stroke={2.2} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="nav-onglet-nouveau"
        aria-label="Nouvel onglet (Ctrl+T)"
        title="Nouvel onglet (Ctrl+T)"
        onClick={() => {
          void n.nouvelOnglet?.();
          onNouvel?.();
        }}
      >
        <Icon name="plus" size={15} stroke={2} />
      </button>
    </div>
  );
}

/** Bouton « ⋯ » : menu de réglages du navigateur (zoom, recherche, impression, capture, données…). */
export function BoutonMenuNatif() {
  const pont = pontBureau();
  if (!pont?.navigateur.menu) return null;
  return (
    <button
      type="button"
      className="volet-action"
      aria-label="Plus d'options du navigateur"
      title="Plus d'options"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        void pont.navigateur.menu?.(Math.round(r.right - 260), Math.round(r.bottom + 4));
      }}
    >
      <Icon name="plus-points" size={16} stroke={2.4} />
    </button>
  );
}

/** Recherche dans la page (Ctrl+F ou menu ⋯) : une petite barre sous la barre d'adresse. */
export function RechercheNatif({ onHistorique }: { onHistorique: () => void }) {
  const pont = pontBureau();
  const [ouverte, setOuverte] = useState(false);
  const [texte, setTexte] = useState('');
  const [resultat, setResultat] = useState({ trouves: 0, position: 0 });
  const champ = useRef<HTMLInputElement>(null);
  const rappel = useRef(onHistorique);
  rappel.current = onHistorique;
  useEffect(() => {
    const n = pont?.navigateur;
    if (!n?.surCommande || !n.surRecherche) return;
    const a = n.surCommande((c) => {
      if (c.type === 'rechercher') {
        setOuverte(true);
        setTimeout(() => champ.current?.select(), 0);
      } else if (c.type === 'historique') rappel.current();
    });
    const b = n.surRecherche(setResultat);
    return () => {
      a();
      b();
    };
  }, [pont]);
  if (!ouverte) return null;
  const fermer = () => {
    setOuverte(false);
    setTexte('');
    void pont?.navigateur.arreterRecherche?.();
  };
  return (
    <div className="volet-recherche" role="search">
      <Icon name="search" size={14} stroke={2} />
      <input
        ref={champ}
        type="search"
        aria-label="Rechercher dans la page"
        placeholder="Rechercher dans la page"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          void pont?.navigateur.rechercher?.(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            fermer();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            void pont?.navigateur.rechercher?.(texte, { suite: true, precedent: e.shiftKey });
          }
        }}
      />
      <span className="volet-recherche-compte">
        {texte ? `${resultat.position}/${resultat.trouves}` : ''}
      </span>
      <button
        type="button"
        className="volet-action"
        aria-label="Résultat précédent"
        onClick={() => void pont?.navigateur.rechercher?.(texte, { suite: true, precedent: true })}
      >
        <Icon name="up" size={14} stroke={2} />
      </button>
      <button
        type="button"
        className="volet-action"
        aria-label="Résultat suivant"
        onClick={() => void pont?.navigateur.rechercher?.(texte, { suite: true })}
      >
        <Icon name="down" size={14} stroke={2} />
      </button>
      <button
        type="button"
        className="volet-action"
        aria-label="Fermer la recherche"
        onClick={fermer}
      >
        <Icon name="x" size={14} stroke={2} />
      </button>
    </div>
  );
}
