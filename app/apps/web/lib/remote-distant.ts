'use client';

/**
 * Discussions Remote vues depuis un autre appareil du même compte (le téléphone, surtout) : elles apparaissent
 * dans les Récents habituels (avec un logo Remote) et s'ouvrent dans l'écran de discussion normal, comme un
 * changement d'environnement. Rien de technique n'est montré : un message envoyé s'affiche tout de suite ;
 * s'il n'a pas pu partir, il revient dans la barre de saisie.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import {
  demanderArret,
  ecouterDirect,
  envoyerDirect,
  evenementsRecents,
  listerDirect,
  type DiscussionDirecte,
  type EvenementDirect,
} from './remote-direct';
import type { ActionAgent } from './actions-agent';
import type { ChatMessage } from './types';

/** Ce que Six fait en ce moment : les événements depuis le dernier début de tâche. */
export function travailEnCours(evenements: EvenementDirect[]) {
  let debut = -1;
  evenements.forEach((e, i) => {
    if (e.genre === 'debut') debut = i;
  });
  const suite = debut < 0 ? [] : evenements.slice(debut);
  const actions: ActionAgent[] = suite.flatMap((e) =>
    e.genre === 'action' && e.donnees.action ? [e.donnees.action] : [],
  );
  const plan =
    suite.filter((e) => e.genre === 'plan' && e.donnees.taches).at(-1)?.donnees.taches ?? [];
  return { actions, plan };
}

/** Les discussions Remote du compte, la plus récente d'abord, mises à jour en direct. */
export function useDiscussionsDistantes(actif = true): DiscussionDirecte[] {
  const [liste, setListe] = useState<DiscussionDirecte[]>([]);
  useEffect(() => {
    if (!actif) return;
    let arreter: (() => void) | undefined;
    let fini = false;
    void supabase().then(async (sb) => {
      if (!sb) return;
      const { data } = await sb.auth.getSession();
      if (fini || !data.session) return;
      const debut = await listerDirect(sb).catch(() => []);
      if (fini) return;
      setListe(debut);
      arreter = ecouterDirect(
        sb,
        (d) =>
          setListe((l) =>
            'retiree' in d
              ? l.filter((x) => x.discussion !== d.discussion)
              : [d, ...l.filter((x) => x.discussion !== d.discussion)],
          ),
        () => {},
      );
    });
    return () => {
      fini = true;
      arreter?.();
    };
  }, [actif]);
  return liste;
}

type Envoi = { id: string; texte: string; avant: number };

/** Une discussion Remote ouverte : fil, travail en cours, envoi et arrêt. Inactif si id est vide. */
export function useDiscussionDistante(id: string) {
  const [discussion, setDiscussion] = useState<DiscussionDirecte | null>(null);
  const [evenements, setEvenements] = useState<EvenementDirect[]>([]);
  const [envois, setEnvois] = useState<Envoi[]>([]);
  const idRef = useRef(id);
  useEffect(() => {
    idRef.current = id;
  });

  useEffect(() => {
    setDiscussion(null);
    setEvenements([]);
    setEnvois([]);
    if (!id) return;
    let arreter: (() => void) | undefined;
    let fini = false;
    void supabase().then(async (sb) => {
      if (!sb) return;
      const [liste, recents] = await Promise.all([
        listerDirect(sb).catch(() => []),
        evenementsRecents(sb, id).catch(() => []),
      ]);
      if (fini) return;
      setDiscussion(liste.find((d) => d.discussion === id) ?? null);
      setEvenements(recents);
      arreter = ecouterDirect(
        sb,
        (d) => {
          if (d.discussion !== id) return;
          setDiscussion('retiree' in d ? null : d);
        },
        (e) => {
          if (e.discussion !== id) return;
          setEvenements((l) => (l.some((x) => x.id === e.id) ? l : [...l, e].slice(-500)));
        },
      );
    });
    return () => {
      fini = true;
      arreter?.();
    };
  }, [id]);

  // Un message envoyé reste affiché jusqu'à ce que le fil de l'ordinateur le contienne.
  const recus = useMemo(() => discussion?.messages ?? [], [discussion]);
  useEffect(() => {
    setEnvois((l) =>
      l.filter(
        (e) => !recus.slice(e.avant).some((m) => m.role === 'user' && m.content.trim() === e.texte),
      ),
    );
  }, [recus]);

  const messages: ChatMessage[] = useMemo(
    () => [
      ...recus.map((m) => ({ role: m.role, content: m.content })),
      ...envois.map((e) => ({ role: 'user' as const, content: e.texte })),
    ],
    [recus, envois],
  );
  const travail = useMemo(() => travailEnCours(evenements), [evenements]);

  /** Envoie au poste. Faux si le message n'a pas pu partir (il faut le remettre dans la barre). */
  async function envoyer(texte: string): Promise<boolean> {
    const propre = texte.trim();
    if (!propre || !idRef.current) return false;
    const envoi = { id: crypto.randomUUID(), texte: propre, avant: recus.length };
    setEnvois((l) => [...l, envoi]);
    try {
      const sb = await supabase();
      if (!sb) throw Error();
      if ((await envoyerDirect(sb, idRef.current, propre)) !== 'envoye') throw Error();
      return true;
    } catch {
      setEnvois((l) => l.filter((e) => e.id !== envoi.id));
      return false;
    }
  }

  async function arreter() {
    const sb = await supabase();
    if (sb && idRef.current) await demanderArret(sb, idRef.current).catch(() => {});
  }

  return {
    actif: Boolean(id),
    trouvee: Boolean(discussion),
    titre: discussion?.titre ?? '',
    appareil: discussion?.appareil ?? '',
    occupe: Boolean(discussion?.occupe) || envois.length > 0,
    messages,
    actions: travail.actions,
    plan: travail.plan,
    envoyer,
    arreter,
  };
}
