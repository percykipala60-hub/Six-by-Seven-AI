'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  demanderArret,
  ecouterDirect,
  enAttenteDirect,
  envoyerDirect,
  evenementsRecents,
  listerDirect,
  type DiscussionDirecte,
  type EvenementDirect,
} from '@/lib/remote-direct';
import type { ActionAgent } from '@/lib/actions-agent';
import { ActionsAgent } from './ActionsAgent';
import { PlanTaches } from './PlanTaches';
import { FormulaireConnexion } from './Connexion';
import { Icon } from './Icon';
import { autoriserNotifications } from '@/lib/preferences';

const CLE_PREVENIR = 'six-remote-prevenir';

/** Les discussions qui viennent de finir : Six travaillait avant, plus maintenant. */
export function terminees(
  avant: Map<string, boolean>,
  liste: { discussion: string; occupe: boolean }[],
) {
  return liste
    .filter((d) => avant.get(d.discussion) === true && !d.occupe)
    .map((d) => d.discussion);
}

/** Depuis quand (« il y a 3 min »). */
function depuis(date: string): string {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

/** Ce que Six fait en ce moment : les événements depuis le dernier début de tâche. */
export function travailEnCours(evenements: EvenementDirect[]) {
  let debut = -1;
  evenements.forEach((e, i) => {
    if (e.genre === 'debut') debut = i;
  });
  const suite = debut < 0 ? [] : evenements.slice(debut);
  const actions = suite.flatMap((e) =>
    e.genre === 'action' && e.donnees.action ? [e.donnees.action] : [],
  );
  const plan =
    suite.filter((e) => e.genre === 'plan' && e.donnees.taches).at(-1)?.donnees.taches ?? [];
  const fin = suite.find((e) => e.genre === 'fin' || e.genre === 'erreur');
  return {
    actions,
    plan,
    termine: Boolean(fin),
    erreur: fin?.genre === 'erreur' ? fin.donnees.texte : '',
  };
}

/**
 * Remote sur le téléphone (privé, même compte) : les discussions des autres appareils apparaissent d'elles-mêmes,
 * sans lien, et on voit Six travailler en direct (actions, code lancé, plan), comme sur le poste.
 */
export function RemoteDirect() {
  const [connecte, setConnecte] = useState<boolean>();
  const [liste, setListe] = useState<DiscussionDirecte[]>([]);
  const [choisie, setChoisie] = useState('');
  const [evenements, setEvenements] = useState<EvenementDirect[]>([]);
  const [, setHorloge] = useState(0);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [attente, setAttente] = useState(0);
  const [info, setInfo] = useState('');
  // « Me prévenir quand c'est fini » (comme sur la vidéo) : notification du téléphone si l'app est en arrière-plan,
  // sinon un bandeau dans l'écran.
  const [prevenir, setPrevenir] = useState(false);
  const [bandeauFerme, setBandeauFerme] = useState(false);
  const [fini, setFini] = useState('');
  const etatsAvant = useRef(new Map<string, boolean>());
  useEffect(() => {
    setPrevenir(localStorage.getItem(CLE_PREVENIR) === '1');
  }, []);
  useEffect(() => {
    for (const id of terminees(etatsAvant.current, liste)) {
      const d = liste.find((x) => x.discussion === id);
      if (!d || !prevenir) continue;
      const derniere = [...d.messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
      const extrait = derniere.replace(/\s+/g, ' ').trim();
      if (
        document.hidden &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(`Six a fini : ${d.titre || 'Discussion'}`, {
            body: extrait.length > 120 ? extrait.slice(0, 119) + '…' : extrait,
            icon: '/icon.png',
            tag: 'six-remote-' + id,
          });
        } catch {
          /* notifications refusées par l'appareil */
        }
      } else setFini(d.titre || 'Discussion');
    }
    etatsAvant.current = new Map(liste.map((d) => [d.discussion, d.occupe]));
  }, [liste, prevenir]);

  async function activerPrevenir() {
    const ok = await autoriserNotifications();
    localStorage.setItem(CLE_PREVENIR, '1');
    setPrevenir(true);
    if (!ok) setInfo('Notifications refusées par le téléphone : Six vous préviendra dans l’écran.');
  }

  useEffect(() => {
    let arreter: (() => void) | undefined;
    let fini = false;
    void supabase().then(async (sb) => {
      if (!sb) return setConnecte(false);
      const { data } = await sb.auth.getSession();
      if (fini) return;
      setConnecte(Boolean(data.session));
      if (!data.session) return;
      setListe(await listerDirect(sb));
      arreter = ecouterDirect(
        sb,
        (d) =>
          setListe((l) =>
            'retiree' in d
              ? l.filter((x) => x.discussion !== d.discussion)
              : [d, ...l.filter((x) => x.discussion !== d.discussion)],
          ),
        (e) => setEvenements((l) => (l.some((x) => x.id === e.id) ? l : [...l, e].slice(-500))),
      );
    });
    const t = setInterval(() => setHorloge((n) => n + 1), 30_000);
    return () => {
      fini = true;
      arreter?.();
      clearInterval(t);
    };
  }, []);

  // En ouvrant une discussion : on rattrape ses derniers événements.
  useEffect(() => {
    if (!choisie) return;
    let fini = false;
    void supabase().then(async (sb) => {
      if (!sb) return;
      const recents = await evenementsRecents(sb, choisie);
      if (fini) return;
      setEvenements((l) => {
        const autres = l.filter((e) => e.discussion !== choisie);
        const ids = new Set(recents.map((e) => e.id));
        return [
          ...autres,
          ...recents,
          ...l.filter((e) => e.discussion === choisie && !ids.has(e.id)),
        ];
      });
    });
    return () => {
      fini = true;
    };
  }, [choisie]);

  // Messages du téléphone encore en file sur le PC.
  useEffect(() => {
    if (!choisie) return;
    let fini = false;
    const lire = () =>
      void supabase().then(async (sb) => {
        if (!sb) return;
        const n = await enAttenteDirect(sb, choisie).catch(() => 0);
        if (!fini) setAttente(n);
      });
    lire();
    const t = setInterval(lire, 3000);
    return () => {
      fini = true;
      clearInterval(t);
    };
  }, [choisie]);

  async function ecrire() {
    const message = texte.trim();
    if (!message || envoi) return;
    setEnvoi(true);
    setInfo('');
    try {
      const sb = await supabase();
      if (!sb) throw Error();
      const r = await envoyerDirect(sb, choisie, message);
      if (r === 'inactif') setInfo('Le remote de cette discussion est coupé sur l’ordinateur.');
      else {
        setTexte('');
        setAttente((n) => n + 1);
      }
    } catch {
      setInfo('Envoi impossible. Vérifiez la connexion.');
    } finally {
      setEnvoi(false);
    }
  }

  async function arreter() {
    setInfo('');
    try {
      const sb = await supabase();
      if (!sb) throw Error();
      await demanderArret(sb, choisie);
      setInfo('Arrêt demandé à l’ordinateur.');
    } catch {
      setInfo('Impossible de demander l’arrêt.');
    }
  }

  const discussion = liste.find((d) => d.discussion === choisie);
  const travail = useMemo(
    () => travailEnCours(evenements.filter((e) => e.discussion === choisie)),
    [evenements, choisie],
  );

  if (connecte === undefined) return <main className="remote-direct" />;
  if (!connecte)
    return (
      <main className="remote-direct">
        <p className="remote-vide">
          Connectez-vous avec le compte de votre ordinateur pour suivre Six.
        </p>
        <FormulaireConnexion />
      </main>
    );

  if (!discussion)
    return (
      <main className="remote-direct">
        <header className="remote-tete">
          <h1>Remote</h1>
        </header>
        {liste.length === 0 ? (
          <p className="remote-vide">
            Aucune discussion en direct. Sur votre ordinateur, ouvrez le panneau de session d’une
            discussion et activez le Remote.
          </p>
        ) : (
          <ul className="remote-liste">
            {liste.map((d) => (
              <li key={d.discussion}>
                <button type="button" onClick={() => setChoisie(d.discussion)}>
                  <span className="remote-point" data-actif={d.occupe || undefined} />
                  <span className="remote-ligne">
                    <strong>{d.titre || 'Discussion'}</strong>
                    <small>
                      {d.appareil} · {d.occupe ? 'Six travaille' : depuis(d.maj)}
                    </small>
                  </span>
                  <Icon name="chevron" size={15} stroke={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    );

  const actionsTerminees: ActionAgent[] = travail.termine ? [] : travail.actions;
  return (
    <main className="remote-direct">
      <header className="remote-tete">
        <button
          type="button"
          className="remote-retour"
          aria-label="Toutes les discussions"
          onClick={() => setChoisie('')}
        >
          <Icon name="back" size={18} stroke={2} />
        </button>
        <div className="remote-titre">
          <strong>{discussion.titre || 'Discussion'}</strong>
          <small>{discussion.appareil}</small>
        </div>
        <span className="remote-point" data-actif={discussion.occupe || undefined} />
      </header>
      <div className="remote-fil">
        {discussion.messages.map((m, i) => (
          <div key={i} className={'remote-message remote-' + m.role}>
            {m.content}
          </div>
        ))}
        {discussion.occupe && (
          <div className="remote-message remote-assistant">
            {travail.plan.length > 0 && <PlanTaches taches={travail.plan} enCours />}
            {actionsTerminees.length > 0 && <ActionsAgent actions={actionsTerminees} enCours />}
          </div>
        )}
        {travail.erreur && <p className="remote-erreur">{travail.erreur}</p>}
      </div>
      <footer className="remote-pied">
        {fini && (
          <p className="remote-bandeau" role="status">
            <Icon name="check" size={15} stroke={2.2} />
            <span>Six a fini : {fini}</span>
            <button type="button" aria-label="Fermer" onClick={() => setFini('')}>
              <Icon name="x" size={14} stroke={2} />
            </button>
          </p>
        )}
        {discussion.occupe && !prevenir && !bandeauFerme && (
          <p className="remote-bandeau">
            <span>Me prévenir quand c’est fini</span>
            <button type="button" className="remote-activer" onClick={() => void activerPrevenir()}>
              Activer
            </button>
            <button type="button" aria-label="Fermer" onClick={() => setBandeauFerme(true)}>
              <Icon name="x" size={14} stroke={2} />
            </button>
          </p>
        )}
        <p className="remote-etat" role="status">
          {discussion.occupe ? (
            <>
              <span className="remote-point" data-actif />
              Six travaille
              {travail.actions.length > 0 &&
                ` · ${travail.actions.length} action${travail.actions.length > 1 ? 's' : ''}`}
            </>
          ) : (
            <>Six attend sur {discussion.appareil}</>
          )}
          {attente > 0 && ` · ${attente} en file`}
        </p>
        {info && <p className="remote-info">{info}</p>}
        <form
          className="remote-saisie"
          onSubmit={(e) => {
            e.preventDefault();
            void ecrire();
          }}
        >
          <textarea
            rows={1}
            maxLength={20000}
            value={texte}
            aria-label={discussion.occupe ? 'Mettre un message en file' : 'Écrire à Six'}
            placeholder={discussion.occupe ? 'Mettre un message en file' : 'Écrire à Six'}
            onChange={(e) => setTexte(e.target.value)}
          />
          {discussion.occupe && (
            <button
              type="button"
              className="remote-arret"
              aria-label="Arrêter Six"
              title="Arrêter"
              onClick={() => void arreter()}
            >
              <span aria-hidden="true" />
            </button>
          )}
          <button
            type="submit"
            className="remote-envoyer"
            aria-label="Envoyer"
            disabled={envoi || !texte.trim()}
          >
            <Icon name="up" size={17} stroke={2.2} />
          </button>
        </form>
      </footer>
    </main>
  );
}
