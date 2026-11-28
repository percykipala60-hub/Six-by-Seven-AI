'use client';

import { copierTexte } from '@/lib/presse-papiers';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Icon } from './Icon';
import type { Artefact } from '@/lib/artefacts';
import type { UsageJetons } from '@/lib/types';
import type { EtatRemote } from './RemoteDiscussion';

const CLE_SESSION = 'six-session-ouverte';

/** Ferme un menu au clic dehors ou avec Échap. */
function useFermeture(ouvert: boolean, boite: RefObject<HTMLElement | null>, fermer: () => void) {
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) fermer();
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer();
    };
    window.addEventListener('pointerdown', surClic);
    window.addEventListener('keydown', surTouche);
    return () => {
      window.removeEventListener('pointerdown', surClic);
      window.removeEventListener('keydown', surTouche);
    };
  }, [ouvert, boite, fermer]);
}

/**
 * Panneau de session (comme celui de Claude) : un bouton en haut à droite ouvre un petit menu avec
 * l'environnement, le remote, le contexte utilisé, les fichiers livrés et ce qui tourne encore.
 */
export function PanneauSession({
  environnement,
  dossier,
  cloud,
  usage,
  sorties,
  occupe,
  enFile,
  onOuvrirSortie,
  remote,
  cosinus,
}: {
  environnement?: string;
  dossier?: string;
  cloud?: boolean;
  usage?: UsageJetons;
  sorties: Artefact[];
  occupe: boolean;
  enFile: number;
  onOuvrirSortie: (nom: string) => void;
  remote: EtatRemote;
  /** Cosinus montre l'environnement ; le Chat n'en a pas. */
  cosinus: boolean;
}) {
  // Grand écran : panneau fixé à droite de l'écran de base (comme Claude), ouvert ou fermé d'une fois sur l'autre.
  // Petit écran : menu sous le bouton, qui se ferme en cliquant ailleurs.
  const [ouvert, setOuvert] = useState(false);
  const [ancre, setAncre] = useState(false);
  const [options, setOptions] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grand = window.matchMedia('(min-width: 1024px)');
    const suivre = () => setAncre(grand.matches);
    suivre();
    if (grand.matches && localStorage.getItem(CLE_SESSION) === '1') setOuvert(true);
    grand.addEventListener('change', suivre);
    return () => grand.removeEventListener('change', suivre);
  }, []);
  useEffect(() => {
    if (ancre) localStorage.setItem(CLE_SESSION, ouvert ? '1' : '0');
    const html = document.documentElement;
    if (ancre && ouvert) html.dataset.session = '';
    else delete html.dataset.session;
    return () => {
      delete html.dataset.session;
    };
  }, [ancre, ouvert]);
  useFermeture(ouvert && !ancre, boite, () => setOuvert(false));

  const jetons = usage ? usage.entree + usage.sortie : 0;
  const court = (chemin: string) =>
    chemin.length > 34 ? chemin.slice(0, 12) + '…' + chemin.slice(-18) : chemin;

  return (
    <div className="volet-boutons session-boite" ref={boite}>
      <button
        type="button"
        className="volet-bouton"
        aria-expanded={ouvert}
        aria-pressed={ancre ? ouvert : undefined}
        aria-label="Session"
        title="Session"
        onClick={() => setOuvert((o) => !o)}
      >
        <Icon name="liste" size={19} stroke={1.8} />
      </button>
      {ouvert && (
        <div
          className={'session-panneau' + (ancre ? ' session-ancre' : '')}
          role={ancre ? 'complementary' : 'dialog'}
          aria-label="Session"
        >
          <section>
            <h3>Environnement</h3>
            {cosinus && (
              <>
                <p>
                  <Icon name="ordinateur" size={16} stroke={1.8} />
                  <span>{environnement || 'Sans environnement'}</span>
                </p>
                <p title={dossier}>
                  <Icon name="file" size={16} stroke={1.8} />
                  <span>
                    {cloud
                      ? 'Fichiers du compte (cloud)'
                      : dossier
                        ? court(dossier)
                        : 'Aucun dossier'}
                  </span>
                </p>
              </>
            )}
            <div className="session-remote">
              <Icon name="phone" size={16} stroke={1.8} />
              <span>Remote</span>
              <button
                type="button"
                className="session-plus"
                aria-expanded={options}
                aria-label="Options du remote"
                title="Options du remote"
                onClick={() => setOptions((o) => !o)}
              >
                <Icon name="points" size={16} stroke={2.4} />
              </button>
              <button
                type="button"
                role="switch"
                className="session-interrupteur"
                aria-checked={remote.actif}
                aria-label={remote.actif ? 'Désactiver le remote' : 'Activer le remote'}
                disabled={remote.occupe || !remote.possible}
                title={remote.possible ? undefined : 'Envoyez d’abord un message'}
                onClick={() => void remote.basculer()}
              />
            </div>
            {options && (
              <div className="session-options">
                <label>
                  Accès
                  <select
                    disabled={remote.actif || remote.occupe}
                    value={remote.prive ? 'prive' : 'public'}
                    onChange={(e) => remote.setPublique(e.target.value === 'public')}
                  >
                    <option value="prive">Privé · lire et écrire</option>
                    <option value="public">Public · lecture seule</option>
                  </select>
                </label>
                {remote.prive && (
                  <label>
                    Adresses autorisées à écrire
                    <textarea
                      rows={2}
                      placeholder="nom@exemple.com, autre@exemple.com"
                      value={remote.adresses}
                      disabled={remote.occupe}
                      onChange={(e) => remote.setAdresses(e.target.value)}
                      onBlur={() => {
                        if (remote.actif) void remote.enregistrerAdresses();
                      }}
                    />
                    <small>En plus de votre compte, avec cette adresse sur Six.</small>
                  </label>
                )}
              </div>
            )}
            {remote.erreur && (
              <p role="alert" className="session-erreur">
                {remote.erreur}
              </p>
            )}
          </section>
          <section>
            <h3>Contexte</h3>
            <p className={jetons ? undefined : 'session-vide'}>
              {jetons ? jetons.toLocaleString('fr-FR') + ' jetons utilisés' : 'Rien encore'}
            </p>
          </section>
          <section>
            <h3>Sorties</h3>
            {sorties.length ? (
              sorties.map((s) => (
                <button
                  type="button"
                  key={s.nom}
                  className="session-ligne"
                  onClick={() => {
                    onOuvrirSortie(s.nom);
                    setOuvert(false);
                  }}
                >
                  <Icon name="file" size={16} stroke={1.8} />
                  <span>{s.nom}</span>
                </button>
              ))
            ) : (
              <p className="session-vide">Aucun fichier livré</p>
            )}
          </section>
          <section>
            <h3>Tâches en cours</h3>
            <p className={occupe || enFile ? undefined : 'session-vide'}>
              {occupe ? 'Six travaille' : 'Rien en cours'}
              {enFile > 0 && ` · ${enFile} en attente`}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

/** Bouton « Partager » : apparaît seulement quand le remote est activé, et donne le lien. */
export function BoutonRemote({ remote }: { remote: EtatRemote }) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  useFermeture(ouvert, boite, () => setOuvert(false));
  if (!remote.actif) return null;
  return (
    <div className="volet-boutons session-boite" ref={boite}>
      <button
        type="button"
        className="volet-bouton session-partager"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        <Icon name="up" size={16} stroke={2} />
        Partager
      </button>
      {ouvert && (
        <div className="session-panneau" role="dialog" aria-label="Partager">
          <section>
            <h3>{remote.prive ? 'Lien privé · lire et écrire' : 'Lien public · lecture seule'}</h3>
            <input readOnly value={remote.lien} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="session-ligne"
              onClick={() =>
                void copierTexte(remote.lien)
                  .then(() => {
                    setCopie(true);
                    setTimeout(() => setCopie(false), 1500);
                  })
                  .catch(() => {
                    /* le lien reste sélectionnable dans le champ */
                  })
              }
            >
              <Icon name={copie ? 'check' : 'copy'} size={16} stroke={1.8} />
              <span>{copie ? 'Lien copié' : 'Copier le lien'}</span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
