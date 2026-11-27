'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { EVT_CAPACITES, ecrireCapacites, lireCapacites, type Capacites } from '@/lib/capacites';

/** Rangée à interrupteur : titre et explication à gauche, interrupteur à droite. */
function Interrupteur({
  id,
  titre,
  children,
  checked,
  disabled,
  onChange,
  retrait,
}: {
  id: string;
  titre: string;
  children: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
  retrait?: boolean;
}) {
  return (
    <div className={`voix-rangee capacite${retrait ? ' capacite-retrait' : ''}`}>
      <label className="voix-rangee-texte" htmlFor={id}>
        <span className="voix-rangee-titre">{titre}</span>
        {children}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="lg-sw"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

/**
 * Réglages → Capacités : ce que Six peut faire dans Cosinus (comme les « Capacités » des réglages de Claude).
 * Chaque réglage est appliqué par le serveur à la demande suivante (lib/capacites.ts).
 */
export function ReglagesCapacites() {
  const [c, setC] = useState<Capacites | null>(null);
  useEffect(() => {
    const lire = () => setC(lireCapacites());
    lire();
    window.addEventListener(EVT_CAPACITES, lire);
    return () => window.removeEventListener(EVT_CAPACITES, lire);
  }, []);
  if (!c) return null;
  const changer = (maj: Partial<Capacites>) => setC(ecrireCapacites({ ...c, ...maj }));

  return (
    <div className="voix-reglages">
      <section className="voix-bloc">
        <Interrupteur
          id="cap-artefacts"
          titre="Artéfacts"
          checked={c.artefacts || c.fichiers}
          disabled={c.fichiers}
          onChange={(on) => changer({ artefacts: on })}
        >
          <span className="voix-rangee-sous">
            Permettez à Six d’ouvrir les documents, les présentations et les pages dans une fenêtre
            dédiée, à côté de votre discussion.
          </span>
          <span className="voix-rangee-sous">Requis pour « Créer et modifier des fichiers »</span>
        </Interrupteur>
        <Interrupteur
          id="cap-graphiques"
          titre="Graphiques et diagrammes dans la discussion"
          checked={c.graphiques}
          onChange={(on) => changer({ graphiques: on })}
        >
          <span className="voix-rangee-sous">
            Laissez Six créer des graphiques et des diagrammes directement dans vos discussions.
          </span>
        </Interrupteur>
        <Interrupteur
          id="cap-fichiers"
          titre="Créer et modifier des fichiers"
          checked={c.fichiers}
          onChange={(on) => changer({ fichiers: on })}
        >
          <span className="voix-rangee-sous">
            Permettez à Six de créer et de modifier des fichiers que vous pouvez télécharger :
            documents Word, PDF, présentations et tableurs. Les Focus de Cosinus nécessitent ce
            réglage.
          </span>
          <span className="voix-rangee-sous">
            Lorsqu’il est désactivé, Six répond dans la discussion sans rien enregistrer dans votre
            environnement.
          </span>
        </Interrupteur>
        <Interrupteur
          id="cap-internet"
          titre="Utiliser Internet pendant la création de fichiers"
          checked={c.fichiers && c.internet}
          disabled={!c.fichiers}
          onChange={(on) => changer({ internet: on })}
          retrait
        >
          <span className="voix-rangee-sous">
            Six peut chercher des sources, lire des pages web et piloter son navigateur interne. Une
            page web peut contenir des instructions trompeuses : garde un œil sur ces discussions.
          </span>
        </Interrupteur>
      </section>
    </div>
  );
}
