import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stockage de l'appareil simulé (les discussions vivent dans localStorage).
const stock = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => stock.get(k) ?? null,
  setItem: (k: string, v: string) => void stock.set(k, v),
  removeItem: (k: string) => void stock.delete(k),
});
vi.stubGlobal('window', {
  dispatchEvent: () => true,
  addEventListener() {},
  removeEventListener() {},
});

const { archiverChat, deplacerChat, dupliquerChat, epinglerChat, garderChat, lireChat, lireChats } =
  await import('@/lib/seven-chats');

const msg = (content: string) => [{ role: 'user' as const, content }];

beforeEach(() => stock.clear());

describe('menu « … » des discussions', () => {
  it('épingle en tête, archive (sans perdre l’épingle ni les messages) et désarchive', () => {
    garderChat('a', msg('Première'));
    garderChat('b', msg('Seconde'));
    epinglerChat('a', true);
    expect(lireChats().map((c) => c.id)).toEqual(['a', 'b']);
    archiverChat('a', true);
    expect(lireChat('a')).toMatchObject({ archive: true, messages: msg('Première') });
    expect(lireChat('a')?.epingle).toBeUndefined();
    archiverChat('a', false);
    expect(lireChat('a')?.archive).toBeUndefined();
  });

  it('déplace une discussion du Chat vers un environnement de Cosinus, et retour', () => {
    garderChat('c', msg('Analyse ce fichier'));
    deplacerChat('c', { mode: 'sixtouch', environnement: 'e1', dossier: 'C:\\Travail' });
    expect(lireChat('c')).toMatchObject({
      mode: 'sixtouch',
      environnement: 'e1',
      dossier: 'C:\\Travail',
    });
    deplacerChat('c', { mode: 'chat' });
    const c = lireChat('c');
    expect(c?.mode).toBeUndefined();
    expect(c?.environnement).toBeUndefined();
    expect(c?.messages).toEqual(msg('Analyse ce fichier'));
  });

  it('duplique une discussion (même environnement, nouveau titre)', () => {
    garderChat('d', msg('Plan du mémoire'), 'sixtouch', undefined, 'C:\\M', 'e2');
    const copie = dupliquerChat('d');
    expect(copie).not.toBe('d');
    expect(lireChat(copie ?? '')).toMatchObject({
      titre: 'Plan du mémoire (copie)',
      environnement: 'e2',
      messages: msg('Plan du mémoire'),
    });
  });
});

it('isole les fils de A et B même ouverts par identifiant et restaure les anciens fils de A', async () => {
  const { reprendreHistoriqueExistant } = await import('@/lib/historique-compte');
  const { effacerTousLesChats } = await import('@/lib/seven-chats');
  const selectionner = (id: string) => stock.set('six-session', JSON.stringify({ id }));
  garderChat('ancien', msg('Avant la mise à jour'));
  selectionner('a');
  reprendreHistoriqueExistant();
  garderChat('cosinus', msg('Privé A'), 'sixtouch');
  selectionner('b');
  reprendreHistoriqueExistant();
  expect(lireChats()).toEqual([]);
  expect(lireChat('ancien')).toBeUndefined();
  garderChat('cosinus', msg('Privé B'));
  selectionner('a');
  expect(lireChat('ancien')?.messages).toEqual(msg('Avant la mise à jour'));
  expect(lireChat('cosinus')?.messages).toEqual(msg('Privé A'));
  effacerTousLesChats();
  selectionner('b');
  expect(lireChat('cosinus')?.messages).toEqual(msg('Privé B'));
});
