'use client';

import { useRef, useState } from 'react';
import { documentApercu, type Artefact } from '@/lib/artefacts';
import styles from './Artefacts.module.css';

export function Artefacts({ fichiers }: { fichiers: Artefact[] }) {
  const dialogue = useRef<HTMLDialogElement>(null);
  const [actif, setActif] = useState<Artefact | null>(null);
  const [source, setSource] = useState(false);
  const visuel = actif && /\.(html?|svg)$/i.test(actif.nom);
  function ouvrir(fichier: Artefact) {
    setActif(fichier);
    setSource(false);
    dialogue.current?.showModal();
  }
  function telecharger() {
    if (!actif) return;
    const url = URL.createObjectURL(
      new Blob([actif.contenu], { type: 'text/plain;charset=utf-8' }),
    );
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = actif.nom;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className={styles.cartes}>
      {fichiers.map((f, i) => (
        <button
          type="button"
          key={`${f.nom}-${i}`}
          className={styles.carte}
          onClick={() => ouvrir(f)}
        >
          <strong>{f.nom}</strong>
          <span>Ouvrir l’artefact</span>
        </button>
      ))}
      <dialog
        ref={dialogue}
        className={styles.panneau}
        aria-label={actif ? `Artefact : ${actif.nom}` : 'Artefact'}
      >
        <header className={styles.entete}>
          <strong>{actif?.nom}</strong>
          <button
            type="button"
            onClick={() => dialogue.current?.close()}
            aria-label="Fermer l’artefact"
          >
            Fermer
          </button>
        </header>
        <div className={styles.actions}>
          {visuel && (
            <button type="button" aria-pressed={!source} onClick={() => setSource(!source)}>
              {source ? 'Voir l’aperçu' : 'Voir le code'}
            </button>
          )}
          <button type="button" onClick={telecharger}>
            Télécharger
          </button>
        </div>
        {actif &&
          (visuel && !source ? (
            <>
              <p className={styles.note}>
                Aperçu statique — scripts et ressources externes désactivés.
              </p>
              <iframe
                title={`Aperçu de ${actif.nom}`}
                sandbox=""
                referrerPolicy="no-referrer"
                srcDoc={documentApercu(actif.contenu)}
                className={styles.apercu}
              />
            </>
          ) : (
            <pre className={styles.contenu}>{actif.contenu}</pre>
          ))}
      </dialog>
    </div>
  );
}
