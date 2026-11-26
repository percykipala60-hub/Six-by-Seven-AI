import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Navigateur de l'app de bureau (apps/bureau/navigateur.cjs), avec un faux Electron : chaque discussion garde ses
 * onglets en changeant d'espace, au-delà de six discussions ouvertes et après un redémarrage ; au premier message,
 * le brouillon devient celui de la discussion.
 */

const exiger = createRequire(path.resolve('../bureau/navigateur.cjs'));
let dossier = '';

class FauxContenu {
  url = '';
  ferme = false;
  navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  rappels = new Map<string, (() => void)[]>();
  on(ev: string, f: () => void) {
    this.rappels.set(ev, [...(this.rappels.get(ev) ?? []), f]);
  }
  setWindowOpenHandler() {}
  send() {}
  stopFindInPage() {}
  getTitle() {
    return '';
  }
  isLoading() {
    return false;
  }
  getZoomFactor() {
    return 1;
  }
  getURL() {
    return this.url;
  }
  // Comme Chromium : la page chargée est annoncée (did-navigate).
  loadURL(u: string) {
    this.url = u;
    for (const f of this.rappels.get('did-navigate') ?? []) f();
    return Promise.resolve();
  }
  close() {
    this.ferme = true;
  }
}
class FausseVue {
  webContents = new FauxContenu();
  partition: string;
  visible = false;
  constructor(o: { webPreferences: { partition: string } }) {
    this.partition = o.webPreferences.partition;
  }
  setBackgroundColor() {}
  setBounds() {}
  setVisible(v: boolean) {
    this.visible = v;
  }
}
const vues: FausseVue[] = [];

function installerFauxElectron() {
  const chemin = exiger.resolve('electron');
  const session = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, on() {} };
  exiger.cache[chemin] = {
    id: chemin,
    filename: chemin,
    loaded: true,
    exports: {
      WebContentsView: class extends FausseVue {
        constructor(o: { webPreferences: { partition: string } }) {
          super(o);
          vues.push(this);
        }
      },
      Menu: { buildFromTemplate: () => ({ popup() {} }) },
      shell: { openExternal() {} },
      clipboard: { writeText() {} },
      dialog: { showMessageBox: async () => ({ response: 1 }) },
      session: { fromPartition: () => session },
      app: { getPath: () => dossier },
    },
  } as unknown as NodeJS.Module;
  // Module rechargé à chaque test (nouveau navigateur, mémoire relue sur le disque).
  Reflect.deleteProperty(exiger.cache, exiger.resolve('../bureau/navigateur.cjs'));
}

type Navigateur = { piloter: (e: unknown, c: Record<string, unknown>) => boolean };
function nouveauNavigateur(): Navigateur {
  installerFauxElectron();
  const { creerNavigateur } = exiger('../bureau/navigateur.cjs') as {
    creerNavigateur: (ctx: unknown) => Navigateur;
  };
  const fenetre = {
    contentView: { addChildView() {}, removeChildView() {} },
    getContentSize: () => [1200, 800],
  };
  const n = creerNavigateur({
    fenetre: () => fenetre,
    appli: () => ({ webContents: { send() {} } }),
    barre: 40,
    depuisApp: () => true,
  });
  // Le volet est affiché (sinon aucun onglet n'est visible).
  n.piloter({}, { action: 'afficher', bornes: { x: 0, y: 0, largeur: 500, hauteur: 500 } });
  return n;
}

/** Adresses des onglets ouverts (non fermés) d'un profil. */
const adresses = (partition: string) =>
  vues
    .filter((v) => v.partition === partition && !v.webContents.ferme && v.webContents.url)
    .map((v) => v.webContents.url);
const profilActif = () => vues.filter((v) => v.visible).at(-1)?.partition ?? '';
const attendreSauvegarde = () => new Promise((r) => setTimeout(r, 700));

beforeEach(() => {
  dossier = mkdtempSync(path.join(tmpdir(), 'six-nav-'));
  vues.length = 0;
});
afterEach(() => rmSync(dossier, { recursive: true, force: true }));

describe('navigateur de l’app de bureau', () => {
  it('chaque discussion garde ses onglets quand on passe à une autre et qu’on revient', () => {
    const n = nouveauNavigateur();
    n.piloter({}, { action: 'contexte', contexte: 'chat:a' });
    n.piloter({}, { action: 'ouvrir', url: 'https://exemple.org/a' });
    const profilA = profilActif();
    n.piloter({}, { action: 'contexte', contexte: 'cosinus:b' });
    expect(profilActif()).not.toBe(profilA);
    expect(adresses(profilActif())).toEqual([]);
    n.piloter({}, { action: 'contexte', contexte: 'chat:a' });
    expect(profilActif()).toBe(profilA);
    expect(adresses(profilA)).toEqual(['https://exemple.org/a']);
  });

  it('au-delà de six discussions ouvertes, les onglets se rouvrent au retour', () => {
    const n = nouveauNavigateur();
    for (let i = 0; i < 9; i++) {
      n.piloter({}, { action: 'contexte', contexte: `chat:d${i}` });
      n.piloter({}, { action: 'ouvrir', url: `https://exemple.org/${i}` });
    }
    n.piloter({}, { action: 'contexte', contexte: 'chat:d0' });
    expect(adresses(profilActif())).toContain('https://exemple.org/0');
  });

  it('les onglets se rouvrent après un redémarrage de l’app', async () => {
    const avant = nouveauNavigateur();
    avant.piloter({}, { action: 'contexte', contexte: 'cosinus:c' });
    avant.piloter({}, { action: 'ouvrir', url: 'https://exemple.org/c' });
    await attendreSauvegarde();
    vues.length = 0;
    const apres = nouveauNavigateur();
    apres.piloter({}, { action: 'contexte', contexte: 'cosinus:c' });
    expect(adresses(profilActif())).toEqual(['https://exemple.org/c']);
  });

  it('au premier message, le brouillon devient la discussion et un brouillon vierge repart', () => {
    const n = nouveauNavigateur();
    n.piloter({}, { action: 'contexte', contexte: 'chat:nouvelle' });
    n.piloter({}, { action: 'ouvrir', url: 'https://exemple.org/brouillon' });
    const profilBrouillon = profilActif();
    n.piloter({}, { action: 'contexte-adopter', de: 'chat:nouvelle', vers: 'chat:x' });
    n.piloter({}, { action: 'contexte', contexte: 'cosinus:autre' });
    n.piloter({}, { action: 'contexte', contexte: 'chat:x' });
    expect(profilActif()).toBe(profilBrouillon);
    expect(adresses(profilBrouillon)).toEqual(['https://exemple.org/brouillon']);
    n.piloter({}, { action: 'contexte', contexte: 'chat:nouvelle' });
    expect(profilActif()).not.toBe(profilBrouillon);
    expect(adresses(profilActif())).toEqual([]);
  });

  it('refuse un nom de discussion inattendu', () => {
    const n = nouveauNavigateur();
    expect(n.piloter({}, { action: 'contexte', contexte: '../../autre' })).toBe(false);
    expect(n.piloter({}, { action: 'contexte-adopter', de: 'chat:a', vers: 'x' })).toBe(false);
  });
});
