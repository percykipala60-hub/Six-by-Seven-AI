import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { definitionsOutils } from '@/lib/agent/outils';
import { demandeOrdinateur, demanderAuClient, recevoirDuClient } from '@/lib/agent/pont-ordinateur';

/** Outil « ordinateur » : pont serveur ↔ app de bureau, détection des demandes, protections de l'app de bureau. */

afterEach(() => vi.useRealTimers());

describe('pont entre l’agent et l’app de bureau', () => {
  it('le résultat revient à l’agent, seulement du même compte', async () => {
    let id = '';
    const attente = demanderAuClient('compte-a', (d) => (id = d.id), { action: 'fenetres' });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(recevoirDuClient('compte-b', id, 'volé')).toBe(false);
    expect(recevoirDuClient('compte-a', id, '{"fenetres":[]}')).toBe(true);
    expect(await attente).toBe('{"fenetres":[]}');
    // Une seule réponse par demande.
    expect(recevoirDuClient('compte-a', id, 'encore')).toBe(false);
  });

  it('sans réponse, l’agent continue après le délai avec une explication', async () => {
    vi.useFakeTimers();
    let id = '';
    const attente = demanderAuClient('compte-a', (d) => (id = d.id), { action: 'observer' });
    vi.advanceTimersByTime(121_000);
    expect(await attente).toMatch(/délai dépassé/);
    expect(recevoirDuClient('compte-a', id, 'trop tard')).toBe(false);
  });

  it('une tâche annulée libère la demande', async () => {
    const c = new AbortController();
    const attente = demanderAuClient('compte-a', () => {}, { action: 'observer' }, c.signal);
    c.abort();
    expect(await attente).toBe('Tâche annulée.');
  });
});

describe('outil « ordinateur » de l’agent', () => {
  it('proposé seulement quand l’app de bureau le permet', () => {
    const sans = definitionsOutils({ espace: '' }).map((o) => o.nom);
    const avec = definitionsOutils({ espace: '', ordinateur: { demander: async () => '' } }).map(
      (o) => o.nom,
    );
    expect(sans).not.toContain('ordinateur');
    expect(avec).toContain('ordinateur');
  });

  it('reconnaît les demandes qui visent l’ordinateur', () => {
    expect(demandeOrdinateur('Ouvre le Bloc-notes et écris une liste de courses')).toBe(true);
    expect(demandeOrdinateur('Dans Excel, fais la somme de la colonne B')).toBe(true);
    expect(demandeOrdinateur('Explique-moi la photosynthèse')).toBe(false);
  });
});

describe('protections de l’app de bureau', () => {
  const exiger = createRequire(path.resolve('../bureau/ordinateur.cjs'));
  const chemin = exiger.resolve('electron');
  exiger.cache[chemin] = {
    id: chemin,
    filename: chemin,
    loaded: true,
    exports: { dialog: {}, desktopCapturer: {}, globalShortcut: {} },
  } as unknown as NodeJS.Module;
  const { ENGAGEANT, INTERDITES } = exiger('../bureau/ordinateur.cjs') as {
    ENGAGEANT: RegExp;
    INTERDITES: Set<string>;
  };

  it('les clics engageants sont laissés à la personne', () => {
    for (const nom of [
      'Envoyer',
      'Acheter maintenant',
      'Supprimer le fichier',
      'Payer 10 $',
      'Installer',
    ])
      expect(ENGAGEANT.test(nom)).toBe(true);
    for (const nom of ['Ouvrir', 'Enregistrer sous', 'Fichier', 'Rechercher'])
      expect(ENGAGEANT.test(nom)).toBe(false);
  });

  it('les applications sensibles ne sont jamais pilotées', () => {
    for (const app of [
      'consent',
      'credentialuibroker',
      'bitwarden',
      'keepass',
      'powershell',
      'cmd',
      'regedit',
    ])
      expect(INTERDITES.has(app)).toBe(true);
    expect(INTERDITES.has('notepad')).toBe(false);
  });
});
