'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { depuis, numeroVersion } from '@/lib/versions';
import type { ChatMessage } from '@/lib/types';

/**
 * Boutons sous un message, comme dans Claude :
 * - réponse de Six : copier, Word, PDF, relancer ;
 * - question de la personne : moment de l'envoi, partir d'ici (nouvelle discussion), relancer, modifier, copier ;
 * - versions « < 2/3 > » quand la question a été modifiée ou relancée (rien n'est perdu).
 * Pendant une réponse, ce qui changerait la discussion est désactivé.
 */
export function ActionsMessage({
  message,
  occupe,
  onCopier,
  onRelancer,
  onModifier,
  onBifurquer,
  onVersion,
  onPdf,
  onWord,
}: {
  message: ChatMessage;
  occupe: boolean;
  onCopier: () => Promise<void>;
  onRelancer?: () => void;
  onModifier?: () => void;
  onBifurquer?: () => void;
  onVersion?: (sens: -1 | 1) => void;
  onPdf?: () => void;
  onWord?: () => void;
}) {
  const [copie, setCopie] = useState(false);
  useEffect(() => {
    if (!copie) return;
    const t = setTimeout(() => setCopie(false), 1600);
    return () => clearTimeout(t);
  }, [copie]);
  const version = numeroVersion(message);
  const utilisateur = message.role === 'user';
  const bouton = (
    nom: Parameters<typeof Icon>[0]['name'],
    libelle: string,
    action: (() => void) | undefined,
    desactive = false,
  ) =>
    action && (
      <button
        type="button"
        aria-label={libelle}
        title={libelle}
        disabled={desactive}
        onClick={action}
      >
        <Icon name={nom} size={15} stroke={1.8} />
      </button>
    );
  const copier = (
    <button
      type="button"
      aria-label={copie ? 'Copié' : 'Copier'}
      title={copie ? 'Copié' : 'Copier'}
      onClick={() =>
        void onCopier().then(
          () => setCopie(true),
          () => {},
        )
      }
    >
      <Icon name={copie ? 'check' : 'copy'} size={15} stroke={1.8} />
    </button>
  );
  const versions = version.total > 1 && onVersion && (
    <span className="actions-versions" aria-label={`Version ${version.n} sur ${version.total}`}>
      <button
        type="button"
        aria-label="Version précédente"
        title="Version précédente"
        disabled={occupe || version.n <= 1}
        onClick={() => onVersion(-1)}
      >
        <Icon name="back" size={13} stroke={2} />
      </button>
      <span>
        {version.n}/{version.total}
      </span>
      <button
        type="button"
        aria-label="Version suivante"
        title="Version suivante"
        disabled={occupe || version.n >= version.total}
        onClick={() => onVersion(1)}
      >
        <Icon name="suivant" size={13} stroke={2} />
      </button>
    </span>
  );

  return (
    <div className={`actions-message ${utilisateur ? 'user' : 'assistant'}`}>
      {utilisateur ? (
        <>
          {versions}
          {message.date && (
            <time className="actions-date" dateTime={new Date(message.date).toISOString()}>
              {depuis(message.date)}
            </time>
          )}
          {bouton('bifurquer', 'Nouvelle discussion à partir d’ici', onBifurquer, occupe)}
          {bouton('refresh', 'Relancer', onRelancer, occupe)}
          {bouton('pencil', 'Modifier', onModifier, occupe)}
          {copier}
        </>
      ) : (
        <>
          {copier}
          {onWord && (
            <button
              type="button"
              className="actions-texte"
              aria-label="Télécharger en Word"
              title="Télécharger en Word"
              onClick={onWord}
            >
              DOCX
            </button>
          )}
          {onPdf && (
            <button
              type="button"
              className="actions-texte"
              aria-label="Exporter cette réponse en PDF"
              title="Exporter en PDF"
              onClick={onPdf}
            >
              PDF
            </button>
          )}
          {bouton('refresh', 'Relancer la réponse', onRelancer, occupe)}
        </>
      )}
    </div>
  );
}
