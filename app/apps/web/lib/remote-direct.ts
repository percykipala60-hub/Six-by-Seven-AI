/**
 * Remote en direct (privé, même compte) — app/setup_remote_direct_supabase.sql.
 * Le PC publie l'état de la discussion et chaque action de Six ; le téléphone du même compte les reçoit par
 * Supabase Realtime, sans lien. Les règles d'accès limitent tout au propriétaire.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { messagesAPartager } from './cloud';
import type { ActionAgent } from './actions-agent';
import type { ChatMessage } from './types';

export type GenreEvenement = 'debut' | 'action' | 'plan' | 'fin' | 'erreur';

export type EvenementDirect = {
  id: number;
  discussion: string;
  genre: GenreEvenement;
  donnees: {
    action?: ActionAgent;
    taches?: { texte: string; faite: boolean }[];
    texte?: string;
  };
  cree: string;
};

export type DiscussionDirecte = {
  discussion: string;
  titre: string;
  appareil: string;
  occupe: boolean;
  messages: ReturnType<typeof messagesAPartager>;
  maj: string;
};

/** Nom court de l'appareil qui publie (« PC Windows », « Mac »…), pour la liste du téléphone. */
export function nomAppareil(
  ua = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): string {
  if (/Windows/i.test(ua)) return 'PC Windows';
  if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'PC Linux';
  return 'Appareil';
}

/** Événement limité à ce que la table accepte (20 ko) : un texte trop long est coupé. */
export function evenementPublie(genre: GenreEvenement, donnees: EvenementDirect['donnees']) {
  const propre = { ...donnees };
  if (propre.texte && propre.texte.length > 4000) propre.texte = propre.texte.slice(0, 4000) + '…';
  if (propre.action && propre.action.texte.length > 500)
    propre.action = { ...propre.action, texte: propre.action.texte.slice(0, 500) + '…' };
  return { genre, donnees: propre };
}

/** Publie pour une discussion : l'état (titre, Six occupé, fil) et les événements. Ne lance jamais d'erreur. */
export function publicateurDirect(discussion: string) {
  let dernierEtat = '';
  return {
    async etat(titre: string, occupe: boolean, messages: ChatMessage[]) {
      const ligne = {
        discussion,
        titre: titre.slice(0, 200),
        appareil: nomAppareil(),
        occupe,
        messages: messagesAPartager(messages),
        maj: new Date().toISOString(),
      };
      const cle = JSON.stringify([ligne.titre, occupe, ligne.messages]);
      if (cle === dernierEtat) return;
      // Trois essais espacés : un échec passager (réseau, jeton à rafraîchir) ne laisse pas le téléphone en retard.
      for (let essai = 0; essai < 3; essai++) {
        try {
          const sb = await supabase();
          if (!sb) return;
          const { error } = await sb
            .from('six_direct_discussions')
            .upsert(ligne, { onConflict: 'proprietaire,discussion' });
          if (!error) {
            dernierEtat = cle;
            return;
          }
        } catch {
          /* Hors ligne : on réessaie. */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    },
    async evenement(genre: GenreEvenement, donnees: EvenementDirect['donnees'] = {}) {
      try {
        const sb = await supabase();
        if (!sb) return;
        await sb
          .from('six_direct_evenements')
          .insert({ discussion, ...evenementPublie(genre, donnees) });
      } catch {
        /* Un événement perdu n'empêche pas le travail de Six. */
      }
    },
    async retirer() {
      try {
        const sb = await supabase();
        if (!sb) return;
        await sb.from('six_direct_discussions').delete().eq('discussion', discussion);
        await sb.from('six_direct_evenements').delete().eq('discussion', discussion);
      } catch {
        /* Rien à faire hors ligne. */
      }
    },
  };
}

/** Les discussions publiées par les appareils du compte, la plus récente d'abord. */
export async function listerDirect(sb: SupabaseClient): Promise<DiscussionDirecte[]> {
  const { data } = await sb
    .from('six_direct_discussions')
    .select('discussion,titre,appareil,occupe,messages,maj')
    .order('maj', { ascending: false })
    .limit(50);
  return (data ?? []) as DiscussionDirecte[];
}

/** Les derniers événements d'une discussion (pour un téléphone qui arrive en cours de route). */
export async function evenementsRecents(
  sb: SupabaseClient,
  discussion: string,
): Promise<EvenementDirect[]> {
  const { data } = await sb
    .from('six_direct_evenements')
    .select('id,discussion,genre,donnees,cree')
    .eq('discussion', discussion)
    .order('id', { ascending: false })
    .limit(200);
  return ((data ?? []) as EvenementDirect[]).reverse();
}

/** Écoute en direct les discussions et les événements du compte. Renvoie de quoi arrêter l'écoute. */
export function ecouterDirect(
  sb: SupabaseClient,
  surDiscussion: (d: DiscussionDirecte | { discussion: string; retiree: true }) => void,
  surEvenement: (e: EvenementDirect) => void,
): () => void {
  const canal = sb
    .channel('six-direct-' + Math.random().toString(36).slice(2))
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'six_direct_discussions' },
      (p) => {
        if (p.eventType === 'DELETE') {
          const ancien = p.old as { discussion?: string };
          if (ancien.discussion) surDiscussion({ discussion: ancien.discussion, retiree: true });
        } else surDiscussion(p.new as DiscussionDirecte);
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'six_direct_evenements' },
      (p) => surEvenement(p.new as EvenementDirect),
    )
    .subscribe();
  return () => void sb.removeChannel(canal);
}

/**
 * Le téléphone écrit à Six : le message part dans la file du remote de cette discussion, et le PC le traite dès
 * que Six est libre (« mettre en file » pendant qu'il travaille).
 */
export async function envoyerDirect(
  sb: SupabaseClient,
  discussion: string,
  texte: string,
): Promise<'envoye' | 'inactif'> {
  const { data } = await sb
    .from('six_remotes')
    .select('lien')
    .eq('discussion', discussion)
    .eq('public_lecture', false)
    .maybeSingle();
  const lien = (data as { lien?: string } | null)?.lien;
  if (!lien) return 'inactif';
  const { error } = await sb
    .from('six_remote_envois')
    .insert({ id: crypto.randomUUID(), lien, texte: texte.trim().slice(0, 20000) });
  if (error) throw error;
  return 'envoye';
}

/** Messages du téléphone qui attendent leur tour sur le PC. */
export async function enAttenteDirect(sb: SupabaseClient, discussion: string): Promise<number> {
  const { data } = await sb
    .from('six_remotes')
    .select('lien')
    .eq('discussion', discussion)
    .maybeSingle();
  const lien = (data as { lien?: string } | null)?.lien;
  if (!lien) return 0;
  const { count } = await sb
    .from('six_remote_envois')
    .select('id', { count: 'exact', head: true })
    .eq('lien', lien)
    .in('etat', ['attente', 'traitement']);
  return count ?? 0;
}

/** Le téléphone demande d'arrêter la tâche en cours ; le PC l'applique à son prochain passage (2 s). */
export async function demanderArret(sb: SupabaseClient, discussion: string): Promise<void> {
  const { error } = await sb
    .from('six_direct_discussions')
    .update({ arret: new Date().toISOString() })
    .eq('discussion', discussion);
  if (error) throw error;
}
