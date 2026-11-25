'use strict';
/**
 * Six by Seven.AI — application de bureau.
 *
 * La fenêtre charge l'app Six (par défaut le serveur local, http://localhost:3000/cosinus ; SIX_URL pour en changer).
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
  session,
  Menu,
  dialog,
} = require('electron');

/** Hauteur de la barre du haut de Six (barre.html), au-dessus de l'app. */
const BARRE = 40;

const URL_APP = process.env.SIX_URL || 'http://localhost:3000/cosinus';
const ORIGINE_APP = new URL(URL_APP).origin;
const PARTITION = 'persist:cosinus';
let moteurVocal = null;

async function demarrerMoteurVocal() {
  if (!['localhost', '127.0.0.1'].includes(new URL(URL_APP).hostname)) return;
  const racine = path.resolve(__dirname, '../../..');
  const python = path.join(racine, '.local-tools/voice/Scripts/python.exe');
  if (!existsSync(python)) return;
  try {
    const res = await fetch('http://127.0.0.1:8765/health', { signal: AbortSignal.timeout(1500) });
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
app.on('before-quit', () => moteurVocal?.kill());

/** @type {BrowserWindow | null} */
let fenetre = null;
/** L'app Six elle-même, sous la barre du haut. @type {WebContentsView | null} */
let appli = null;
/** Ce que l'app signale à la barre (volet ouvert, espace Cosinus). */
let etatApp = { volet: null, cosinus: false };
/** Couleurs du thème de l'app, reprises par la barre et les boutons Windows. */
let theme = null;
/** @type {WebContentsView | null} */
let vue = null;

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

function envoyerEtat() {
  if (!appli || !vue) return;
  const w = vue.webContents;
  appli.webContents.send('six:navigateur-etat', {
    url: w.getURL(),
    titre: w.getTitle(),
    charge: w.isLoading(),
    retour: w.navigationHistory.canGoBack(),
    avant: w.navigationHistory.canGoForward(),
  });
}

function preparerSessionNavigateur() {
  const s = session.fromPartition(PARTITION);
  // Aucune autorisation accordée d'office (caméra, micro, position, notifications…).
  s.setPermissionRequestHandler((_wc, permission, rappel) =>
    rappel(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'),
  );
  s.setPermissionCheckHandler(
    (_wc, permission) => permission === 'fullscreen' || permission === 'clipboard-sanitized-write',
  );
  // Pas de téléchargement silencieux : le fichier s'ouvre dans le navigateur par défaut, qui demande où l'enregistrer.
  s.on('will-download', (e, item) => {
    e.preventDefault();
    const u = item.getURL();
    if (web(u)) void shell.openExternal(u);
  });
}

function creerVue() {
  if (vue || !fenetre) return vue;
  vue = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  vue.setBackgroundColor('#ffffff');
  vue.setVisible(false);
  fenetre.contentView.addChildView(vue);
  const w = vue.webContents;
  // Seulement des pages web ; une fenêtre surgissante s'ouvre dans le même onglet.
  w.on('will-navigate', (e, u) => {
    if (!web(u)) e.preventDefault();
  });
  w.setWindowOpenHandler(({ url }) => {
    if (web(url)) void w.loadURL(url);
    return { action: 'deny' };
  });
  for (const ev of [
    'did-navigate',
    'did-navigate-in-page',
    'page-title-updated',
    'did-start-loading',
    'did-stop-loading',
  ])
    w.on(ev, envoyerEtat);
  return vue;
}

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

function piloter(evenement, commande) {
  if (!depuisApp(evenement) || !commande || typeof commande !== 'object') return false;
  const v = creerVue();
  if (!v || !fenetre) return false;
  const w = v.webContents;
  switch (commande.action) {
    case 'afficher': {
      // Position donnée dans la page de l'app, qui commence sous la barre du haut.
      const [lw, lh] = fenetre.getContentSize();
      const b = commande.bornes ?? {};
      const x = borne(b.x, 0, lw);
      const y = borne(Number(b.y) + BARRE, BARRE, lh);
      v.setBounds({
        x,
        y,
        width: borne(b.largeur, 0, lw - x),
        height: borne(b.hauteur, 0, lh - y),
      });
      v.setVisible(true);
      return true;
    }
    case 'cacher':
      v.setVisible(false);
      return true;
    case 'ouvrir':
      if (typeof commande.url !== 'string' || commande.url.length > 4000 || !web(commande.url))
        return false;
      if (w.getURL() !== commande.url) void w.loadURL(commande.url).catch(() => {});
      return true;
    case 'retour':
      if (w.navigationHistory.canGoBack()) w.navigationHistory.goBack();
      return true;
    case 'avant':
      if (w.navigationHistory.canGoForward()) w.navigationHistory.goForward();
      return true;
    case 'recharger':
      w.reload();
      return true;
    case 'etat':
      envoyerEtat();
      return true;
    default:
      return false;
  }
}

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
      if (c.onglet === 'navigateur' || c.onglet === 'fichiers')
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
  // L'app reste sur son origine, sauf le passage par la connexion (Supabase, Google, Apple), qui revient ensuite à
  // l'app ; le reste s'ouvre dans le navigateur par défaut de l'ordinateur.
  wc.on('will-navigate', (e, u) => {
    try {
      const cible = new URL(u);
      if (cible.origin === ORIGINE_APP) return;
      if (
        cible.protocol === 'https:' &&
        (cible.hostname.endsWith('.supabase.co') ||
          cible.hostname === 'accounts.google.com' ||
          cible.hostname === 'appleid.apple.com')
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
    if (principal && !dansLaPage) vue?.setVisible(false);
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
    vue = null;
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
    preparerSessionNavigateur();
    ipcMain.handle('six:navigateur', piloter);
    ipcMain.handle('six:barre', commandeBarre);
    ipcMain.handle('six:menu', choixMenu);
    // L'app signale à la barre l'état de Cosinus (volet ouvert).
    ipcMain.handle('six:app-etat', (evenement, e) => {
      if (!depuisApp(evenement) || !e || typeof e !== 'object') return;
      etatApp = {
        volet: e.volet === 'navigateur' || e.volet === 'fichiers' ? e.volet : null,
        cosinus: e.cosinus === true,
      };
      void etatBarre();
    });
    ipcMain.handle('six:connexion', connexion);
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
