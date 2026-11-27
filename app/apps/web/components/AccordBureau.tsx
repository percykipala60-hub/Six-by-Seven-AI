'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * Demandes d'accord de l'app de bureau (contrôle de l'ordinateur, une application), affichées DANS la conversation,
 * comme un message de Six avec deux boutons. L'app de bureau attend la réponse ; si la conversation n'est pas
 * affichée, elle ouvre sa propre fenêtre d'accord à la place.
 */
type Demande = { id: number; titre: string; texte: string; garanties?: boolean };
type Pont = {
  surDemande: (rappel: (d: Demande) => void) => () => void;
  recu: (id: number) => void;
  repondre: (id: number, oui: boolean) => void;
};

function pont(): Pont | null {
  if (typeof window === 'undefined') return null;
  const p = (window as unknown as { sixBureau?: { accord?: Pont } }).sixBureau?.accord;
  return p?.surDemande ? p : null;
}

export function AccordBureau() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  useEffect(() => {
    const p = pont();
    if (!p) return;
    return p.surDemande((d) => {
      p.recu(d.id);
      setDemandes((liste) => [...liste.filter((x) => x.id !== d.id), d]);
    });
  }, []);
  if (!demandes.length) return null;
  const repondre = (d: Demande, oui: boolean) => {
    pont()?.repondre(d.id, oui);
    setDemandes((liste) => liste.filter((x) => x.id !== d.id));
  };
  return (
    <>
      {demandes.map((d) => (
        <div
          key={d.id}
          className="seven-msg assistant accord-msg"
          role="alertdialog"
          aria-labelledby={`accord-${d.id}`}
        >
          <div className="accord-carte">
            <div className="accord-tete">
              <span className="accord-pastille" aria-hidden="true">
                <Icon name="shield" size={16} stroke={1.9} />
              </span>
              <b id={`accord-${d.id}`}>{d.titre}</b>
            </div>
            <p className="accord-texte">{d.texte}</p>
            {d.garanties && (
              <ul className="accord-garanties">
                <li>
                  <Icon name="lock" size={14} /> Jamais de mot de passe ni de paiement
                </li>
                <li>
                  <Icon name="check" size={14} /> Une autorisation pour chaque application
                </li>
                <li>
                  <Icon name="pause" size={14} /> Arrêt immédiat : <kbd>Ctrl</kbd> <kbd>Alt</kbd>{' '}
                  <kbd>Échap</kbd>
                </li>
              </ul>
            )}
            <div className="accord-boutons">
              <button type="button" className="accord-non" onClick={() => repondre(d, false)}>
                Refuser
              </button>
              <button type="button" className="accord-oui" onClick={() => repondre(d, true)}>
                Autoriser
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
