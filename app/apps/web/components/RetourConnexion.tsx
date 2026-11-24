'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { PRODUIT } from '@/lib/marque';

/**
 * Page d'après connexion (/connexion/retour), pour les apps qui envoient la connexion Google ou Apple dans le
 * navigateur (app de bureau, app Android). Le fournisseur revient ici avec ce que Supabase a donné (code ou jetons).
 *
 * 1. App de bureau : la page est servie par le même serveur local ; elle dépose le retour dans le relais
 *    (app/api/connexion/relais), où l'app qui attendait le récupère, termine la connexion et revient au premier plan.
 * 2. Sinon (Android, site en ligne) : renvoi vers l'app par six://auth ; un lien discret reste là au cas où le
 *    navigateur attendrait un geste.
 *
 * Un simple message sur le fond de Six (vagues), sans cadre ni bouton. La page ne termine jamais la connexion
 * elle-même, et efface aussitôt le code ou les jetons de la barre d'adresse (rien ne reste dans l'historique).
 */
type Etat = 'envoi' | 'remis' | 'lien' | 'erreur';

const TEXTES: Record<Etat, { titre: string; texte: string }> = {
  envoi: { titre: 'Connexion en cours', texte: 'Six termine votre connexion…' },
  remis: {
    titre: 'Connexion réussie',
    texte: 'Six est de nouveau ouvert. Vous pouvez fermer cet onglet.',
  },
  lien: {
    titre: 'Connexion presque terminée',
    texte: 'Six s’ouvre pour terminer votre connexion.',
  },
  erreur: {
    titre: 'Connexion interrompue',
    texte: 'La connexion n’a pas abouti. Revenez dans Six pour réessayer.',
  },
};

export function RetourConnexion() {
  const [etat, setEtat] = useState<Etat>('envoi');
  const [cible, setCible] = useState('six://auth');
  useEffect(() => {
    const { search, hash, pathname } = window.location;
    const lire = (cle: string) =>
      new URLSearchParams(hash.slice(1)).get(cle) ?? new URLSearchParams(search).get(cle);
    const retour = hash.length > 1 ? hash : search;
    window.history.replaceState(null, '', pathname);
    if (lire('error_description') ?? lire('error')) {
      setEtat('erreur');
      return;
    }
    const vers = `six://auth${search}${hash}`;
    setCible(vers);
    const parLien = () => {
      setEtat('lien');
      if (retour.length > 1) window.location.href = vers;
    };
    if (retour.length < 2) return parLien();
    void fetch('/api/connexion/relais', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'deposer', retour }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ recu?: boolean }>) : null))
      .then((d) => (d?.recu ? setEtat('remis') : parLien()))
      .catch(parLien);
  }, []);

  const t = TEXTES[etat];
  return (
    <main className="retour-connexion" aria-live="polite">
      <div className="retour-marque">
        <Logo label="Six" />
        <span>{PRODUIT}</span>
      </div>
      <div className={`retour-etat retour-${etat}`} aria-hidden="true">
        {etat === 'remis' ? (
          <Icon name="check" size={30} stroke={2.4} />
        ) : etat === 'erreur' ? (
          <Icon name="x" size={28} stroke={2.4} />
        ) : (
          <span className="retour-point" />
        )}
      </div>
      <h1>{t.titre}</h1>
      <p>{t.texte}</p>
      {etat === 'lien' && (
        <a className="retour-lien" href={cible}>
          Six ne s’est pas ouvert ? Ouvrir Six
        </a>
      )}
    </main>
  );
}
