import { supabase } from './supabase';
import type { ChatMessage } from './types';

/**
 * Cloud de Six (réservé à Six Premium) :
 * - synchronisation : la mémoire suit la personne sur ses appareils (lib/compte.ts, autoriserSync) ;
 * - partage : une discussion envoyée dans le Cloud devient lisible par lien, par n'importe qui (table partages,
 *   voir setup_cloud_supabase.sql). Supabase vérifie lui-même le Premium à la création ; la lecture passe par la
 *   fonction lire_partage, qui ne renvoie qu'un partage, jamais la liste.
 *
 * Seul le texte part (questions et réponses) : ni pièces jointes, ni images, ni documents.
 */

export type Partage = { id: string; titre: string; cree_le: string; expire_le: string };
export type MessagePartage = { role: 'user' | 'assistant'; content: string };
export type PartageLu = {
  titre: string;
  type: string;
  contenu: { messages?: MessagePartage[] };
  cree_le: string;
  expire_le: string;
};

/** Les liens de partage pointent toujours vers l'app en ligne (lisible par tout le monde). */
export const SITE_PARTAGE = 'https://app.sixbysevenai.com';
const MESSAGES_MAX = 200;
const TEXTE_MAX = 20_000;

export const lienPartage = (id: string) => `${SITE_PARTAGE}/partage/${id}`;

function messageErreur(e: { message?: string; code?: string } | null): string {
  const m = (e?.message ?? '').toLowerCase();
  if (e?.code === '42501' || m.includes('row-level security'))
    return 'Le partage fait partie du Cloud, réservé à Six Premium.';
  if (e?.code === '42P01' || e?.code === 'PGRST205' || m.includes('does not exist'))
    return 'Le partage n’est pas encore activé sur le serveur.';
  if (m.includes('fetch') || m.includes('network')) return 'Pas de connexion. Réessayez.';
  return 'Le partage n’a pas pu être créé. Réessayez.';
}

/** Texte seul, borné : ce qui part dans le Cloud. */
export function messagesAPartager(messages: ChatMessage[]): MessagePartage[] {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .slice(-MESSAGES_MAX)
    .map((m) => ({ role: m.role, content: m.content.slice(0, TEXTE_MAX) }));
}

export async function partagerDiscussion(
  titre: string,
  messages: ChatMessage[],
): Promise<{ lien: string } | { erreur: string }> {
  const sb = await supabase();
  if (!sb) return { erreur: 'Le Cloud n’est pas disponible pour le moment.' };
  const { data: session } = await sb.auth.getSession();
  const id = session.session?.user.id;
  if (!id) return { erreur: 'Connectez-vous pour partager une discussion.' };
  const contenu = { messages: messagesAPartager(messages) };
  if (!contenu.messages.length) return { erreur: 'Cette discussion est vide.' };
  const { data, error } = await sb
    .from('partages')
    .insert({ user_id: id, titre: titre.trim().slice(0, 200) || 'Discussion', contenu })
    .select('id')
    .single();
  if (error || !data) return { erreur: messageErreur(error) };
  return { lien: lienPartage((data as { id: string }).id) };
}

export async function mesPartages(): Promise<Partage[] | null> {
  const sb = await supabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from('partages')
    .select('id, titre, cree_le, expire_le')
    .order('cree_le', { ascending: false })
    .limit(100);
  return error ? null : ((data ?? []) as Partage[]);
}

export async function supprimerPartage(id: string): Promise<boolean> {
  const sb = await supabase();
  if (!sb) return false;
  const { error } = await sb.from('partages').delete().eq('id', id);
  return !error;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lit un partage par son identifiant (sans compte). Null : introuvable, expiré ou supprimé. */
export async function lirePartage(id: string): Promise<PartageLu | null> {
  if (!UUID.test(id)) return null;
  const sb = await supabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('lire_partage', { p_id: id });
  const ligne = Array.isArray(data) ? (data[0] as PartageLu | undefined) : undefined;
  return error || !ligne ? null : ligne;
}
