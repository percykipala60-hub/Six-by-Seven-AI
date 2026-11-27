import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Terminal de Cosinus (apps/bureau/terminal.cjs) avec un vrai shell : la sortie arrive, le dossier courant suit
 * « cd », les accents passent, une commande longue s'arrête et le shell repart dans le même dossier.
 */

type Evenement = { id: number; type: 'sortie' | 'pret' | 'fin'; texte?: string; cwd?: string };
type Terminaux = {
  piloter: (c: Record<string, unknown>) => Promise<{ id: number; cwd: string }>;
  toutFermer: () => void;
};

const exiger = createRequire(path.resolve('../bureau/terminal.cjs'));
const { creerTerminaux } = exiger('./terminal.cjs') as {
  creerTerminaux: (envoyer: (e: Evenement) => void) => Terminaux;
};

let T: Terminaux | null = null;
let dossier = '';
afterEach(async () => {
  T?.toutFermer();
  // Le shell lâche son dossier courant une fois arrêté (taskkill est asynchrone sous Windows).
  if (dossier) {
    await new Promise((r) => setTimeout(r, 800));
    rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
  dossier = '';
});

function nouveau() {
  const evenements: Evenement[] = [];
  T = creerTerminaux((e) => evenements.push(e));
  const prets = () => evenements.filter((e) => e.type === 'pret').length;
  const attendrePret = async (avant: number) => {
    for (let i = 0; i < 150 && prets() <= avant; i++) await new Promise((r) => setTimeout(r, 100));
    expect(prets()).toBeGreaterThan(avant);
  };
  const sortie = () =>
    evenements
      .filter((e) => e.type === 'sortie')
      .map((e) => e.texte)
      .join('');
  return { evenements, T, prets, attendrePret, sortie };
}

describe('terminal de Cosinus', () => {
  it('exécute des commandes, suit le dossier courant et garde les accents', async () => {
    dossier = mkdtempSync(path.join(tmpdir(), 'six-terminal-'));
    const t = nouveau();
    const { id, cwd } = await t.T.piloter({ action: 'ouvrir', cwd: dossier });
    expect(path.resolve(cwd)).toBe(path.resolve(dossier));
    await t.attendrePret(0);

    let n = t.prets();
    await t.T.piloter({ action: 'ecrire', id, commande: 'echo "héllo à vous"' });
    await t.attendrePret(n);
    expect(t.sortie()).toContain('héllo à vous');

    n = t.prets();
    await t.T.piloter({ action: 'ecrire', id, commande: 'cd ..' });
    await t.attendrePret(n);
    const dernier = t.evenements.filter((e) => e.type === 'pret').at(-1);
    expect(path.resolve(dernier?.cwd ?? '')).toBe(path.resolve(dossier, '..'));
  }, 30_000);

  it('arrête une commande longue et repart dans le même dossier', async () => {
    const t = nouveau();
    const { id } = await t.T.piloter({ action: 'ouvrir', cwd: tmpdir() });
    await t.attendrePret(0);
    const commande = process.platform === 'win32' ? 'Start-Sleep 60' : 'sleep 60';
    await t.T.piloter({ action: 'ecrire', id, commande });
    await new Promise((r) => setTimeout(r, 500));
    const n = t.prets();
    await t.T.piloter({ action: 'arreter', id });
    await t.attendrePret(n);
    expect(t.sortie()).toContain('^C');
  }, 30_000);

  it('refuse un dossier qui n’existe pas : dossier personnel à la place', async () => {
    const t = nouveau();
    const { cwd } = await t.T.piloter({ action: 'ouvrir', cwd: 'Z:/n-existe-pas' });
    expect(cwd).toBe(homedir());
  });
});
