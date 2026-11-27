'use client';

import { supabase } from './supabase';
import { entetesCompte } from './premium-client';
import { noterMethode, nomCetAppareil } from './securite';

/**
 * Connexion par code QR, comme Steam (voir app/setup_securite_connexion_supabase.sql) :
 * 1. l'appareil qui veut se connecter crée une demande (2 minutes) et l'affiche en QR ;
 * 2. un appareil déjà connecté la scanne avec Six, voit le nom de l'appareil et approuve ;
 * 3. le premier appareil reçoit un jeton à usage unique et se connecte au même compte.
 * Le QR est un lien (https://app.sixbysevenai.com/qr#…) : l'appareil photo d'un téléphone l'ouvre aussi.
 */

export type DemandeQr = { id: string; secret: string; expire: number };

const SITE_QR = 'https://app.sixbysevenai.com/qr';

export function lienQr(d: Pick<DemandeQr, 'id' | 'secret'>): string {
  return `${SITE_QR}#i=${d.id}&s=${d.secret}`;
}

/** Lit un code scanné (le lien de Six) : identifiant et secret, ou null si ce n'est pas un code de connexion Six. */
export function lireLienQr(texte: string): Pick<DemandeQr, 'id' | 'secret'> | null {
  try {
    const u = new URL(texte.trim());
    if (!/^https?:$/.test(u.protocol) || !u.pathname.replace(/\/$/, '').endsWith('/qr'))
      return null;
    const p = new URLSearchParams(u.hash.slice(1));
    const id = p.get('i') ?? '';
    const secret = p.get('s') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{48}$/.test(secret)) return null;
    return { id, secret };
  } catch {
    return null;
  }
}

/** Un appel au serveur qui ne répond pas ne doit jamais figer le code QR : au-delà du délai, il est abandonné. */
function avecDelai<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resoudre, rejeter) => {
    const t = setTimeout(() => rejeter(new Error('délai dépassé')), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resoudre(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        rejeter(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Nouvelle demande de connexion (affichée en QR sur l'écran de connexion). */
export async function creerDemandeQr(): Promise<DemandeQr> {
  const sb = await supabase();
  if (!sb) throw new Error('Connexion indisponible.');
  const { data, error } = await avecDelai(
    sb.rpc('six_qr_creer', { p_appareil: nomCetAppareil() }),
    10_000,
  );
  const d = Array.isArray(data)
    ? (data[0] as { id: string; secret: string; expire_le: string })
    : null;
  if (error || !d) throw new Error('Code QR indisponible pour le moment.');
  return { id: d.id, secret: d.secret, expire: Date.parse(d.expire_le) || Date.now() + 120_000 };
}

/**
 * Vérifie si la demande a été approuvée. Si oui, connecte cet appareil (jeton à usage unique) et renvoie
 * « connecte ». Sinon : « attente », « expire » ou « refuse ».
 */
export async function attendreDemandeQr(
  d: DemandeQr,
): Promise<'attente' | 'connecte' | 'expire' | 'refuse'> {
  if (Date.now() > d.expire) return 'expire';
  const sb = await supabase();
  if (!sb) return 'attente';
  let reponse;
  try {
    reponse = await avecDelai(sb.rpc('six_qr_attendre', { p_id: d.id, p_secret: d.secret }), 8_000);
  } catch {
    return 'attente'; // pas de réponse : on revérifie au tour suivant
  }
  const { data, error } = reponse;
  const r = Array.isArray(data) ? (data[0] as { statut: string; token_hash: string | null }) : null;
  if (error || !r) return 'attente';
  if (r.statut === 'approuve' && r.token_hash) {
    noterMethode('Code QR');
    try {
      const { error: e } = await avecDelai(
        sb.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' }),
        15_000,
      );
      return e ? 'refuse' : 'connecte';
    } catch {
      return 'connecte'; // réponse perdue : la session est peut-être déjà enregistrée, l'écran se recharge
    }
  }
  if (r.statut === 'expire' || r.statut === 'inconnu' || r.statut === 'consomme') return 'expire';
  if (r.statut === 'refuse') return 'refuse';
  return 'attente';
}

/** Appareil qui demande à se connecter (pour la confirmation sur l'appareil qui a scanné). */
export async function lireDemandeQr(
  d: Pick<DemandeQr, 'id' | 'secret'>,
): Promise<{ appareil: string; statut: string } | null> {
  const sb = await supabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('six_qr_lire', { p_id: d.id, p_secret: d.secret });
  const r = Array.isArray(data) ? (data[0] as { appareil: string; statut: string }) : null;
  return error || !r ? null : r;
}

/** L'appareil connecté approuve : l'autre appareil sera connecté au même compte. */
export async function approuverDemandeQr(
  d: Pick<DemandeQr, 'id' | 'secret'>,
): Promise<string | null> {
  try {
    const r = await fetch('/api/qr/approuver', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
      body: JSON.stringify(d),
    });
    if (r.ok) return null;
    const e = (await r.json().catch(() => ({}))) as { error?: string };
    return e.error ?? 'Connexion impossible pour le moment. Réessayez.';
  } catch {
    return 'Pas de réseau. Réessayez dans un instant.';
  }
}
