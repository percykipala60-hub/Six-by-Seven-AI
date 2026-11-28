'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { messagesAPartager } from '@/lib/cloud';
import type { ChatMessage } from '@/lib/types';
import { publicateurDirect, type EvenementDirect, type GenreEvenement } from '@/lib/remote-direct';

type Activation = { lien: string; public_lecture: boolean; ecrivains: string[] };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Adresses autorisées à écrire : séparées par des virgules, espaces ou retours, en minuscules, 20 au plus. */
export function lireAdresses(texte: string): string[] | null {
  const liste = [
    ...new Set(
      texte
        .split(/[\s,;]+/)
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return liste.length <= 20 && liste.every((a) => EMAIL.test(a)) ? liste : null;
}
export type EtatRemote = ReturnType<typeof useRemote>;

/** Remote d'une discussion : la synchronisation tourne tant que la discussion est ouverte ; l'interface
 *  (interrupteur, options, bouton Partager) vit dans le panneau de session. */
export function useRemote({
  discussion,
  messages,
  titre,
  disponible,
  recevoir,
  travail = false,
  arreter,
}: {
  discussion: string | null;
  messages: ChatMessage[];
  titre: string;
  disponible: boolean;
  recevoir: (texte: string) => Promise<unknown>;
  /** Six travaille sur cette discussion (montré en direct au téléphone). */
  travail?: boolean;
  /** Arrête la tâche en cours (demandé depuis le téléphone). */
  arreter?: () => void;
}) {
  const [remote, setRemote] = useState<Activation | null>(null);
  const [publique, setPublique] = useState(false);
  const [adresses, setAdresses] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const courant = useRef({ messages, titre, disponible, recevoir, travail, arreter });
  // Remote privé : la discussion et les actions de Six partent en direct vers les appareils du compte (sans lien).
  const direct = useMemo(
    () => (remote && !remote.public_lecture && discussion ? publicateurDirect(discussion) : null),
    [remote, discussion],
  );
  useEffect(() => {
    if (!direct) return;
    const t = setTimeout(() => void direct.etat(titre, travail, messages), 600);
    return () => clearTimeout(t);
  }, [direct, titre, travail, messages]);
  useEffect(() => {
    courant.current = { messages, titre, disponible, recevoir, travail, arreter };
  });
  useEffect(() => {
    let actif = true;
    setRemote(null);
    setAdresses('');
    setErreur('');
    if (!discussion) return;
    void supabase().then(async (sb) => {
      if (!sb) return;
      const { data } = await sb
        .from('six_remotes')
        .select('lien,public_lecture,ecrivains')
        .eq('discussion', discussion)
        .maybeSingle();
      if (actif && data) {
        setRemote(data as Activation);
        setAdresses((data as Activation).ecrivains.join(', '));
      }
    });
    return () => {
      actif = false;
    };
  }, [discussion]);

  useEffect(() => {
    if (!remote) return;
    let fini = false;
    let publie: ChatMessage[] | undefined;
    let dernierArret: string | null | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function suivre() {
      try {
        const sb = await supabase();
        if (!sb || fini || !remote) return;
        const etat = courant.current;
        if (publie !== etat.messages) {
          const { data, error } = await sb
            .from('six_remotes')
            .update({
              messages: messagesAPartager(etat.messages),
              titre: etat.titre,
            })
            .eq('lien', remote.lien)
            .select('lien')
            .maybeSingle();
          if (error) throw error;
          if (fini) return;
          if (!data) {
            setRemote(null);
            return;
          }
          publie = etat.messages;
        }
        // Remote privé : le téléphone a-t-il demandé l'arrêt depuis la dernière fois ?
        if (!remote.public_lecture && discussion) {
          const { data: d } = await sb
            .from('six_direct_discussions')
            .select('arret')
            .eq('discussion', discussion)
            .maybeSingle();
          const arret = (d as { arret?: string | null } | null)?.arret;
          if (arret && arret !== dernierArret) {
            const premier = dernierArret === undefined;
            dernierArret = arret;
            // Une demande déjà là à l'activation est ancienne : on ne l'applique pas.
            if (!premier && courant.current.travail) courant.current.arreter?.();
          } else if (dernierArret === undefined) dernierArret = arret ?? null;
        }
        if (!remote.public_lecture && courant.current.disponible) {
          const { data, error } = await sb.rpc('six_remote_prendre', { p_lien: remote.lien });
          if (error) throw error;
          const envoi = data?.[0];
          if (envoi) {
            let reussi = false;
            // Signal « je travaille encore » : sans lui, un autre poste reprend le message après 3 minutes.
            const vivant = setInterval(
              () => void sb.rpc('six_remote_prolonger', { p_id: envoi.id }),
              60_000,
            );
            try {
              if (!fini) reussi = Boolean(await courant.current.recevoir(envoi.texte));
            } finally {
              clearInterval(vivant);
              await sb
                .from('six_remote_envois')
                .update({ etat: reussi ? 'termine' : 'echec' })
                .eq('id', envoi.id);
            }
          }
        }
      } catch {
        if (!fini) setErreur('Synchronisation interrompue. Nouvelle tentative en cours.');
      } finally {
        if (!fini) timer = setTimeout(() => void suivre(), 2000);
      }
    }
    void suivre();
    return () => {
      fini = true;
      clearTimeout(timer);
    };
  }, [remote, discussion]);

  async function basculer() {
    if (!discussion) return;
    setOccupe(true);
    setErreur('');
    try {
      const sb = await supabase();
      if (!sb) throw Error();
      if (remote) {
        const { error } = await sb.from('six_remotes').delete().eq('lien', remote.lien);
        if (error) throw error;
        await direct?.retirer();
        setRemote(null);
      } else {
        const ecrivains = publique ? [] : lireAdresses(adresses);
        if (!ecrivains) {
          setErreur(
            'Adresses invalides : une adresse e-mail par ligne ou séparées par des virgules, 20 au plus.',
          );
          return;
        }
        const { data, error } = await sb
          .from('six_remotes')
          .insert({
            discussion,
            titre,
            public_lecture: publique,
            ecrivains,
            messages: messagesAPartager(messages),
          })
          .select('lien,public_lecture,ecrivains')
          .single();
        if (error) throw error;
        setRemote(data as Activation);
      }
    } catch {
      setErreur(
        'Impossible de modifier le remote. Vérifiez la connexion et la configuration Supabase.',
      );
    } finally {
      setOccupe(false);
    }
  }
  async function enregistrerAdresses() {
    if (!remote) return;
    const ecrivains = lireAdresses(adresses);
    if (!ecrivains) {
      setErreur(
        'Adresses invalides : une adresse e-mail par ligne ou séparées par des virgules, 20 au plus.',
      );
      return;
    }
    setOccupe(true);
    setErreur('');
    try {
      const sb = await supabase();
      if (!sb) throw Error();
      const { error } = await sb.from('six_remotes').update({ ecrivains }).eq('lien', remote.lien);
      if (error) throw error;
      setRemote({ ...remote, ecrivains });
      setAdresses(ecrivains.join(', '));
    } catch {
      setErreur('Impossible d’enregistrer les adresses. Vérifiez la connexion.');
    } finally {
      setOccupe(false);
    }
  }
  const prive = !(remote?.public_lecture ?? publique);
  const lien = remote
    ? (process.env.NEXT_PUBLIC_REMOTE_ORIGIN || window.location.origin).replace(/\/$/, '') +
      '/remote/' +
      remote.lien
    : '';
  return {
    /** Publie un événement en direct (début, action, plan, fin, erreur) ; sans effet hors remote privé. */
    publier: (genre: GenreEvenement, donnees?: EvenementDirect['donnees']) =>
      void direct?.evenement(genre, donnees),
    possible: Boolean(discussion),
    actif: Boolean(remote),
    lien,
    prive,
    publique,
    setPublique,
    adresses,
    setAdresses,
    enregistrerAdresses,
    basculer,
    occupe,
    erreur,
  };
}
