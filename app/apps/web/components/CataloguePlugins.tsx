'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SKILLS } from '@/lib/skills-cosinus';
import { lireGithub } from '@/lib/github';
import { estBureau } from '@/lib/plateforme';
import { Icon, type IconName } from './Icon';

type Outil = {
  logo?: string;
  nom: string;
  description: string;
  icone: IconName;
  couleur: string;
  vue: string;
};
const connecteurs: Outil[] = [
  {
    nom: 'GitHub',
    logo: '/plugins/github.svg',
    description: 'Connecter des dépôts et gérer leurs accès',
    icone: 'code',
    couleur: '#45526d',
    vue: 'cloud',
  },
  {
    nom: 'ElevenLabs',
    logo: '/plugins/elevenlabs.svg',
    description: 'Choisir une voix pour lire les réponses',
    icone: 'vocal',
    couleur: '#925dba',
    vue: 'voix',
  },
  {
    nom: 'Applications connectées',
    description: 'Gérer les notifications entre applications',
    icone: 'bell',
    couleur: '#368477',
    vue: 'apps',
  },
];
const skills: Outil[] = SKILLS.map((s) => ({
  nom: s.nom,
  description: s.description,
  icone: 'plugins',
  couleur: 'var(--muted)',
  vue: 'focus',
}));
export function CataloguePlugins() {
  const [recherche, setRecherche] = useState('');
  const [ajouter, setAjouter] = useState(false);
  const [type, setType] = useState('Tous');
  const [tri, setTri] = useState(false);
  const [tout, setTout] = useState(false);
  const [actifs, setActifs] = useState<Outil[]>([]);
  useEffect(() => {
    let vivant = true;
    const natifs: Outil[] = estBureau()
      ? [
          {
            nom: 'Navigateur de Six',
            description: 'Inclus · Navigateur local',
            icone: 'globe',
            couleur: '#507bb6',
            vue: 'cosinus',
          },
        ]
      : [];
    setActifs(natifs);
    void lireGithub().then((e) => {
      if (vivant && 'relie' in e && e.relie) setActifs([...natifs, connecteurs[0]]);
    });
    return () => {
      vivant = false;
    };
  }, []);
  const actions = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ajouter) return;
    const dehors = (e: PointerEvent) => {
      if (!actions.current?.contains(e.target as Node)) setAjouter(false);
    };
    const fermer = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAjouter(false);
        bouton.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', fermer);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', fermer);
    };
  }, [ajouter]);
  const normaliser = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const proposes = [
    ...(type !== 'Skills' ? connecteurs : []),
    ...(type !== 'Connecteurs' ? skills : []),
  ].filter((o) => !actifs.includes(o));
  const groupes = [
    { titre: 'Actifs', outils: type === 'Skills' ? [] : actifs },
    { titre: 'À découvrir', outils: proposes },
  ];
  const visibles = groupes
    .map((g) => ({
      ...g,
      outils: g.outils
        .filter((o) =>
          normaliser(o.nom + ' ' + o.description).includes(normaliser(recherche.trim())),
        )
        .sort((a, b) => (tri ? a.nom.localeCompare(b.nom, 'fr') : 0)),
    }))
    .filter((g) => g.outils.length);
  return (
    <section className="catalogue-six">
      <header>
        <div>
          <h1>Plug-ins</h1>
          <Link
            className="catalogue-options"
            aria-label="Paramètres des plug-ins"
            title="Paramètres des plug-ins"
            href="/reglages?v=plugins"
          >
            •••
          </Link>
        </div>
        <div className="catalogue-actions" ref={actions}>
          <label>
            <Icon name="search" size={16} />
            <input
              aria-label="Rechercher un plug-in"
              placeholder="Rechercher…"
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </label>
          <div className="catalogue-types" role="group" aria-label="Type de plug-in">
            {['Tous', 'Connecteurs', 'Skills'].map((t) => (
              <button type="button" key={t} aria-pressed={type === t} onClick={() => setType(t)}>
                {t}
              </button>
            ))}
          </div>
          <button
            className="catalogue-tri"
            type="button"
            aria-pressed={tri}
            aria-label="Trier par nom"
            onClick={() => setTri(!tri)}
          >
            <Icon name="filtre" size={16} />
          </button>
          <button
            ref={bouton}
            type="button"
            aria-expanded={ajouter}
            onClick={() => setAjouter(!ajouter)}
          >
            Ajouter <Icon name="chevron" size={12} />
          </button>
          {ajouter && (
            <div className="catalogue-menu">
              <Link href="/reglages?v=cloud">Connecter GitHub</Link>
              <Link href="/reglages?v=voix">Configurer une voix</Link>
            </div>
          )}
        </div>
      </header>
      {visibles.map((g) => (
        <section key={g.titre}>
          <div className="catalogue-section">
            <h2>{g.titre}</h2>
            {g.titre === 'À découvrir' && g.outils.length > 6 && (
              <button type="button" aria-expanded={tout} onClick={() => setTout(!tout)}>
                {tout ? 'Réduire' : 'Tout afficher →'}
              </button>
            )}
          </div>
          <div className={'catalogue-grille' + (g.titre === 'Actifs' ? ' catalogue-actifs' : '')}>
            {(g.titre === 'À découvrir' && !tout ? g.outils.slice(0, 6) : g.outils).map((o) => (
              <Link key={o.nom} href={'/reglages?v=' + o.vue}>
                <i style={{ background: o.logo ? 'white' : o.couleur }}>
                  {o.logo ? (
                    <Image src={o.logo} width={20} height={20} alt="" unoptimized />
                  ) : (
                    <Icon name={o.icone} size={18} />
                  )}
                </i>
                <span>
                  <span>{o.nom}</span>
                  <small>{o.description}</small>
                  {g.titre !== 'Actifs' && (
                    <small>{skills.includes(o) ? 'Skill · De Six' : 'Connecteur'}</small>
                  )}
                </span>
                <Icon name="chevron" size={16} />
              </Link>
            ))}
          </div>
        </section>
      ))}
      {!visibles.length && <p role="status">Aucun plug-in trouvé.</p>}
    </section>
  );
}
