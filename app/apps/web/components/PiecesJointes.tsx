'use client';

import { Icon } from './Icon';
import { abregerMilieu, badgeType } from '@/lib/collage';
import type { PieceAffichee } from '@/lib/types';

const LIBELLE: Record<PieceAffichee['genre'], string> = {
  capture: 'Capture',
  image: 'Image',
  video: 'Vidéo',
  document: 'Document',
};

/**
 * Pièces jointes en cartes, comme dans Claude : l'image (capture, photo, première image d'une vidéo) en vignette ;
 * pour un document, son chemin (app de bureau) ou son nom, coupé au milieu, avec un badge de type (PDF, DOCX…) ;
 * pour un texte collé, ses premiers mots. Dans la barre de saisie, chaque carte a une croix pour la retirer.
 * « enLecture » : cartes provisoires des fichiers en cours de lecture.
 */
export function PiecesJointes({
  pieces,
  onRetirer,
  petit,
  enLecture = 0,
}: {
  pieces: (PieceAffichee & { id?: string })[];
  onRetirer?: (index: number) => void;
  petit?: boolean;
  enLecture?: number;
}) {
  if (!pieces.length && !enLecture) return null;
  return (
    <div className={`pieces${petit ? ' petit' : ''}`}>
      {pieces.map((p, i) => {
        const nomAffiche = p.chemin ?? p.nom;
        return (
          <div
            key={p.id ?? i}
            className={`piece piece-${p.genre}`}
            title={`${LIBELLE[p.genre]} : ${nomAffiche}`}
          >
            {p.apercu ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local (data URL)
              <img src={p.apercu} alt={`${LIBELLE[p.genre]} : ${p.nom}`} />
            ) : (
              <span className="piece-fiche">
                <span className={`piece-nom${p.extrait ? ' extrait' : ''}`}>
                  {p.extrait ?? abregerMilieu(nomAffiche, petit ? 34 : 52)}
                </span>
                <span className="piece-ext">
                  {p.genre === 'document' ? badgeType(p.nom) : LIBELLE[p.genre]}
                </span>
              </span>
            )}
            {p.genre === 'video' && (
              <span className="piece-badge" aria-hidden="true">
                <Icon name="play" size={10} stroke={2} />
              </span>
            )}
            {p.genre === 'capture' && p.apercu && (
              <span className="piece-badge" aria-hidden="true">
                <Icon name="pointeur" size={10} stroke={2} />
              </span>
            )}
            {onRetirer && (
              <button
                type="button"
                className="piece-retirer"
                aria-label={`Retirer ${p.nom}`}
                title="Retirer"
                onClick={() => onRetirer(i)}
              >
                <Icon name="x" size={11} stroke={2.6} />
              </button>
            )}
          </div>
        );
      })}
      {Array.from({ length: enLecture }, (_, i) => (
        <div key={`lecture-${i}`} className="piece piece-lecture" role="status">
          <span className="piece-fiche">
            <span className="piece-nom">Lecture…</span>
          </span>
        </div>
      ))}
    </div>
  );
}
