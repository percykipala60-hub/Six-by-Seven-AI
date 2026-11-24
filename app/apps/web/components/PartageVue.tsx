'use client';

import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { lirePartage, type PartageLu } from '@/lib/cloud';
import { PRODUIT } from '@/lib/marque';

/**
 * Lecture d'une discussion partagée depuis le Cloud de Six (/partage/<id>), sans compte. Texte seul, affiché
 * tel quel (jamais interprété comme du HTML).
 */
export function PartageVue({ id }: { id: string }) {
  const [p, setP] = useState<PartageLu | null | undefined>(undefined);
  useEffect(() => {
    void lirePartage(id).then(setP);
  }, [id]);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <main className="partage">
      <header className="partage-tete">
        <Logo label={PRODUIT} />
        <span>{PRODUIT}</span>
      </header>
      {p === undefined ? (
        <p className="partage-info">Chargement…</p>
      ) : p === null ? (
        <div className="partage-absent">
          <h1>Partage introuvable</h1>
          <p className="partage-info">
            Ce lien n’existe pas, a expiré ou a été supprimé par la personne qui l’a partagé.
          </p>
        </div>
      ) : (
        <article>
          <h1>{p.titre}</h1>
          <p className="partage-info">
            Discussion partagée le {date(p.cree_le)} · disponible jusqu’au {date(p.expire_le)}
          </p>
          <div className="partage-fil">
            {(p.contenu.messages ?? []).map((m, i) => (
              <div key={i} className={`partage-message partage-${m.role}`}>
                <span className="partage-auteur">{m.role === 'user' ? 'Question' : PRODUIT}</span>
                <p>{m.content}</p>
              </div>
            ))}
          </div>
        </article>
      )}
    </main>
  );
}
