import { describe, expect, it } from 'vitest';
import { demandeNavigation } from '@/lib/agent/demande-navigation';
import { definitionsOutils } from '@/lib/agent/outils';

describe('Chat : le navigateur sans espace de travail', () => {
  it('repère les demandes qui passent par le web', () => {
    expect(demandeNavigation('Ouvre le site de la Monusco')).toBe(true);
    expect(demandeNavigation('va sur www.radiookapi.net et lis les titres')).toBe(true);
    expect(demandeNavigation('Cherche sur Google le prix du ciment à Kinshasa')).toBe(true);
    expect(demandeNavigation('Explique-moi la photosynthèse')).toBe(false);
    expect(demandeNavigation('Salut Six, ça va ?')).toBe(false);
  });

  it('donne le navigateur au Chat, sans outil de fichiers', () => {
    const noms = definitionsOutils({ espace: '', navigateur: {} }).map((o) => o.nom);
    expect(noms).toContain('naviguer');
    expect(noms).not.toContain('lister_espace');
    expect(noms).not.toContain('ecrire_resultat');
    expect(definitionsOutils({ espace: '' }).map((o) => o.nom)).not.toContain('naviguer');
  });
});
