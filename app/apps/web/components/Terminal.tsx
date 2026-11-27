'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from './Icon';

/**
 * Terminal de Cosinus (app de bureau seulement) : un vrai shell de l'ordinateur (PowerShell sous Windows), ouvert
 * dans le dossier de la discussion. Plusieurs onglets, historique des commandes (flèches haut et bas), Ctrl+C ou
 * « Arrêter » pour interrompre, Ctrl+L pour effacer. Seule la personne y tape : l'agent de Six n'y a pas accès.
 * Le shell tourne dans l'app de bureau (apps/bureau/terminal.cjs) ; la page affiche sa sortie.
 */

type Evenement = { id: number; type: 'sortie' | 'pret' | 'fin'; texte?: string; cwd?: string };
type Reponse<T> = { ok: true; resultat: T } | { ok: false; erreur: string };
type Pont = {
  piloter: <T>(c: Record<string, unknown>) => Promise<Reponse<T>>;
  surEvenement: (rappel: (e: Evenement) => void) => () => void;
};

function pont(): Pont | null {
  if (typeof window === 'undefined') return null;
  const p = (window as unknown as { sixBureau?: { terminal?: Pont } }).sixBureau?.terminal;
  return p?.piloter ? p : null;
}

/** Vrai dans l'app de bureau (le terminal y est proposé). */
export function terminalDisponible(): boolean {
  return pont() !== null;
}

type Onglet = { id: number; cwd: string; sortie: string; pret: boolean; fini: boolean };

const SORTIE_MAX = 200_000; // caractères gardés par onglet (les plus anciens partent)
const HISTORIQUE_MAX = 100;

