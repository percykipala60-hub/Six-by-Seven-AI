'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChoixCompte } from './ChoixCompte';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { useConfirmer } from './Confirmer';
import { deconnecter, type Compte } from '@/lib/compte';
import { lireEtatPremium } from '@/lib/premium-client';
import { LIEN_CONDITIONS, LIEN_CONFIDENTIALITE, LIEN_MENTIONS, SITE } from '@/lib/liens';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const CTRL = MAC ? '⌘' : 'Ctrl';

/** Raccourcis clavier réellement pris en charge par l'app. */
const RACCOURCIS: { touches: string; action: string }[] = [
  { touches: `${CTRL} ,`, action: 'Ouvrir les réglages' },
  { touches: 'Entrée', action: 'Envoyer le message' },
  { touches: 'Maj Entrée', action: 'Aller à la ligne' },
  { touches: 'Échap', action: 'Fermer un menu ou une fenêtre' },
];

/** Ctrl+, (⌘, sur Mac) ouvre les réglages, partout dans l'app, comme dans Claude. */
export function useRaccourciReglages() {
  const router = useRouter();
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === ',' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        router.push('/reglages');
      }
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [router]);
}

function Element({
  icon,
  children,
  apres,
  href,
  externe,
  onClick,
}: {
  icon: IconName;
  children: ReactNode;
  apres?: ReactNode;
  href?: string;
  externe?: boolean;
  onClick?: () => void;
}) {
  const contenu = (
    <>
      <Icon name={icon} size={18} stroke={1.75} />
      <span className="menu-compte-libelle">{children}</span>
      {apres}
    </>
  );
  if (href && externe)
    return (
      <a
        role="menuitem"
        className="menu-compte-el"
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
      >
        {contenu}
        <Icon name="externe" size={15} stroke={1.75} />
      </a>
    );
  if (href)
    return (
      <Link role="menuitem" className="menu-compte-el" href={href} onClick={onClick}>
        {contenu}
      </Link>
    );
  return (
    <button type="button" role="menuitem" className="menu-compte-el" onClick={onClick}>
      {contenu}
    </button>
  );
}

/**
 * Menu du compte, ouvert depuis l'avatar (comme le menu du compte de Claude) : adresse, réglages, raccourcis
 * clavier, aide, informations, forfait, applications et déconnexion.
 */
export function MenuCompte({
  compte,
  ancre,
  onFermer,
}: {
  compte: Compte;
  /**
   * Où s'ouvre le menu : à droite de l'avatar de la barre verticale (« haut »), sous l'avatar de la barre du haut
   * (« bas »), ou au-dessus du compte en bas du panneau de gauche (« panneau », comme dans Claude).
   */
  ancre: 'haut' | 'bas' | 'panneau';
  onFermer: () => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [plus, setPlus] = useState(false);
  const [raccourcis, setRaccourcis] = useState(false);
  const [mettreANiveau, setMettreANiveau] = useState(false);
  const [demande, demander] = useConfirmer();

  useEffect(() => {
    // Le forfait n'apparaît que lorsque le paiement est ouvert et que le compte n'est pas déjà Premium.
    void lireEtatPremium().then((e) => setMettreANiveau(Boolean(e && !e.veille && !e.premium)));
  }, []);
  useEffect(() => {
    boite.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const dehors = (e: PointerEvent) => {
      if (raccourcis || demande) return;
      if (!boite.current?.parentElement?.contains(e.target as Node)) onFermer();
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (raccourcis) setRaccourcis(false);
      else onFermer();
    };
    document.addEventListener('pointerdown', dehors, true);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('pointerdown', dehors, true);
      document.removeEventListener('keydown', touche);
    };
  }, [onFermer, raccourcis, demande]);

  return (
    <>
      <div
        ref={boite}
        className={`menu-compte menu-compte-${ancre}`}
        role="menu"
        aria-label="Menu du compte"
      >
        <p className="menu-compte-qui">
          {compte.statut === 'connecte' ? compte.identifiant : 'Invité, non connecté'}
        </p>
        <ChoixCompte />
        <Element icon="sliders" href="/reglages" onClick={onFermer} apres={<kbd>{CTRL} ,</kbd>}>
          Réglages
        </Element>
        <Element icon="lock" href={LIEN_CONFIDENTIALITE} externe onClick={onFermer}>
          Confidentialité
        </Element>
        <Element icon="horloge" href="/reglages?v=utilisation" onClick={onFermer}>
          Utilisation
        </Element>
        <Element icon="clavier" onClick={() => setRaccourcis(true)}>
          Raccourcis clavier
        </Element>
        <Element icon="shield" href="/reglages?v=capacites" onClick={onFermer}>
          Capacités
        </Element>
        <Element icon="aide" href={`${SITE}/#questions`} externe>
          Obtenir de l’aide
        </Element>
        <Element
          icon="info"
          onClick={() => setPlus((p) => !p)}
          apres={
            <Icon
              name="chevron"
              size={16}
              className={`menu-compte-fleche${plus ? ' ouverte' : ''}`}
            />
          }
        >
          En savoir plus
        </Element>
        {plus && (
          <div className="menu-compte-sous">
            <a role="menuitem" href={LIEN_CONDITIONS} target="_blank" rel="noreferrer">
              Conditions d’utilisation
            </a>
            <a role="menuitem" href={LIEN_MENTIONS} target="_blank" rel="noreferrer">
              Mentions légales
            </a>
          </div>
        )}
        <hr />
        {mettreANiveau && (
          <Element icon="haut" href="/reglages?v=facturation" onClick={onFermer}>
            Mettre le forfait à niveau
          </Element>
        )}
        <Element icon="appareils" href={`${SITE}/telecharger`} externe>
          Obtenir les applications
        </Element>
        {compte.statut === 'connecte' && (
          <>
            <hr />
            <Element
              icon="logout"
              onClick={() =>
                demander({
                  titre: 'Se déconnecter ?',
                  texte:
                    'Votre mémoire reste sur cet appareil. Vous pourrez vous reconnecter à tout moment avec votre adresse e-mail.',
                  action: 'Se déconnecter',
                  onConfirmer: async () => {
                    await deconnecter();
                    onFermer();
                  },
                })
              }
            >
              Se déconnecter
            </Element>
          </>
        )}
      </div>
      {raccourcis && (
        <div className="menu-compte-voile" onPointerDown={() => setRaccourcis(false)}>
          <div
            className="menu-compte-fenetre"
            role="dialog"
            aria-modal="true"
            aria-labelledby="raccourcis-titre"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="menu-compte-fenetre-tete">
              <h2 id="raccourcis-titre">Raccourcis clavier</h2>
              <button
                type="button"
                className="appbar-btn"
                aria-label="Fermer"
                onClick={() => setRaccourcis(false)}
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            <dl>
              {RACCOURCIS.map((r) => (
                <div key={r.action}>
                  <dt>{r.action}</dt>
                  <dd>
                    {r.touches.split(' ').map((t) => (
                      <kbd key={t}>{t}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
      {demande}
    </>
  );
}
