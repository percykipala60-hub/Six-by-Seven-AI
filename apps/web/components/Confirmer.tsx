'use client';

import { useEffect, useRef, useState } from 'react';

export interface Demande {
  titre: string;
  texte: string;
  action: string; // libellé du bouton qui confirme (« Effacer », « Se déconnecter »…)
  danger?: boolean; // action qu'on ne peut pas rattraper : bouton rouge
  onConfirmer: () => void | Promise<void>;
}

/**
 * Fenêtre de confirmation dans l'app, pour les gestes qu'on ne peut pas rattraper (effacer, se déconnecter).
 * Remplace window.confirm, bloqué dans certaines vues web et peu lisible sur téléphone.
 * Usage : const [demande, demander] = useConfirmer(); … demander({ … }); … {demande}
 */
export function useConfirmer(): [React.ReactNode, (d: Demande) => void] {
  const [d, setD] = useState<Demande | null>(null);
  return [d ? <Confirmer demande={d} onFermer={() => setD(null)} /> : null, setD];
}

function Confirmer({ demande, onFermer }: { demande: Demande; onFermer: () => void }) {
  const annuler = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    annuler.current?.focus(); // le choix sûr reçoit le focus
    const surTouche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', surTouche);
    return () => {
      document.removeEventListener('keydown', surTouche);
      avant?.focus?.();
    };
  }, [onFermer]);

  async function confirmer() {
    setBusy(true);
    try {
      await demande.onConfirmer();
    } finally {
      setBusy(false);
      onFermer();
    }
  }

  return (
    <div
      className="confirm-voile"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && !busy && onFermer()}
    >
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titre"
        aria-describedby="confirm-texte"
      >
        <h2 id="confirm-titre">{demande.titre}</h2>
        <p id="confirm-texte">{demande.texte}</p>
        <div className="confirm-acts">
          <button ref={annuler} className="btn ghost" onClick={onFermer} disabled={busy}>
            Annuler
          </button>
          <button
            className={`btn ${demande.danger ? 'danger' : 'primary'}`}
            onClick={() => void confirmer()}
            disabled={busy}
          >
            {busy ? 'Un instant…' : demande.action}
          </button>
        </div>
      </div>
    </div>
  );
}
