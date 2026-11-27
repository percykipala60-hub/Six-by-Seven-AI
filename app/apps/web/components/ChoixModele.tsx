'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { SKILLS, nomSkill, type ChoixSkill } from '@/lib/skills-cosinus';
import type { FournisseurChat } from '@/lib/api-schemas';

const MODELES = [
  { id: 'auto', nom: 'Automatique' },
  { id: 'claude', nom: 'Claude' },
  { id: 'openrouter', nom: 'OpenRouter' },
] as const;

export function ChoixModele({
  skill,
  onSkill,
  avecSkills,
  desactive,
  modeleActif,
  fournisseur,
  fournisseurs,
  onFournisseur,
}: {
  skill: ChoixSkill;
  onSkill: (s: ChoixSkill) => void;
  avecSkills: boolean;
  desactive?: boolean;
  modeleActif?: string;
  fournisseur: FournisseurChat | 'auto';
  fournisseurs: string[];
  onFournisseur: (fournisseur: FournisseurChat | 'auto') => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [sousMenu, setSousMenu] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const modele = MODELES.find((m) => m.id === fournisseur) ?? MODELES[0];

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !zone.current?.contains(e.target as Node)
      ) {
        setOuvert(false);
        setSousMenu(false);
      }
    };
    document.addEventListener('mousedown', fermer);
    document.addEventListener('keydown', fermer);
    return () => {
      document.removeEventListener('mousedown', fermer);
      document.removeEventListener('keydown', fermer);
    };
  }, [ouvert]);

  return (
    <div className="modele-choix" ref={zone}>
      <button
        type="button"
        className="modele-bouton"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        disabled={desactive}
        onClick={() => {
          setOuvert((o) => !o);
          setSousMenu(false);
        }}
      >
        <span
          className="modele-actif"
          title={
            modeleActif
              ? `Dernier modèle utilisé : ${modeleActif}`
              : 'Le modèle apparaît après la première réponse'
          }
        >
          {avecSkills ? (modeleActif ?? 'Six') : modele.nom}
        </span>
        {avecSkills && (
          <span className="modele-skill">{skill === 'auto' ? 'Auto' : nomSkill(skill)}</span>
        )}
        <Icon name="chevron" size={14} stroke={2} />
      </button>
      {ouvert && (
        <div className="modele-menu" role="menu">
          {!avecSkills &&
            MODELES.map((m) => {
              const disponible = m.id === 'auto' || fournisseurs.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={m.id === modele.id}
                  disabled={!disponible}
                  onClick={() => {
                    onFournisseur(m.id);
                    setOuvert(false);
                  }}
                >
                  <span className="modele-ligne">
                    <span>{m.nom}</span>
                    {m.id === 'auto' && <small>Six choisit le fournisseur</small>}
                    {!disponible && <small>Indisponible sur ce serveur</small>}
                  </span>
                  {m.id === modele.id && <Icon name="check" size={16} stroke={2} />}
                </button>
              );
            })}
          {modeleActif && <p className="modele-note">Dernier modèle utilisé : {modeleActif}</p>}
          {avecSkills && (
            <>
              <hr />
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={sousMenu}
                onClick={() => setSousMenu((v) => !v)}
              >
                <span>Focus</span>
                <span className="modele-valeur">
                  {nomSkill(skill)}
                  <Icon name="suivant" size={14} stroke={2} />
                </span>
              </button>
            </>
          )}
          {avecSkills && sousMenu && (
            <div className="modele-sous-menu" role="menu" aria-label="Focus">
              <p className="modele-note">La méthode de travail de Cosinus pour cette discussion.</p>
              {(['auto', ...SKILLS.map((s) => s.id)] as ChoixSkill[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={skill === id}
                  onClick={() => {
                    onSkill(id);
                    setOuvert(false);
                    setSousMenu(false);
                  }}
                >
                  <span className="modele-ligne">
                    <span>{nomSkill(id)}</span>
                    <small>
                      {id === 'auto'
                        ? 'Cosinus choisit selon la demande'
                        : SKILLS.find((s) => s.id === id)?.description}
                    </small>
                  </span>
                  {skill === id && <Icon name="check" size={16} stroke={2} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
