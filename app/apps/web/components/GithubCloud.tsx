'use client';

import { useCallback, useEffect, useState } from 'react';
import { Groupe, Ligne, LigneInfo, LigneLien } from './Liste';
import { useConfirmer } from './Confirmer';
import { ecouterCompte, lireCompte } from '@/lib/compte';
import { connecterGithub, delierGithub, lireGithub, type EtatGithub } from '@/lib/github';

/**
 * Réglages → Cloud → GitHub : relier son compte GitHub (application « Six by Seven »), voir les dépôts autorisés,
 * les gérer sur GitHub, ou retirer le lien. Six lit les dépôts autorisés, travaille sur une branche à lui et ouvre
 * une pull request : la personne garde le dernier mot.
 */
export function GithubCloud() {
  const [connecte, setConnecte] = useState(() => lireCompte().statut === 'connecte');
  const [etat, setEtat] = useState<EtatGithub | null>(null);
  const [demande, demander] = useConfirmer();

  useEffect(() => ecouterCompte(() => setConnecte(lireCompte().statut === 'connecte')), []);
  const recharger = useCallback(() => void lireGithub().then(setEtat), []);
  useEffect(() => {
    if (!connecte) return;
    recharger();
    // Dépôts changés sur GitHub : la liste se met à jour au retour dans Six.
    const auRetour = () => document.visibilityState === 'visible' && recharger();
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [connecte, recharger]);

  if (!connecte || etat === null || 'erreur' in etat) return null;

  if (!etat.relie)
    return (
      <Groupe
        titre="GitHub"
        pied="Six lit les dépôts que vous autorisez, travaille sur une branche à lui et ouvre une pull request. Vous gardez le dernier mot."
      >
        <Ligne
          icon="partager"
          label="Connecter GitHub"
          sous="Autoriser Six, puis choisir vos dépôts"
          onClick={() => connecterGithub(etat.adresse)}
        />
      </Groupe>
    );

  return (
    <>
      {demande}
      <Groupe
        titre="GitHub"
        pied="Ces dépôts sont proposés dans Cosinus, dans « Nouvel environnement »."
      >
        <LigneInfo
          icon="check"
          label={`Connecté : ${etat.login}`}
          sous={`${etat.depots.length} dépôt${etat.depots.length > 1 ? 's' : ''} autorisé${etat.depots.length > 1 ? 's' : ''}`}
        />
        {etat.depots.slice(0, 8).map((d) => (
          <LigneInfo
            key={d.nom}
            icon={d.prive ? 'lock' : 'dossier'}
            label={d.nom}
            sous={d.prive ? 'Privé' : 'Public'}
          />
        ))}
        <LigneLien icon="sliders" label="Choisir les dépôts sur GitHub" href={etat.gerer} externe />
        <Ligne
          icon="logout"
          danger
          label="Déconnecter GitHub"
          onClick={() =>
            demander({
              titre: 'Déconnecter GitHub ?',
              texte:
                'Six n’aura plus accès à vos dépôts. Pour retirer complètement l’application, désinstallez « Six by Seven » dans vos réglages GitHub.',
              action: 'Déconnecter',
              danger: true,
              onConfirmer: async () => {
                await delierGithub();
                recharger();
              },
            })
          }
        />
      </Groupe>
    </>
  );
}
