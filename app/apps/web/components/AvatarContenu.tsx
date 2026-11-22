'use client';

import { useState } from 'react';
import { initiale, type Compte } from '@/lib/compte';
import { Icon } from './Icon';

/**
 * Contenu d'un avatar : la photo du compte Google (ou Apple) si la personne s'est connectée ainsi,
 * sinon l'initiale du prénom, sinon l'icône. Si la photo ne se charge pas, on revient à l'initiale.
 */
export function AvatarContenu({ c, taille, trait }: { c: Compte; taille: number; trait?: number }) {
  const photo = c.statut === 'connecte' ? c.photo : undefined;
  const [echec, setEchec] = useState<string | null>(null);
  if (photo && echec !== photo) {
    return (
      // Image distante de Google : pas d'optimisation Next, pas d'adresse d'origine transmise.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        className="avatar-photo"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setEchec(photo)}
      />
    );
  }
  return <>{initiale(c) || <Icon name="user" size={taille} stroke={trait} />}</>;
}
