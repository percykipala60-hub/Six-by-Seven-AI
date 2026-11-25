import { describe, expect, it } from 'vitest';
import { droitsAppareils, peutDeconnecter, type LigneAppareil } from '@/lib/droits-appareils';

const ligne = (
  appareil: string,
  methode: string,
  heure: number,
  connecte = true,
): LigneAppareil => ({
  appareil,
  methode,
  derniere_connexion: new Date(2026, 10, 26, heure).toISOString(),
  connecte,
});

describe('hiérarchie des appareils', () => {
  const liste = [
    ligne('telephone1', 'Google', 9),
    ligne('pc', 'Code QR', 10),
    ligne('telephone2', 'Code QR', 11),
  ];

  it('le principal (Google, mot de passe…) déconnecte les autres', () => {
    expect(droitsAppareils(liste, 'telephone1').gestion).toBe(true);
    expect(peutDeconnecter(liste, 'telephone1', 'pc')).toBe(true);
    expect(peutDeconnecter(liste, 'telephone1', 'telephone1')).toBe(false);
  });

  it('un appareil connecté par code QR voit la liste mais ne déconnecte personne', () => {
    const d = droitsAppareils(liste, 'pc');
    expect(d.gestion).toBe(false);
    expect(d.roles.get('pc')).toBe('secondaire');
    expect(peutDeconnecter(liste, 'pc', 'telephone1')).toBe(false);
    expect(peutDeconnecter(liste, 'pc', 'telephone2')).toBe(false);
  });

  it('sans principal connecté, le plus ancien prend la main (hôte)', () => {
    const sansPrincipal = [ligne('telephone1', 'Google', 9, false), ...liste.slice(1)];
    const d = droitsAppareils(sansPrincipal, 'pc');
    expect(d.hote).toBe('pc');
    expect(d.roles.get('pc')).toBe('hote');
    expect(peutDeconnecter(sansPrincipal, 'pc', 'telephone2')).toBe(true);
    expect(peutDeconnecter(sansPrincipal, 'telephone2', 'pc')).toBe(false);
  });

  it('un appareil non reconnu (session différente) ne gère rien', () => {
    expect(droitsAppareils(liste, null).gestion).toBe(false);
    expect(peutDeconnecter(liste, null, 'pc')).toBe(false);
  });
});
