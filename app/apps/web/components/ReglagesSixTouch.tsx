'use client';

import { useEffect, useState } from 'react';
import { Groupe, Ligne, LigneInfo } from './Liste';
import { useConfirmer } from './Confirmer';

/**
 * Réglages > Cosinus : seulement l'utile. Les rapports n'ont pas d'option : Six produit toujours un Word, choisit
 * lui-même la mise en forme (et la table des matières) selon le document, et la personne précise dans sa demande ce
 * qu'elle veut d'autre (PDF, son style, page de garde…).
 */
export function ReglagesSixTouch() {
  const [dossier, setDossier] = useState<string | null>(null);
  const [demande, demander] = useConfirmer();
  useEffect(() => {
    // L'espace de travail n'existe qu'en local : la route répond 404 ailleurs.
    void fetch('/api/sixtouch/espace', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ dossier?: string }>) : null))
      .then((d) => setDossier(d?.dossier ?? ''))
      .catch(() => setDossier(''));
  }, []);

  return (
    <>
      <Groupe
        titre="Espace de travail"
        pied="Le dossier où Six lit tes fichiers et range ses documents. Il n'existe que sur ton ordinateur pour l'instant."
      >
        <LigneInfo
          icon="dossier"
          label="Dossier"
          sous={dossier === null ? 'Vérification…' : dossier || 'Pas disponible sur cette version'}
        />
      </Groupe>

      <Groupe titre="Navigateur">
        <Ligne
          icon="trash"
          danger
          label="Effacer l'historique du navigateur"
          onClick={() =>
            demander({
              titre: "Effacer l'historique ?",
              texte:
                'Les pages et recherches récentes du navigateur de Cosinus seront effacées de cet appareil.',
              action: 'Effacer',
              danger: true,
              onConfirmer: () => {
                try {
                  localStorage.removeItem('six-volet-nav');
                } catch {
                  /* rien à effacer */
                }
              },
            })
          }
        />
      </Groupe>
      {demande}
    </>
  );
}
