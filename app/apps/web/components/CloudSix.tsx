'use client';

import { useCallback, useEffect, useState } from 'react';
import { Groupe, Ligne, LigneInfo, LigneInterrupteur } from './Liste';
import { useConfirmer } from './Confirmer';
import { autoriserSync, ecouterCompte, lireCompte, syncAutorisee } from '@/lib/compte';
import { lienPartage, mesPartages, supprimerPartage, type Partage } from '@/lib/cloud';
import { lireEtatPremium } from '@/lib/premium-client';

/**
 * Réglages > Cloud : ce qui vit sur le compte, réservé à Six Premium.
 * - Synchroniser : la mémoire de Six suit la personne sur ses appareils (téléphone, ordinateur, web).
 * - Partages : les discussions partagées par lien (bouton « Partager » d'une discussion), à copier ou supprimer.
 * Sans Premium, la section est verrouillée ; la mémoire de l'appareil (en dessous) marche toujours.
 */
export function CloudSix({ onPremium }: { onPremium: () => void }) {
  const [demande, demander] = useConfirmer();
  const [premium, setPremium] = useState<boolean | null>(null);
  const [paiementOuvert, setPaiementOuvert] = useState(false);
  const [connecte, setConnecte] = useState(false);
  const [sync, setSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState('');
  const [partages, setPartages] = useState<Partage[] | null>(null);
  const [copie, setCopie] = useState('');

  useEffect(() => {
    void lireEtatPremium().then((e) => {
      setPremium(Boolean(e?.premium));
      setPaiementOuvert(Boolean(e && !e.veille));
    });
    const lire = () => {
      setConnecte(lireCompte().statut === 'connecte');
      setSync(syncAutorisee());
    };
    lire();
    return ecouterCompte(lire);
  }, []);

  const recharger = useCallback(() => void mesPartages().then(setPartages), []);
  useEffect(() => {
    if (premium) recharger();
  }, [premium, recharger]);

  if (premium === null) return <Groupe titre="Cloud">{demande}</Groupe>;

  if (!premium || !connecte)
    return (
      <Groupe
        titre="Cloud"
        pied={
          !connecte
            ? 'Connectez-vous pour utiliser le Cloud.'
            : paiementOuvert
              ? 'Le Cloud fait partie de Six Premium.'
              : 'Le Cloud arrivera avec Six Premium.'
        }
      >
        <LigneInfo
          icon="lock"
          label="Cloud verrouillé"
          sous="Votre mémoire sur tous vos appareils, et vos discussions partagées par lien"
        />
        {connecte && paiementOuvert && (
          <Ligne icon="sparkles" label="Découvrir Six Premium" onClick={onPremium} />
        )}
      </Groupe>
    );

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  return (
    <>
      {demande}
      <Groupe
        titre="Cloud"
        pied={
          sync
            ? 'Vos habitudes, vos notes sur vos contacts et vos rappels vous suivent sur vos autres appareils.'
            : 'Activez la synchronisation pour retrouver la mémoire de Six sur vos autres appareils.'
        }
      >
        <LigneInterrupteur
          id="cloud-sync"
          icon="refresh"
          label="Synchroniser sur mes appareils"
          checked={sync}
          disabled={busy}
          onChange={async (on) => {
            if (on) {
              setBusy(true);
              const err = await autoriserSync(true);
              setBusy(false);
              setErreur(err ?? '');
              return;
            }
            demander({
              titre: 'Arrêter la synchronisation ?',
              texte:
                'La copie de votre mémoire gardée dans le Cloud sera effacée. Celle de cet appareil ne change pas.',
              action: 'Arrêter et effacer la copie',
              danger: true,
              onConfirmer: async () => setErreur((await autoriserSync(false)) ?? ''),
            });
          }}
        />
      </Groupe>

      <Groupe
        titre="Partages"
        pied="Une discussion partagée est lisible par toute personne qui a son lien, pendant 30 jours. Le bouton « Partager » d'une discussion en crée un."
      >
        {partages === null ? (
          <LigneInfo icon="cloud" label="Partages" sous="Indisponibles pour le moment" />
        ) : partages.length === 0 ? (
          <LigneInfo icon="cloud" label="Aucun partage" />
        ) : (
          partages.map((p) => (
            <Ligne
              key={p.id}
              icon={copie === p.id ? 'check' : 'partager'}
              label={p.titre}
              sous={
                copie === p.id
                  ? 'Lien copié'
                  : `Partagé le ${date(p.cree_le)} · jusqu’au ${date(p.expire_le)}`
              }
              onClick={() => {
                void navigator.clipboard?.writeText(lienPartage(p.id)).catch(() => {});
                setCopie(p.id);
                setTimeout(() => setCopie(''), 2500);
              }}
            />
          ))
        )}
        {partages && partages.length > 0 && (
          <Ligne
            icon="trash"
            danger
            label="Supprimer tous les partages"
            onClick={() =>
              demander({
                titre: 'Supprimer tous les partages ?',
                texte: 'Les liens déjà envoyés ne fonctionneront plus.',
                action: 'Supprimer',
                danger: true,
                onConfirmer: async () => {
                  await Promise.all(partages.map((p) => supprimerPartage(p.id)));
                  recharger();
                },
              })
            }
          />
        )}
      </Groupe>
      {erreur && (
        <p className="lg-pied" role="alert">
          {erreur}
        </p>
      )}
    </>
  );
}
