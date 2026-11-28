'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { lireGithub, connecterGithub, type EtatGithub } from '@/lib/github';
import { estBureau } from '@/lib/plateforme';
import { SKILLS } from '@/lib/skills-cosinus';
import styles from './PluginsParametres.module.css';

type Filtre = 'Tous' | 'Connecteurs' | 'Skills';
type Entree = { nom: string; meta: string; logo?: string; detail: string; href: string };
const skills: Entree[] = SKILLS.map((s) => ({
  nom: s.nom,
  meta: 'Skill · De Six',
  detail: s.description,
  href: '/reglages?v=focus',
}));
const normaliser = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function PluginsParametres() {
  const [filtre, setFiltre] = useState<Filtre>('Tous');
  const [q, setQ] = useState('');
  const [tri, setTri] = useState(false);
  const [detail, setDetail] = useState('');
  const [deplie, setDeplie] = useState(false);
  const [github, setGithub] = useState<EtatGithub | null>(null);
  const [bureau, setBureau] = useState(false);
  useEffect(() => {
    let actif = true;
    setBureau(estBureau());
    void lireGithub().then((etat) => {
      if (actif) setGithub(etat);
    });
    return () => {
      actif = false;
    };
  }, []);
  const trouve = (e: Entree) => normaliser(e.nom + ' ' + e.meta).includes(normaliser(q.trim()));
  const visibles = (liste: Entree[]) => {
    const l = liste.filter(trouve);
    return tri ? l.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) : l;
  };
  const git: Entree = {
    nom: 'GitHub',
    meta: 'Intégration native · Par GitHub',
    logo: '/plugins/github.svg',
    detail:
      github && 'relie' in github && github.relie
        ? 'Compte relié : ' + github.login
        : 'Choisissez les dépôts auxquels Six peut accéder.',
    href: '/reglages?v=cloud',
  };
  const nav: Entree = {
    nom: 'Navigateur de Six',
    meta: 'Inclus · Navigateur local',
    detail: 'Ouvrez le navigateur depuis le volet de Cosinus sur votre ordinateur.',
    href: '/cosinus',
  };
  const etatConnu = github && 'relie' in github;
  const actifs = visibles([...(bureau ? [nav] : []), ...(etatConnu && github.relie ? [git] : [])]);
  const inactifs = visibles(etatConnu && !github.relie ? [git] : []);
  const inclus = visibles(skills);
  function ligne(e: Entree, connecter = false) {
    return (
      <div className={styles.ligne} key={e.nom}>
        <span className={styles.icone}>
          {e.logo ? (
            <Image src={e.logo} width={26} height={26} alt="" unoptimized />
          ) : (
            <Icon name={e === nav ? 'globe' : 'plugins'} size={17} />
          )}
        </span>
        <div className={styles.corps}>
          <div className={styles.identite}>
            <span>{e.nom}</span>
            <small>{e.meta}</small>
          </div>
          {connecter && github && 'adresse' in github && (
            <button className={styles.connecter} onClick={() => connecterGithub(github.adresse)}>
              Connecter
            </button>
          )}
          <button
            className={styles.points}
            aria-label={'Options pour ' + e.nom}
            aria-expanded={detail === e.nom}
            onClick={() => setDetail(detail === e.nom ? '' : e.nom)}
          >
            •••
          </button>
        </div>
        {detail === e.nom && (
          <div className={styles.precision}>
            {e.detail} <Link href={e.href}>Ouvrir</Link>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <div className={styles.barre}>
        <label>
          <Icon name="search" size={17} />
          <input
            aria-label="Filtrez vos plug-ins"
            placeholder="Filtrez vos plug-ins"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className={styles.segment} role="group" aria-label="Type de plug-in">
          {(['Tous', 'Connecteurs', 'Skills'] as const).map((f) => (
            <button
              key={f}
              aria-pressed={filtre === f}
              onClick={() => {
                setFiltre(f);
                setDetail('');
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          className={styles.tri}
          aria-label="Trier par nom"
          title="Trier par nom"
          aria-pressed={tri}
          onClick={() => setTri(!tri)}
        >
          <Icon name="filtre" size={19} />
        </button>
      </div>
      {filtre === 'Tous' && !q && (
        <section>
          <div className={styles.entete}>
            <h3>Dans ce projet</h3>
            <Link href="/projets">
              <Icon name="file" size={16} /> Projets
            </Link>
          </div>
          <div className={styles.vide}>
            <Icon name="file" size={18} />
            <span>Aucun plug-in installé au niveau du projet.</span>
          </div>
        </section>
      )}
      <section>
        <h3>Actifs</h3>
        {filtre !== 'Skills' && actifs.map((e) => ligne(e))}
        {filtre === 'Tous' && inclus.length > 0 && (
          <button
            className={styles.inclus}
            aria-expanded={deplie}
            onClick={() => setDeplie(!deplie)}
          >
            {deplie ? '⌄' : '›'} Inclus :{' '}
            {inclus
              .slice(0, 3)
              .map((x) => x.nom)
              .join(', ')}
            {inclus.length > 3 ? ' et ' + (inclus.length - 3) + ' autres' : ''}
          </button>
        )}
        {filtre === 'Skills' && <h4>Inclus</h4>}
        {(filtre === 'Skills' || (filtre === 'Tous' && deplie)) && inclus.map((e) => ligne(e))}
        {!(filtre !== 'Skills' && actifs.length) &&
          !(filtre !== 'Connecteurs' && inclus.length) && <p>Aucun résultat.</p>}
      </section>
      {filtre !== 'Skills' && (
        <section>
          <h3>Non actifs</h3>
          {inactifs.map((e) => ligne(e, true))}
          {!inactifs.length && (
            <p>
              {!github
                ? 'Vérification de la connexion…'
                : !etatConnu && trouve(git)
                  ? 'État de GitHub indisponible.'
                  : 'Aucun résultat.'}
            </p>
          )}
        </section>
      )}
      <Link className={styles.parcourir} href="/plugins">
        Parcourir les plug-ins
      </Link>
    </div>
  );
}