/** Sortie brute du shell → texte lisible : retours chariot Windows, séquences de couleur retirées. */
function nettoyer(texte: string): string {
  // eslint-disable-next-line no-control-regex -- séquences ANSI envoyées par certains programmes
  return texte.replace(/\r\n/g, '\n').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

function invite(cwd: string): string {
  return `PS ${cwd}> `;
}

export function Terminal({
  dossier,
  agrandi = false,
  onAgrandir,
  onFermer,
}: {
  dossier: string;
  /** Panneau agrandi (bouton « Réduire ») ou non (« Agrandir »). */
  agrandi?: boolean;
  onAgrandir?: () => void;
  /** Ferme le panneau du terminal (les shells s'arrêtent). */
  onFermer?: () => void;
}) {
  const [onglets, setOnglets] = useState<Onglet[]>([]);
  const [actif, setActif] = useState<number | null>(null);
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState('');
  const historique = useRef<string[]>([]);
  const position = useRef(-1);
  const fin = useRef<HTMLDivElement | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  const ouverts = useRef<number[]>([]);

  const ouvrir = useCallback(async () => {
    const p = pont();
    if (!p) return;
    const r = await p.piloter<{ id: number; cwd: string }>({ action: 'ouvrir', cwd: dossier });
    if (!r.ok) {
      setErreur(r.erreur);
      return;
    }
    setErreur('');
    ouverts.current.push(r.resultat.id);
    setOnglets((o) => [
      ...o,
      { id: r.resultat.id, cwd: r.resultat.cwd, sortie: '', pret: false, fini: false },
    ]);
    setActif(r.resultat.id);
  }, [dossier]);

  // Sortie des shells, puis un premier terminal à l'ouverture du volet. Les shells se ferment avec le volet.
  useEffect(() => {
    const p = pont();
    if (!p) return;
    const stop = p.surEvenement((e) =>
      setOnglets((liste) =>
        liste.map((o) => {
          if (o.id !== e.id) return o;
          if (e.type === 'sortie') {
            const sortie = (o.sortie + nettoyer(e.texte ?? '')).slice(-SORTIE_MAX);
            return { ...o, sortie };
          }
          if (e.type === 'pret') return { ...o, pret: true, fini: false, cwd: e.cwd ?? o.cwd };
          return { ...o, pret: false, fini: true };
        }),
      ),
    );
    void ouvrir();
    const ids = ouverts.current;
    return () => {
      stop();
      for (const id of ids) void p.piloter({ action: 'fermer', id });
      ids.length = 0;
    };
    // Un seul démarrage par ouverture du volet ; un changement de dossier ne relance pas les shells ouverts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const courant = onglets.find((o) => o.id === actif) ?? null;

  // Toujours en bas de la sortie, comme un terminal.
  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' });
  }, [courant?.sortie, courant?.pret]);

  async function executer(commande: string) {
    const p = pont();
    if (!p || !courant) return;
    if (commande.trim()) {
      historique.current = [...historique.current.filter((h) => h !== commande), commande].slice(
        -HISTORIQUE_MAX,
      );
    }
    position.current = -1;
    if (/^\s*(cls|clear)\s*$/i.test(commande)) {
      effacer();
      return;
    }
    const ligne = `${invite(courant.cwd)}${commande}\n`;
    setOnglets((liste) =>
      liste.map((o) =>
        o.id === courant.id
          ? { ...o, pret: false, fini: false, sortie: (o.sortie + ligne).slice(-SORTIE_MAX) }
          : o,
      ),
    );
    const r = await p.piloter({ action: 'ecrire', id: courant.id, commande });
    if (!r.ok) setErreur(r.erreur);
  }

  function effacer() {
    if (!courant) return;
    setOnglets((liste) => liste.map((o) => (o.id === courant.id ? { ...o, sortie: '' } : o)));
  }

  async function arreter() {
    const p = pont();
    if (!p || !courant) return;
    await p.piloter({ action: 'arreter', id: courant.id });
  }

  async function fermer(id: number) {
    const p = pont();
    if (p) await p.piloter({ action: 'fermer', id });
    ouverts.current = ouverts.current.filter((x) => x !== id);
    const reste = onglets.filter((o) => o.id !== id);
    setOnglets(reste);
    if (actif === id) setActif(reste.at(-1)?.id ?? null);
  }

  function clavier(e: KeyboardEvent<HTMLInputElement>) {
    const h = historique.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!courant?.pret) return;
      const c = saisie;
      setSaisie('');
      void executer(c);
    } else if (e.key === 'ArrowUp' && h.length) {
      e.preventDefault();
      position.current = position.current < 0 ? h.length - 1 : Math.max(0, position.current - 1);
      setSaisie(h[position.current] ?? '');
    } else if (e.key === 'ArrowDown' && position.current >= 0) {
      e.preventDefault();
      position.current += 1;
      if (position.current >= h.length) {
        position.current = -1;
        setSaisie('');
      } else setSaisie(h[position.current] ?? '');
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault();
      void arreter();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      effacer();
    }
  }

  if (!pont())
    return (
      <div className="terminal-indispo">
        <Icon name="terminal" size={26} stroke={1.6} />
        <p>Le terminal est disponible dans l’application Six pour ordinateur.</p>
      </div>
    );

  return (
    <div className="terminal">
      <div className="terminal-onglets" role="tablist" aria-label="Terminaux">
        {onglets.map((o, i) => (
          <div key={o.id} className="terminal-onglet" data-actif={o.id === actif || undefined}>
            <button
              type="button"
              role="tab"
              aria-selected={o.id === actif}
              onClick={() => {
                setActif(o.id);
                champ.current?.focus();
              }}
            >
              <Icon name="terminal" size={13} stroke={2} />
              Terminal{onglets.length > 1 ? ` ${i + 1}` : ''}
            </button>
            <button
              type="button"
              className="terminal-fermer"
              aria-label={`Fermer le terminal ${i + 1}`}
              onClick={() => void fermer(o.id)}
            >
              <Icon name="x" size={12} stroke={2} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="terminal-ajout"
          aria-label="Nouveau terminal"
          title="Nouveau terminal"
          onClick={() => void ouvrir()}
        >
          <Icon name="plus" size={14} stroke={2} />
        </button>
        <span className="terminal-espace" />
        {courant && !courant.pret && !courant.fini && (
          <button
            type="button"
            className="terminal-arret"
            title="Arrêter la commande (Ctrl+C)"
            onClick={() => void arreter()}
          >
            Arrêter
          </button>
        )}
        <button
          type="button"
          className="terminal-ajout"
          aria-label="Effacer le terminal"
          title="Effacer (Ctrl+L)"
          disabled={!courant}
          onClick={effacer}
        >
          <Icon name="trash" size={14} stroke={1.8} />
        </button>
        {onAgrandir && (
          <button
            type="button"
            className="terminal-ajout"
            aria-label={agrandi ? 'Réduire le terminal' : 'Agrandir le terminal'}
            title={agrandi ? 'Réduire' : 'Agrandir'}
            aria-pressed={agrandi}
            onClick={onAgrandir}
          >
            <Icon name={agrandi ? 'reduire' : 'agrandir'} size={14} stroke={1.9} />
          </button>
        )}
        {onFermer && (
          <button
            type="button"
            className="terminal-ajout"
            aria-label="Fermer le panneau du terminal"
            title="Fermer"
            onClick={onFermer}
          >
            <Icon name="x" size={14} stroke={2} />
          </button>
        )}
      </div>
      {erreur && (
        <p className="terminal-erreur" role="alert">
          {erreur}
        </p>
      )}
      {/* Un clic dans la sortie remet le curseur dans la ligne de commande (sauf pendant une sélection). */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className="terminal-ecran"
        onClick={() => {
          if (!window.getSelection()?.toString()) champ.current?.focus();
        }}
      >
        {courant ? (
          <>
            <pre className="terminal-sortie" aria-live="polite">
              {courant.sortie}
            </pre>
            {courant.fini ? (
              <p className="terminal-fin">
                Le shell s’est arrêté. Tapez une commande pour le relancer.
              </p>
            ) : null}
            <div className="terminal-ligne" ref={fin}>
              <span className="terminal-invite" aria-hidden="true">
                {courant.pret || courant.fini ? invite(courant.cwd) : ''}
              </span>
              <input
                ref={champ}
                className="terminal-saisie"
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                onKeyDown={clavier}
                aria-label={`Commande, dans ${courant.cwd}`}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- le terminal s'ouvre pour qu'on y tape
                autoFocus
              />
            </div>
          </>
        ) : (
          <p className="terminal-fin">Aucun terminal ouvert. Touchez + pour en ouvrir un.</p>
        )}
      </div>
    </div>
  );
}
