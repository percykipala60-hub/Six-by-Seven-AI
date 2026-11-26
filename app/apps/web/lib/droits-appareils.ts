/**
 * Qui peut déconnecter qui (Réglages → Appareils connectés). Tous les appareils voient la liste ; la déconnexion
 * suit une hiérarchie :
 * - « principal » : connecté par mot de passe, Google, Apple ou code e-mail. Il peut déconnecter tous les autres.
 * - « secondaire » : connecté par code QR (un autre appareil a approuvé). Il ne déconnecte personne…
 * - … sauf s'il est l'« hôte » : quand plus aucun appareil principal n'est connecté, le plus ancien appareil
 *   connecté prend la main (par ordre de connexion), sans rien à détecter.
 */

export type Role = 'principal' | 'hote' | 'secondaire';
export type LigneAppareil = {
  appareil: string;
  methode: string;
  derniere_connexion: string;
  connecte: boolean;
};

/** Principal : connecté avec une méthode forte. « Code QR » et « Connexion » (méthode inconnue, p. ex. appareil
 *  réenregistré sans s'être reconnecté) ne le sont pas ; ils peuvent quand même être l'hôte. */
const METHODES_PRINCIPALES = new Set(['Mot de passe', 'Google', 'Apple', 'Code e-mail']);
export const estPrincipal = (a: Pick<LigneAppareil, 'methode'>) =>
  METHODES_PRINCIPALES.has(a.methode);

export function droitsAppareils(
  liste: LigneAppareil[],
  moi: string | null,
): { roles: Map<string, Role>; gestion: boolean; hote: string | null } {
  const actifs = liste.filter((a) => a.connecte);
  const auMoinsUnPrincipal = actifs.some(estPrincipal);
  const hote = auMoinsUnPrincipal
    ? null
    : ([...actifs].sort(
        (a, b) => Date.parse(a.derniere_connexion) - Date.parse(b.derniere_connexion),
      )[0]?.appareil ?? null);
  const roles = new Map<string, Role>(
    liste.map((a) => [
      a.appareil,
      estPrincipal(a) ? 'principal' : a.appareil === hote ? 'hote' : 'secondaire',
    ]),
  );
  const moiActif = actifs.find((a) => a.appareil === moi);
  const gestion = Boolean(moiActif && (estPrincipal(moiActif) || moiActif.appareil === hote));
  return { roles, gestion, hote };
}

/** Cet appareil peut-il déconnecter cet autre appareil ? */
export function peutDeconnecter(
  liste: LigneAppareil[],
  moi: string | null,
  cible: string,
): boolean {
  if (!moi || cible === moi) return false;
  const { gestion } = droitsAppareils(liste, moi);
  return gestion && liste.some((a) => a.appareil === cible && a.connecte);
}
