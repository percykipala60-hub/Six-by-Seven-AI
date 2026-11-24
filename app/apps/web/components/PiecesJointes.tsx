'use client';

import { Icon } from './Icon';
import type { PieceAffichee } from '@/lib/types';

const LIBELLE: Record<PieceAffichee['genre'], string> = {
  capture: 'Capture',
  image: 'Image',
  video: 'Vidéo',
  document: 'Document',
};

function extension(nom: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(nom);
  return m ? m[1].toUpperCase() : 'TXT';
}

/**
 * Pièces jointes en carrés : l'image (capture, photo, première image d'une vidéo) ou, pour un document, une fiche
 * avec son type et son nom. Dans la barre de saisie, chaque carré a une croix pour le retirer.
 */
export function PiecesJointes({
  pieces,
  onRetirer,
  petit,
}: {
  pieces: (PieceAffichee & { id?: string })[];
  onRetirer?: (index: number) => void;
  petit?: boolean;
}) {
  if (!pieces.length) return null;
  return (
    <div className={`pieces${petit ? ' petit' : ''}`}>
      {pieces.map((p, i) => (
        <div
          key={p.id ?? i}
          className={`piece piece-${p.genre}`}
          title={`${LIBELLE[p.genre]} : ${p.nom}`}
        >
          {p.apercu ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local (data URL)
            <img src={p.apercu} alt={`${LIBELLE[p.genre]} : ${p.nom}`} />
          ) : (
            <span className="piece-fiche">
              <Icon name={p.genre === 'capture' ? 'pointeur' : 'file'} size={22} stroke={1.6} />
              <span className="piece-ext">
                {p.genre === 'document' ? extension(p.nom) : LIBELLE[p.genre]}
              </span>
              <span className="piece-nom">{p.nom}</span>
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
      ))}
    </div>
  );
}
