'use client';

import { useState } from 'react';
import { urlCarteIntegree, urlLieu, type LieuCarte } from '@/lib/carte-rdc';
import styles from './CarteLieux.module.css';

/**
 * Carte OpenStreetMap sous une réponse de Six : la carte intégrée d'openstreetmap.org (repère sur le premier lieu),
 * puis la liste des lieux trouvés, chacun ouvrant sa position sur OpenStreetMap.
 */
export function CarteLieux({ lieux }: { lieux: LieuCarte[] }) {
  const [ouverte, setOuverte] = useState(true);
  const carte = urlCarteIntegree(lieux);
  if (!carte) return null;
  return (
    <div className={styles.carte}>
      <button
        type="button"
        className={styles.entete}
        aria-expanded={ouverte}
        onClick={() => setOuverte((o) => !o)}
      >
        <span aria-hidden="true">🗺️</span> Carte{lieux.length > 1 ? ` · ${lieux.length} lieux` : ''}
        <span className={styles.chevron} aria-hidden="true">
          {ouverte ? '▾' : '▸'}
        </span>
      </button>
      {ouverte && (
        <>
          <iframe
            className={styles.cadre}
            src={carte}
            title={`Carte : ${lieux[0].nom}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin"
          />
          <ol className={styles.liste}>
            {lieux.map((l, i) => (
              <li key={`${l.lat},${l.lon}`}>
                <a href={urlLieu(l)} target="_blank" rel="noopener noreferrer">
                  <span className={styles.numero}>{i + 1}</span>
                  <span>
                    <strong>{l.nom}</strong>
                    {l.detail && l.detail !== l.nom && (
                      <span className={styles.detail}>{l.detail}</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ol>
          <p className={styles.source}>
            Données ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              contributeurs OpenStreetMap
            </a>
          </p>
        </>
      )}
    </div>
  );
}
