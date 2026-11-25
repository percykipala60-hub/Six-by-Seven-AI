'use client';

import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from './Icon';
import { LIBELLE_GENRE, genreArtefact, iconeArtefact, type Artefact } from '@/lib/artefacts';
import styles from './Artefacts.module.css';

/** Le panneau n'est chargé qu'à la première ouverture d'un artefact (réseau faible : rien de plus au démarrage). */
export const ArtefactPanneau = dynamic(() => import('./ArtefactPanneau'), { ssr: false });

/** Artefact ouvert dans le panneau : toutes les versions du fichier, et celle à montrer. */
export type ArtefactOuvert = { versions: Artefact[]; version: number };

/**
 * Cartes des artefacts d'une réponse. Un appui ouvre le panneau : celui de l'écran (`onOuvrir`, discussion) ou, sans
 * lui, un panneau propre à ces cartes (résultat d'une tâche planifiée).
 * `versions` : versions de chaque fichier dans la discussion (lib/artefacts.ts, versionsDe).
 */
export function Artefacts({
  fichiers,
  versions,
  ouvert,
  onOuvrir,
}: {
  fichiers: Artefact[];
  versions?: Map<string, Artefact[]>;
  ouvert?: ArtefactOuvert | null;
  onOuvrir?: (a: ArtefactOuvert) => void;
}) {
  const [local, setLocal] = useState<ArtefactOuvert | null>(null);
  const fermer = useCallback(() => setLocal(null), []);
  const actif = onOuvrir ? ouvert : local;
  return (
    <div className={styles.cartes}>
      {fichiers.map((f, i) => {
        const toutes = versions?.get(f.nom) ?? [f];
        const trouvee = toutes.findIndex((v) => v.contenu === f.contenu);
        const version = trouvee >= 0 ? trouvee : toutes.length - 1;
        const genre = genreArtefact(f);
        const estOuvert = actif?.versions[0]?.nom === f.nom && actif.version === version;
        return (
          <button
            type="button"
            key={`${f.nom}-${i}`}
            className={styles.carte}
            aria-pressed={estOuvert}
            onClick={() => (onOuvrir ?? setLocal)({ versions: toutes, version })}
          >
            <span className={styles.icone} aria-hidden="true">
              <Icon name={iconeArtefact(genre)} size={18} />
            </span>
            <span className={styles.nom}>
              <strong>{f.nom}</strong>
              <span>
                {LIBELLE_GENRE[genre]}
                {toutes.length > 1 ? ` · version ${version + 1}` : ''} · Ouvrir l’artefact
              </span>
            </span>
          </button>
        );
      })}
      {!onOuvrir && local && (
        <ArtefactPanneau versions={local.versions} version={local.version} onFermer={fermer} />
      )}
    </div>
  );
}
