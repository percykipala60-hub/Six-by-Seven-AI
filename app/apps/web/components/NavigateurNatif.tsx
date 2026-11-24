'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { PoigneeNavigateur } from './NavigateurComplet';

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
    afficher: (b: { x: number; y: number; largeur: number; hauteur: number }) => Promise<boolean>;
    cacher: () => Promise<boolean>;
    ouvrir: (url: string) => Promise<boolean>;
    retour: () => Promise<boolean>;
    avant: () => Promise<boolean>;
    recharger: () => Promise<boolean>;
    etat: () => Promise<boolean>;
    surEtat: (f: (e: EtatNatif) => void) => () => void;
  };
};

/** Le pont de l'application de bureau, s'il existe (absent dans un navigateur web ordinaire). */
export function pontBureau(): PontBureau | null {
  if (typeof window === 'undefined') return null;
  const p = (window as unknown as { sixBureau?: PontBureau }).sixBureau;
  return p?.navigateur ? p : null;
}

export function NavigateurNatif({
  url,
  rechargement,
  onAdresse,
  poignee,
  masque,
}: {
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

  useImperativeHandle(
    poignee,
    () => ({
      retour: () => void pont?.navigateur.retour(),
      avant: () => void pont?.navigateur.avant(),
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
      if (/^https?:\/\//.test(e.url) && e.url !== derniere.current) {
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
