'use client';

import { entetesCompte } from './premium-client';

/**
 * GitHub côté app (Réglages → Cloud) : relier son compte GitHub à Six, voir ses dépôts autorisés, se délier.
 * L'état de sécurité de l'aller-retour est signé par le serveur et lié au compte : le serveur le vérifie au retour.
 */

export type DepotGithub = { nom: string; prive: boolean; branche: string; maj: string };
export type EtatGithub =
  | { relie: true; login: string; depots: DepotGithub[]; gerer: string }
  | { relie: false; adresse: string }
  | { erreur: string };

async function erreurDe(r: Response, defaut: string): Promise<string> {
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  return d.error ?? defaut;
}

export async function lireGithub(): Promise<EtatGithub> {
  try {
    const r = await fetch('/api/github', { headers: await entetesCompte(), cache: 'no-store' });
    if (!r.ok) return { erreur: await erreurDe(r, 'GitHub est indisponible pour le moment.') };
    return (await r.json()) as EtatGithub;
  } catch {
    return { erreur: 'GitHub est indisponible pour le moment (hors ligne ?).' };
  }
}

/** Part sur GitHub : autoriser Six (puis, la première fois, installer l'application et choisir ses dépôts). */
export function connecterGithub(adresse: string): void {
  window.location.assign(adresse);
}

/**
 * Retour de GitHub : relie le compte (le serveur vérifie l'état). « relie », l'adresse où installer l'application
 * (première fois : choisir ses dépôts), ou un message d'erreur.
 */
export async function terminerGithub(
  code: string,
  installation: string,
  etat: string,
): Promise<{ relie: true } | { installer: string } | { erreur: string }> {
  try {
    const r = await fetch('/api/github', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await entetesCompte()) },
      body: JSON.stringify({ code, etat, ...(installation ? { installation } : {}) }),
    });
    if (!r.ok) return { erreur: await erreurDe(r, 'La liaison avec GitHub a échoué.') };
    const d = (await r.json().catch(() => ({}))) as { relie?: boolean; installer?: string };
    if (d.relie) return { relie: true };
    if (d.installer?.startsWith('https://github.com/')) return { installer: d.installer };
    return { erreur: 'La liaison avec GitHub a échoué.' };
  } catch {
    return { erreur: 'La liaison avec GitHub a échoué (hors ligne ?).' };
  }
}

export async function delierGithub(): Promise<string | null> {
  try {
    const r = await fetch('/api/github', { method: 'DELETE', headers: await entetesCompte() });
    return r.ok ? null : await erreurDe(r, 'Impossible de retirer GitHub pour le moment.');
  } catch {
    return 'Impossible de retirer GitHub pour le moment (hors ligne ?).';
  }
}
