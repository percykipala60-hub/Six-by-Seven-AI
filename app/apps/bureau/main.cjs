'use strict';
/**
 * Six by Seven.AI — application de bureau.
 *
 * La fenêtre charge Six en ligne par défaut. SIX_URL permet de viser un serveur de développement.
 * Dans Cosinus, le volet « navigateur » est un vrai navigateur Chromium (WebContentsView) posé exactement sur la zone
 * de la page : tous les sites s'affichent (aucun refus d'affichage intégré), nets, fluides, avec le vrai curseur.
 *
 * Sécurité :
 * - l'app et le navigateur sont séparés : le navigateur a son propre profil (persist:cosinus, connexions gardées),
 *   aucun accès à Node ni aux fichiers, aucune autorisation (caméra, micro, position…) ni téléchargement par défaut ;
 * - seule la page de l'app (même origine que SIX_URL) peut le piloter, par quelques commandes (preload.cjs) ;
 * - la fenêtre de l'app ne quitte jamais son origine : les liens externes s'ouvrent dans le navigateur par défaut.
 *
 * Connexion Google ou Apple : elle s'ouvre dans le navigateur de l'ordinateur ; la page /connexion/retour renvoie
 * ensuite vers l'app par un lien six://auth (protocole « six » enregistré pour cet utilisateur au lancement), que
 * l'app transmet à la page de Six pour terminer la connexion.
 */
const path = require('node:path');
const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  shell,
  Menu,
  dialog,
  powerSaveBlocker,
} = require('electron');
const { creerNavigateur } = require('./navigateur.cjs');
const { creerOrdinateur } = require('./ordinateur.cjs');
const { creerTerminaux } = require('./terminal.cjs');

/** Hauteur de la barre du haut de Six (barre.html), au-dessus de l'app. */
const BARRE = 40;

const URL_APP = process.env.SIX_URL || 'https://app.sixbysevenai.com/cosinus';
const ORIGINE_APP = new URL(URL_APP).origin;
let moteurVocal = null;
const URL_VOIX = 'http://127.0.0.1:8765';
const LANGUES_VOIX = new Set(['fr', 'en', 'es', 'de', 'zh', 'ln', 'sw', 'auto']);

