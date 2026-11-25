'use client';

import { entetesCompte } from './premium-client';
import { plateforme } from './plateforme';
import { identifiantAppareil } from './securite';

/**
 * Appareils connectés au compte (Réglages → Appareils connectés), comme dans Claude ou WhatsApp :
 * - la liste vient du serveur (chaque connexion enregistre son appareil, voir lib/securite.ts) ;
 * - « Déconnecter » supprime la session d'un autre appareil (il pourra se reconnecter) ;
 * - « Associer un appareil » ouvre le scanner de code QR, seulement sur téléphone (un PC n'a pas de caméra
 *   tournée vers l'écran d'un autre appareil : on y affiche le code, on ne le scanne pas).
 */

export type Appareil = {
  appareil: string;
  nom: string;
  methode: string;
  cree_le: string;
  derniere_connexion: string;
  connecte: boolean;
  /** principal (mot de passe, Google…), hôte (plus ancien quand aucun principal n'est là) ou secondaire (code QR). */
  role?: 'principal' | 'hote' | 'secondaire';
  /** Cet appareil-ci a le droit de le déconnecter. */
  gerable?: boolean;
};

export type ListeAppareils =
  { appareils: Appareil[]; cetAppareil: string; gestion: boolean } | { erreur: string };

async function lireErreur(r: Response, defaut: string): Promise<string> {
  const d = (await r.json().catch(() => ({}))) as { error?: string };
  return d.error ?? defaut;
}

const ici = () => `appareil=${encodeURIComponent(identifiantAppareil())}`;

export async function lireAppareils(): Promise<ListeAppareils> {
  try {
    const r = await fetch(`/api/compte/appareils?${ici()}`, {
      headers: await entetesCompte(),
      cache: 'no-store',
    });
    if (!r.ok) return { erreur: await lireErreur(r, 'La liste des appareils est indisponible.') };
    const d = (await r.json()) as { appareils?: Appareil[]; gestion?: boolean };
    return {
      appareils: d.appareils ?? [],
      cetAppareil: identifiantAppareil(),
      gestion: d.gestion === true,
    };
  } catch {
    return { erreur: 'La liste des appareils est indisponible (hors ligne ?).' };
  }
}

/** Déconnecte un autre appareil du compte (si cet appareil en a le droit). Message d'erreur, ou null si c'est fait. */
export async function deconnecterAppareil(cible: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/compte/appareils?${ici()}&cible=${encodeURIComponent(cible)}`, {
      method: 'DELETE',
      headers: await entetesCompte(),
    });
    return r.ok ? null : await lireErreur(r, 'Déconnexion de l’appareil impossible.');
  } catch {
    return 'Déconnexion de l’appareil impossible (hors ligne ?).';
  }
}

/** Déconnecte tous les autres appareils que cet appareil a le droit de déconnecter. */
export async function deconnecterAutresAppareils(): Promise<string | null> {
  try {
    const r = await fetch(`/api/compte/appareils?${ici()}&tous=1`, {
      method: 'DELETE',
      headers: await entetesCompte(),
    });
    return r.ok ? null : await lireErreur(r, 'Déconnexion des autres appareils impossible.');
  } catch {
    return 'Déconnexion des autres appareils impossible (hors ligne ?).';
  }
}

/** Les appareils à montrer : ceux encore connectés, cet appareil en premier. */
export function trierAppareils(liste: Appareil[], cetAppareil: string): Appareil[] {
  return liste
    .filter((a) => a.connecte || a.appareil === cetAppareil)
    .sort(
      (a, b) =>
        Number(b.appareil === cetAppareil) - Number(a.appareil === cetAppareil) ||
        Date.parse(b.derniere_connexion) - Date.parse(a.derniere_connexion),
    );
}

/** Téléphone (app iPhone ou Android, ou navigateur d'un téléphone) : seul endroit où l'on scanne un code QR. */
export async function estTelephone(): Promise<boolean> {
  const p = await plateforme();
  if (p === 'ios' || p === 'android') return true;
  if (p === 'bureau' || typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches &&
    Math.min(window.screen.width, window.screen.height) < 768
  );
}

/** « Aujourd'hui, 14:05 », « Hier, 09:12 », « 23 nov., 16:11 ». */
export function dateConnexion(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(maintenant) - jour(d)) / 86_400_000);
  if (ecart === 0) return `Aujourd’hui, ${heure}`;
  if (ecart === 1) return `Hier, ${heure}`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}, ${heure}`;
}
