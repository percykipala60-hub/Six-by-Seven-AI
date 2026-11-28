'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { MessagePartage } from '@/lib/cloud';
import { FormulaireConnexion } from './Connexion';

type Fil = { titre: string; messages: MessagePartage[]; editeur: boolean };
export function RemoteVue({ id }: { id: string }) {
  const [fil, setFil] = useState<Fil | null>();
  const [invite, setInvite] = useState(false);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const tentative = useRef<{ id: string; texte: string } | null>(null);
  const dernier = useRef('');
  const [info, setInfo] = useState('');
  useEffect(() => {
    let fini = false;
    let timer: ReturnType<typeof setTimeout>;
    async function lire() {
      try {
        const sb = await supabase();
        if (!sb) throw Error();
        const { data, error } = await sb.rpc('six_remote_lire', { p_lien: id });
        const { data: session } = await sb.auth.getSession();
        if (!fini) {
          setFil(error ? null : (data?.[0] ?? null));
          setInvite(!session.session);
          if (dernier.current && data?.[0]?.editeur) {
            const { data: recu } = await sb
              .from('six_remote_envois')
              .select('etat')
              .eq('id', dernier.current)
              .maybeSingle();
            if (!fini && recu?.etat === 'echec')
              setInfo('Le poste d’origine n’a pas pu traiter le message.');
            if (!fini && recu?.etat === 'termine') setInfo('Réponse reçue.');
            if (!fini && recu?.etat === 'traitement')
              setInfo('Message pris en charge sur le poste d’origine.');
          }
        }
      } catch {
        if (!fini) setFil(null);
      } finally {
        if (!fini) timer = setTimeout(() => void lire(), 2000);
      }
    }
    void lire();
    return () => {
      fini = true;
      clearTimeout(timer);
    };
  }, [id]);
  async function envoyer() {
    if (envoi || !fil?.editeur || !texte.trim()) return;
    setEnvoi(true);
    try {
      const sb = await supabase();
      if (!sb) throw Error();
      if (tentative.current?.texte !== texte)
        tentative.current = { id: crypto.randomUUID(), texte };
      const demande = tentative.current;
      const { error } = await sb
        .from('six_remote_envois')
        .insert({ id: demande.id, lien: id, texte: texte.trim() });
      if (error && error.code !== '23505') throw error;
      dernier.current = demande.id;
      tentative.current = null;
      setTexte('');
      setInfo(
        'Message transmis. Six le traite lorsque la discussion est ouverte sur le poste d’origine.',
      );
    } catch {
      setInfo('Envoi impossible. Vérifiez votre accès.');
    } finally {
      setEnvoi(false);
    }
  }
  if (!fil)
    return (
      <main className="partage">
        <p>
          {fil === undefined
            ? 'Ouverture de la discussion…'
            : 'Lien désactivé ou accès indisponible.'}
        </p>
        {invite && <FormulaireConnexion />}
      </main>
    );
  return (
    <main className="partage">
      <h1>{fil.titre}</h1>
      <p>{fil.editeur ? 'Remote privé' : 'Lecture seule'}</p>
      <div className="partage-fil">
        {fil.messages.map((m, i) => (
          <div className={'partage-message partage-' + m.role} key={i}>
            <strong>{m.role === 'user' ? 'Vous' : 'Six'}</strong>
            <p>{m.content}</p>
          </div>
        ))}
      </div>
      {fil.editeur && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void envoyer();
          }}
        >
          <label>
            Message{' '}
            <textarea
              required
              maxLength={20000}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
            />
          </label>
          <button disabled={envoi || !texte.trim()}>Envoyer</button>
          <p role="status">{info}</p>
        </form>
      )}
    </main>
  );
}