async function demarrerMoteurVocal() {
  const racine = path.resolve(__dirname, '../../..');
  const python = path.join(racine, '.local-tools/voice/Scripts/python.exe');
  if (!existsSync(python)) return;
  try {
    const res = await fetch(`${URL_VOIX}/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return;
  } catch {
    /* Le moteur n'est pas encore démarré. */
  }
  moteurVocal = spawn(python, [path.join(racine, 'app/scripts/transcription-locale.py')], {
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, HF_HOME: path.join(racine, '.local-tools/models') },
  });
  moteurVocal.on('error', () => {
    moteurVocal = null;
  });
}
app.on('before-quit', () => {
  terminaux.toutFermer();
  moteurVocal?.kill();
  ordinateur.arreter();
});

/** @type {BrowserWindow | null} */
let fenetre = null;
/** L'app Six elle-même, sous la barre du haut. @type {WebContentsView | null} */
let appli = null;
/** Ordinateur gardé éveillé (Réglages → Application de bureau) : identifiant du blocage de veille, ou null. */
let eveil = null;
/** Ce que l'app signale à la barre (volet ouvert, espace Cosinus). */
let etatApp = { volet: null, terminal: false, cosinus: false, connecte: false };
/** Couleurs du thème de l'app, reprises par la barre et les boutons Windows. */
let theme = null;

const web = (u) => {
  try {
    const p = new URL(u).protocol;
    return p === 'https:' || p === 'http:';
  } catch {
    return false;
  }
};

/** Le message vient-il bien de la page de l'app (et pas d'un site ouvert dans le navigateur) ? */
function depuisApp(evenement) {
  try {
    return (
      fenetre !== null &&
      appli !== null &&
      evenement.sender === appli.webContents &&
      new URL(evenement.senderFrame?.url ?? '').origin === ORIGINE_APP
    );
  } catch {
    return false;
  }
}

// Navigateur de Cosinus (onglets, menu ⋯) : navigateur.cjs.
const navigateur = creerNavigateur({
  fenetre: () => fenetre,
  appli: () => appli,
  barre: BARRE,
  depuisApp,
});

// Contrôle de l'ordinateur par l'agent de Six (accords, interdits et arrêt d'urgence : ordinateur.cjs).
const ordinateur = creerOrdinateur({
  fenetre: () => fenetre,
  demander: demanderAccord,
  stockage: path.join(app.getPath('userData'), 'six-autorisations.json'),
});

// ---------- Demande d'accord (accord.html) ----------
// Fenêtre séparée aux couleurs de Six, au-dessus de l'app : la page web ne peut ni la voir ni cliquer dedans.
/** @type {{ fenetre: BrowserWindow, resoudre: (oui: boolean) => void } | null} */
let accord = null;

/** Demandes posées dans la conversation : id → { resoudre, recu }. */
const accordsConversation = new Map();
let accordSuivant = 1;

/**
 * Demande l'accord de la personne, d'abord dans la conversation (message de Six avec deux boutons) ; si la page ne
 * l'a pas affichée dans la seconde (autre écran que le Chat ou Cosinus), dans une fenêtre d'accord à part.
 */
function demanderAccord(demande) {
  if (!appli) return demanderAccordFenetre(demande);
  const id = accordSuivant++;
  return new Promise((resoudre) => {
    const entree = { resoudre, recu: false };
    accordsConversation.set(id, entree);
    appli.webContents.send('six:accord-conversation', { id, ...demande });
    setTimeout(() => {
      if (entree.recu || !accordsConversation.has(id)) return;
      accordsConversation.delete(id);
      void demanderAccordFenetre(demande).then(resoudre);
    }, 1200);
  });
}

/** Fenêtre d'accord à part ; résout false si elle est fermée sans réponse. */
function demanderAccordFenetre({ titre, texte, garanties = false }) {
  if (!fenetre) return Promise.resolve('non');
  if (accord) accord.resoudre('non');
  const zone = fenetre.getBounds();
  const largeur = 460;
  const hauteur = garanties ? 330 : 210;
  const f = new BrowserWindow({
    parent: fenetre,
    modal: true,
    x: Math.round(zone.x + (zone.width - largeur) / 2),
    y: Math.round(zone.y + Math.max(60, (zone.height - hauteur) / 3)),
    width: largeur,
    height: hauteur,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'accord-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  f.webContents.on('will-navigate', (e) => e.preventDefault());
  f.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return new Promise((resoudre) => {
    let fini = false;
    const terminer = (oui) => {
      if (fini) return;
      fini = true;
      if (accord?.fenetre === f) accord = null;
      resoudre(oui);
      if (!f.isDestroyed()) f.close();
    };
    accord = { fenetre: f, resoudre: terminer };
    f.on('closed', () => terminer('non'));
    f.webContents.once('did-finish-load', () => {
      f.webContents.send('six:accord-demande', { titre, texte, garanties, theme });
      f.show();
      f.focus();
    });
    void f.loadFile(path.join(__dirname, 'accord.html'));
  });
}
// Terminal de Cosinus : la sortie de chaque shell part vers l'app (événement six:terminal).
const terminaux = creerTerminaux((e) => appli?.webContents.send('six:terminal', e));

// ---------- Connexion par le navigateur de l'ordinateur ----------

/** @type {{ resoudre: (r: { url: string }) => void, minuterie: NodeJS.Timeout } | null} */
let connexionEnCours = null;

function terminerConnexion(url) {
  if (!connexionEnCours) return;
  clearTimeout(connexionEnCours.minuterie);
  connexionEnCours.resoudre({ url });
  connexionEnCours = null;
}

/** Un lien six://… reçu de Windows (deuxième lancement) ou de macOS (open-url). */
function recevoirLien(lien) {
  if (typeof lien !== 'string' || !lien.toLowerCase().startsWith('six://')) return;
  if (fenetre) {
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  }
  if (/^six:\/\/auth(?:[/?#]|$)/i.test(lien) && lien.length < 8000) terminerConnexion(lien);
}

function connexion(evenement, url) {
  if (!depuisApp(evenement) || typeof url !== 'string' || url.length > 8000) return { url: '' };
  let cible;
  try {
    cible = new URL(url);
  } catch {
    return { url: '' };
  }
  // Seule la page de connexion du projet Supabase s'ouvre ainsi.
  if (cible.protocol !== 'https:' || !cible.hostname.endsWith('.supabase.co')) return { url: '' };
  terminerConnexion(''); // une connexion précédente restée ouverte est abandonnée
  return new Promise((resoudre) => {
    connexionEnCours = {
      resoudre,
      minuterie: setTimeout(() => terminerConnexion(''), 10 * 60_000),
    };
    void shell.openExternal(cible.href);
  });
}

const borne = (v, min, max) => Math.round(Math.min(max, Math.max(min, Number(v) || 0)));

// ---------- Barre du haut ----------

const ESPACES = [
  { chemin: '/chat', label: 'Chat' },
  { chemin: '/cosinus', label: 'Cosinus' },
  { chemin: '/responsive', label: 'Responsive' },
];

/** Envoie un événement à la page de l'app (commandes fixes : aller dans un espace, ouvrir un volet). */
function versApp(detail) {
  if (!appli) return;
  const code = `window.dispatchEvent(new CustomEvent('six-bureau', { detail: ${JSON.stringify(detail)} }))`;
  void appli.webContents.executeJavaScript(code).catch(() => {});
}

function cheminApp() {
  try {
    return appli ? new URL(appli.webContents.getURL()).pathname : '';
  } catch {
    return '';
  }
}

/** Précédent / suivant d'après l'historique de la page (les changements d'espace de l'app ne rechargent pas). */
const LIRE_HISTORIQUE = `(() => ({
  retour: Boolean(window.navigation?.canGoBack),
  avant: Boolean(window.navigation?.canGoForward),
}))()`;

async function etatBarre() {
  if (!fenetre || !appli) return;
  const w = appli.webContents;
  const chemin = cheminApp();
  const h = (await w.executeJavaScript(LIRE_HISTORIQUE).catch(() => null)) ?? {
    retour: w.navigationHistory.canGoBack(),
    avant: w.navigationHistory.canGoForward(),
  };
  if (!fenetre) return;
  fenetre.webContents.send('six:barre-etat', {
    chemin,
    retour: h.retour,
    avant: h.avant,
    volet: etatApp.volet,
    terminal: etatApp.terminal,
    connecte: etatApp.connecte,
    cosinus: etatApp.cosinus && chemin.startsWith('/cosinus'),
    logo: `${ORIGINE_APP}/icon.png`,
    theme,
  });
}

const LIRE_THEME = `(() => {
  const r = getComputedStyle(document.documentElement);
  const v = (n) => r.getPropertyValue(n).trim();
  return { fond: v('--bg'), texte: v('--ink'), doux: v('--muted'), marque: v('--brand') };
})()`;

/** Couleurs du thème choisi dans l'app (clair, sombre, couleur) : la barre et les boutons Windows les suivent. */
async function lireTheme() {
  if (!appli || !fenetre) return;
  const t = await appli.webContents.executeJavaScript(LIRE_THEME).catch(() => null);
  if (!t || !fenetre) return;
  const change = JSON.stringify(t) !== JSON.stringify(theme);
  theme = t;
  if (!change) return;
  try {
    if (t.fond && t.texte) fenetre.setTitleBarOverlay({ color: t.fond, symbolColor: t.texte });
  } catch {
    /* couleur non reconnue par Windows : on garde la précédente */
  }
  void etatBarre();
}

function commandeBarre(evenement, c) {
  if (!fenetre || !appli || evenement.sender !== fenetre.webContents) return;
  if (!c || typeof c !== 'object') return;
  const w = appli.webContents;
  switch (c.action) {
    case 'retour':
      void w.executeJavaScript('history.back()').catch(() => {});
      break;
    case 'avant':
      void w.executeJavaScript('history.forward()').catch(() => {});
      break;
    case 'recharger':
      w.reload();
      break;
    case 'aller':
      if (c.chemin === '/reglages' || ESPACES.some((e) => e.chemin === c.chemin))
        versApp({ type: 'aller', chemin: c.chemin });
      break;
    case 'volet':
      if (['navigateur', 'fichiers', 'terminal'].includes(c.onglet))
        versApp({ type: 'volet', onglet: c.onglet });
      break;
    case 'menu-espaces':
      ouvrirMenuEspaces(borne(c.x, 0, 4000), borne(c.y, 0, BARRE + 8));
      break;
    case 'etat':
      void etatBarre();
      break;
  }
}

// ---------- Menu des espaces (menu.html) ----------

/** @type {BrowserWindow | null} */
let menu = null;
const MENU_LARGEUR = 400;
const MENU_HAUTEUR = 3 * 54 + 2 * 2 + 12 + 12 + 2;

/** Petite fenêtre sans bord, posée sous le nom de l'espace ; se ferme dès qu'on clique ailleurs. */
function ouvrirMenuEspaces(x, y) {
  if (!fenetre) return;
  if (menu) {
    menu.close();
    return;
  }
  const zone = fenetre.getContentBounds();
  menu = new BrowserWindow({
    parent: fenetre,
    x: zone.x + x - 6,
    y: zone.y + y - 6,
    width: MENU_LARGEUR,
    height: MENU_HAUTEUR,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'menu-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  const m = menu;
  m.webContents.on('will-navigate', (e) => e.preventDefault());
  m.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  m.on('blur', () => m.close());
  m.on('closed', () => {
    if (menu === m) menu = null;
  });
  m.webContents.once('did-finish-load', () => {
    m.webContents.send('six:menu-etat', { actuel: cheminApp(), theme });
    m.show();
  });
  void m.loadFile(path.join(__dirname, 'menu.html'));
}

function choixMenu(evenement, chemin) {
  if (!menu || evenement.sender !== menu.webContents) return;
  if (typeof chemin === 'string' && ESPACES.some((e) => e.chemin === chemin))
    versApp({ type: 'aller', chemin });
  menu.close();
}

function placerAppli() {
  if (!fenetre || !appli) return;
  const [l, h] = fenetre.getContentSize();
  appli.setBounds({ x: 0, y: BARRE, width: l, height: Math.max(0, h - BARRE) });
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'Six',
    backgroundColor: '#11141c',
    // Pas de barre Windows : la barre de Six (barre.html) la remplace ; Windows garde ses trois boutons à droite.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#11141c', symbolColor: '#e8ecf5', height: BARRE },
    webPreferences: {
      preload: path.join(__dirname, 'barre-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  // La barre est un fichier local : elle ne va jamais ailleurs.
  fenetre.webContents.on('will-navigate', (e) => e.preventDefault());
  fenetre.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void fenetre.loadFile(path.join(__dirname, 'barre.html'));

  appli = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  appli.setBackgroundColor('#11141c');
  fenetre.contentView.addChildView(appli);
  placerAppli();
  fenetre.on('resize', placerAppli);
  const wc = appli.webContents;
  let microAutorise = false;
  const origineApp = (url) => {
    try {
      return new URL(url).origin === ORIGINE_APP;
    } catch {
      return false;
    }
  };
  wc.session.setPermissionCheckHandler(
    (demandeur, permission, origine) =>
      demandeur === wc && origineApp(origine) && permission === 'media' && microAutorise,
  );
  wc.session.setPermissionRequestHandler(async (demandeur, permission, repondre, details) => {
    if (
      demandeur !== wc ||
      !origineApp(details.requestingUrl) ||
      permission !== 'media' ||
      !details.mediaTypes?.length ||
      details.mediaTypes.some((type) => type !== 'audio')
    ) {
      repondre(false);
      return;
    }
    try {
      if (!microAutorise) {
        const choix = await dialog.showMessageBox(fenetre, {
          type: 'question',
          title: 'Microphone de Six',
          message: 'Autoriser Six à utiliser le microphone pour les messages vocaux ?',
          buttons: ['Autoriser', 'Refuser'],
          defaultId: 1,
          cancelId: 1,
        });
        microAutorise = choix.response === 0;
      }
      repondre(microAutorise);
    } catch {
      repondre(false);
    }
  });
  // L'app reste sur son origine, sauf le passage par la connexion (Supabase, Google, Apple) et par GitHub (relier ses
  // dépôts : Réglages → Cloud), qui reviennent ensuite à l'app ; le reste s'ouvre dans le navigateur de l'ordinateur.
  // Les pages de passage n'ont accès à rien : chaque demande à l'app de bureau vérifie l'origine (depuisApp).
  wc.on('will-navigate', (e, u) => {
    try {
      const cible = new URL(u);
      if (cible.origin === ORIGINE_APP) return;
      if (
        cible.protocol === 'https:' &&
        (cible.hostname.endsWith('.supabase.co') ||
          cible.hostname === 'accounts.google.com' ||
          cible.hostname === 'appleid.apple.com' ||
          cible.hostname === 'github.com')
      )
        return;
    } catch {
      /* adresse invalide */
    }
    e.preventDefault();
    if (web(u)) void shell.openExternal(u);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (web(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Nouvelle page de l'app (rechargement, autre espace) : le navigateur se cache jusqu'à ce que le volet le replace.
  wc.on('did-start-navigation', (_e, _u, dansLaPage, principal) => {
    if (principal && !dansLaPage) navigateur.cacher();
  });
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated'])
    wc.on(ev, () => void etatBarre());
  wc.on('did-finish-load', () => void lireTheme());
  // Le thème peut changer dans Réglages > Thème : la barre suit.
  const suiviTheme = setInterval(() => void lireTheme(), 3000);
  void wc.loadURL(URL_APP);
  fenetre.on('closed', () => {
    clearInterval(suiviTheme);
    fenetre = null;
    appli = null;
    navigateur.oublier();
  });
}

// Liens six:// : ouvrent cette app (en développement, electron.exe doit recevoir le dossier de l'app).
if (process.defaultApp && process.argv.length >= 2)
  app.setAsDefaultProtocolClient('six', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('six');

// Une seule instance : relancer l'app (ou ouvrir un lien six://) ramène la fenêtre existante.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    const lien = argv.find((a) => a.toLowerCase().startsWith('six://'));
    if (lien) recevoirLien(lien);
    else if (fenetre) {
      if (fenetre.isMinimized()) fenetre.restore();
      fenetre.focus();
    }
  });
  app.on('open-url', (e, lien) => {
    e.preventDefault();
    recevoirLien(lien);
  });
  app.whenReady().then(() => {
    void demarrerMoteurVocal();
    Menu.setApplicationMenu(null);
    navigateur.preparerSession();
    ipcMain.handle('six:navigateur', navigateur.piloter);
    ipcMain.handle('six:barre', commandeBarre);
    ipcMain.handle('six:menu', choixMenu);
    ipcMain.handle('six:voix-disponible', async (evenement) => {
      if (!depuisApp(evenement)) return false;
      try {
        const res = await fetch(`${URL_VOIX}/health`, {
          signal: AbortSignal.timeout(1500),
          redirect: 'error',
        });
        return res.ok && (await res.json()).ready === true;
      } catch {
        return false;
      }
    });
    ipcMain.handle('six:transcrire', async (evenement, audio, langue) => {
      if (
        !depuisApp(evenement) ||
        !(audio instanceof Uint8Array) ||
        audio.byteLength < 1 ||
        audio.byteLength > 10 * 1024 * 1024 ||
        !LANGUES_VOIX.has(langue)
      )
        return null;
      try {
        const res = await fetch(`${URL_VOIX}/transcribe?langue=${langue}`, {
          method: 'POST',
          body: audio,
          signal: AbortSignal.timeout(120000),
          redirect: 'error',
        });
        if (!res.ok) return null;
        const r = await res.json();
        return typeof r.texte === 'string' ? { texte: r.texte, langue: r.langue } : null;
      } catch {
        return null;
      }
    });
    // L'app signale à la barre l'état de Cosinus (volet ouvert).
    ipcMain.handle('six:app-etat', (evenement, e) => {
      if (!depuisApp(evenement) || !e || typeof e !== 'object') return;
      // Connexion signalée à part (PontBureau, sur toutes les pages) : elle ne remet pas le volet à zéro.
      if ('connecte' in e && Object.keys(e).length === 1)
        etatApp = { ...etatApp, connecte: e.connecte === true };
      else
        etatApp = {
          ...etatApp,
          volet: ['navigateur', 'fichiers', 'terminal'].includes(e.volet) ? e.volet : null,
          terminal: e.terminal === true,
          cosinus: e.cosinus === true,
        };
      void etatBarre();
    });
    ipcMain.handle('six:connexion', connexion);
    // Demande d'accord dans la conversation : accusé de réception, puis réponse (seulement depuis l'app).
    ipcMain.handle('six:accord-recu', (evenement, id) => {
      const e = accordsConversation.get(Number(id));
      if (e && depuisApp(evenement)) e.recu = true;
    });
    ipcMain.handle('six:accord-conversation', (evenement, id, oui) => {
      const e = accordsConversation.get(Number(id));
      if (!e || !depuisApp(evenement)) return;
      accordsConversation.delete(Number(id));
      e.resoudre(oui === 'toujours' || oui === 'une-fois' ? oui : 'non');
    });
    // Réponse de la demande d'accord : acceptée seulement depuis sa propre fenêtre.
    ipcMain.handle('six:accord', (evenement, oui) => {
      if (!accord || evenement.sender !== accord.fenetre.webContents) return;
      accord.resoudre(oui === 'toujours' || oui === 'une-fois' ? oui : 'non');
    });
    // Réglages → Application de bureau : version, lancement au démarrage, ordinateur gardé éveillé.
    ipcMain.handle('six:reglages-bureau', (evenement, c) => {
      if (!depuisApp(evenement) || !c || typeof c !== 'object') throw new Error('Origine refusée.');
      if (c.action === 'retirer-autorisations') ordinateur.retirerAutorisations();
      if (c.action === 'demarrage') app.setLoginItemSettings({ openAtLogin: c.valeur === true });
      if (c.action === 'eveil') {
        if (c.valeur === true && eveil === null)
          eveil = powerSaveBlocker.start('prevent-app-suspension');
        if (c.valeur !== true && eveil !== null) {
          powerSaveBlocker.stop(eveil);
          eveil = null;
        }
      }
      return {
        version: app.getVersion(),
        demarrage: app.getLoginItemSettings().openAtLogin,
        eveil: eveil !== null,
        autorisations: ordinateur.autorisations(),
      };
    });
    // Terminal de Cosinus : seule la personne y tape (l'agent n'y a pas accès). Réponse { ok, resultat } ou erreur.
    ipcMain.handle('six:terminal', async (evenement, c) => {
      if (!depuisApp(evenement)) return { ok: false, erreur: 'Origine refusée.' };
      try {
        return { ok: true, resultat: await terminaux.piloter(c) };
      } catch (e) {
        return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
      }
    });
    // Agent de Six : contrôle de l'ordinateur. Réponse { ok, resultat } ou { ok: false, erreur } (lisible par l'agent).
    ipcMain.handle('six:ordinateur', async (evenement, c) => {
      if (!depuisApp(evenement)) return { ok: false, erreur: 'Origine refusée.' };
      try {
        return { ok: true, resultat: await ordinateur.piloter(c) };
      } catch (e) {
        return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
      }
    });
    // Volet Fichiers : montrer un fichier dans l'Explorateur (seulement un fichier existant, chemin absolu ; rien
    // n'est ouvert ni exécuté).
    ipcMain.handle('six:montrer-fichier', (evenement, chemin) => {
      if (!depuisApp(evenement) || typeof chemin !== 'string' || !path.isAbsolute(chemin))
        return false;
      if (!require('node:fs').existsSync(chemin)) return false;
      shell.showItemInFolder(path.normalize(chemin));
      return true;
    });
    // Cosinus : choix du dossier de travail d'une discussion (sélecteur natif). Renvoie le chemin, ou null si annulé.
    ipcMain.handle('six:choisir-dossier', async (evenement) => {
      if (!depuisApp(evenement) || !fenetre) return null;
      const r = await dialog.showOpenDialog(fenetre, {
        title: 'Dossier de travail de Cosinus',
        buttonLabel: 'Choisir ce dossier',
        properties: ['openDirectory', 'createDirectory'],
      });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    });
    // Connexion terminée : la fenêtre revient devant le navigateur (Windows n'autorise pas toujours un simple focus).
    ipcMain.handle('six:premier-plan', (evenement) => {
      if (!depuisApp(evenement) || !fenetre) return;
      if (fenetre.isMinimized()) fenetre.restore();
      fenetre.setAlwaysOnTop(true);
      fenetre.show();
      fenetre.focus();
      fenetre.setAlwaysOnTop(false);
    });
    creerFenetre();
  });
  app.on('window-all-closed', () => app.quit());
}
