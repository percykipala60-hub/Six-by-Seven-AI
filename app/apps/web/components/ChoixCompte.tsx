'use client';
import { useEffect, useState } from 'react';
import { profilsBureau } from '@/lib/profils-bureau';

export function ChoixCompte() {
  const [liste, setListe] = useState<{ id: string; nom: string }[]>();
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    void profilsBureau()
      ?.liste()
      .then(setListe)
      .catch(() => setErreur('Comptes indisponibles.'));
  }, []);
  const pont = profilsBureau();
  if (!pont || !liste) return null;
  const agir = (action: Promise<void>) =>
    void action.catch(() => setErreur('Changement de compte impossible.'));
  return (
    <details data-menu>
      <summary>Comptes sur ce PC</summary>
      {liste.map((p) => (
        <button
          type="button"
          className="menu-compte-el"
          key={p.id}
          onClick={() => agir(pont.choisir(p.id))}
        >
          {p.nom}
        </button>
      ))}
      <button type="button" className="menu-compte-el" onClick={() => agir(pont.ajouter())}>
        Ajouter un compte
      </button>
      <button type="button" className="menu-compte-el" onClick={() => agir(pont.toutQuitter())}>
        Déconnecter tous les comptes de ce PC
      </button>
      {erreur && <p role="alert">{erreur}</p>}
    </details>
  );
}
