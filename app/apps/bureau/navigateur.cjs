'use strict';
/**
 * Navigateur de Cosinus dans l'app de bureau : de vrais onglets Chromium (WebContentsView), posés sur la zone du
 * volet que l'app indique. Un seul onglet visible à la fois (l'onglet actif).
 *
 * Commandes reçues de l'app (preload.cjs → six:navigateur) : afficher / cacher (place du volet), ouvrir une adresse
 * dans l'onglet actif, précédent / suivant / recharger, onglets (nouveau, choisir, fermer), rechercher dans la page,
 * zoom, et le menu « ⋯ » (menu natif, au-dessus de la page).
 *
 * Chaque discussion (Chat ou Cosinus) a ses propres onglets et son propre profil (cookies, connexions aux sites) :
 * rien ne passe d'une discussion à l'autre. L'app indique la discussion affichée (commande « contexte »).
 * Une discussion sans message est un brouillon (« chat:nouvelle », « cosinus:nouvelle ») : au premier message, l'app
 * le transmet à la discussion (commande « contexte-adopter ») et un brouillon vierge repart.
 * Les onglets de chaque discussion sont mémorisés (six-navigateur.json) : ils se rouvrent au retour, même après un
 * redémarrage de l'app.
 *
 * Sécurité (inchangée) : profils séparés de l'app, ni Node ni fichiers, aucune autorisation d'office,
 * téléchargements confiés au navigateur de l'ordinateur, seulement des pages http(s).
 */
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { WebContentsView, Menu, shell, clipboard, dialog, session, app } = require('electron');

// Profil d'avant la séparation par discussion (et des pages ouvertes hors discussion).
const PARTITION = 'persist:cosinus';
const CONTEXTE = /^(chat|cosinus):[A-Za-z0-9_-]{1,80}$/;
// Discussions gardées ouvertes en même temps ; au-delà, les onglets de la plus ancienne se ferment (ses cookies
// restent dans son profil).
const GROUPES_MAX = 6;
// Discussions dont les onglets sont mémorisés (les plus anciennes sont oubliées au-delà).
const MEMOIRE_MAX = 300;

/** Mémoire du navigateur : profil et onglets (adresses) de chaque discussion. */
const fichierMemoire = () => path.join(app.getPath('userData'), 'six-navigateur.json');
function lireMemoire() {
  try {
    const d = JSON.parse(fs.readFileSync(fichierMemoire(), 'utf8'));
    return {
      partitions: d && typeof d.partitions === 'object' ? d.partitions : {},
      onglets: d && typeof d.onglets === 'object' ? d.onglets : {},
    };
  } catch {
    return { partitions: {}, onglets: {} };
  }
}
const ONGLETS_MAX = 12;
const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const web = (u) => {
  try {
    const p = new URL(u).protocol;
    return p === 'https:' || p === 'http:';
  } catch {
    return false;
  }
};
const sans = (objet, cle) => Object.fromEntries(Object.entries(objet).filter(([c]) => c !== cle));
const borne = (v, min, max) => Math.round(Math.min(max, Math.max(min, Number(v) || 0)));

/**
 * @param {{ fenetre: () => import('electron').BrowserWindow | null,
 *           appli: () => import('electron').WebContentsView | null,
 *           barre: number,
 *           depuisApp: (e: import('electron').IpcMainInvokeEvent) => boolean }} ctx
 */
function creerNavigateur(ctx) {
  /** Onglets de la discussion affichée. @type {Map<number, WebContentsView>} */
  let onglets = new Map();
  let actif = 0;
  let contexte = 'defaut';
  let partition = PARTITION;
  /** Discussions mises de côté (les plus anciennes d'abord). @type {Map<string, { onglets: Map<number, WebContentsView>, actif: number }>} */
  const groupes = new Map();
  const preparees = new Set();
  /** Adresse demandée à un onglet, gardée tant que sa page n'a pas encore d'adresse (chargement en cours). */
  const voulues = new WeakMap();
  const adresseDe = (v) => v.webContents.getURL() || voulues.get(v) || '';
  /** @type {{ partitions: Record<string, string>, onglets: Record<string, { urls: string[], actif: number }> }} */
  let memoire = null;
  let minuterieMemoire = null;
  const lireMem = () => (memoire ??= lireMemoire());
  function sauverMemoire() {
    clearTimeout(minuterieMemoire);
    minuterieMemoire = setTimeout(() => {
      const m = lireMem();
      // Les plus anciennes d'abord (ordre d'insertion) : on ne garde que les dernières.
      m.onglets = Object.fromEntries(Object.entries(m.onglets).slice(-MEMOIRE_MAX));
      try {
        fs.writeFileSync(fichierMemoire(), JSON.stringify(m));
      } catch {
        /* disque plein ou dossier en lecture seule : la mémoire reste pour cette session */
      }
    }, 600);
  }
  const partitionDe = (c) =>
    c === 'defaut'
      ? PARTITION
      : (lireMem().partitions[c] ??
        `persist:six-${createHash('sha256').update(c).digest('hex').slice(0, 24)}`);
  /** Garde les adresses des onglets de la discussion affichée (rouverts au retour). */
  function noterOnglets() {
    if (contexte === 'defaut') return;
    const m = lireMem();
    const ids = [...onglets.keys()];
    const urls = ids.map((id) => adresseDe(onglets.get(id)));
    const gardes = urls.filter(web);
    // Retirée puis remise : la discussion passe en dernier (la plus récente).
    m.onglets = sans(m.onglets, contexte);
    if (gardes.length)
      m.onglets[contexte] = {
        urls: gardes.slice(0, ONGLETS_MAX),
        actif: Math.max(0, gardes.indexOf(urls[ids.indexOf(actif)])),
      };
    sauverMemoire();
  }
  let suivant = 1;
  let visible = false;
  let bornes = { x: 0, y: 0, width: 0, height: 0 };

  const versApp = (canal, donnees) => ctx.appli()?.webContents.send(canal, donnees);
  const vueActive = () => onglets.get(actif) ?? null;

  function envoyerEtat() {
    const v = vueActive();
    if (!v) return;
    const w = v.webContents;
    versApp('six:navigateur-etat', {
      url: w.getURL(),
      titre: w.getTitle(),
      charge: w.isLoading(),
      retour: w.navigationHistory.canGoBack(),
      avant: w.navigationHistory.canGoForward(),
      zoom: Math.round(w.getZoomFactor() * 100),
    });
  }

  function envoyerOnglets() {
    noterOnglets();
    versApp('six:navigateur-onglets', {
      actif,
      onglets: [...onglets].map(([id, v]) => ({
        id,
        titre: v.webContents.getTitle() || v.webContents.getURL() || 'Nouvel onglet',
        url: v.webContents.getURL(),
        charge: v.webContents.isLoading(),
      })),
    });
  }

  function placer() {
    for (const [id, v] of onglets) {
      const montrer = visible && id === actif;
      if (montrer) v.setBounds(bornes);
      v.setVisible(montrer);
    }
  }

  function preparerSession(nom = PARTITION) {
    if (preparees.has(nom)) return;
    preparees.add(nom);
    const s = session.fromPartition(nom);
    // Aucune autorisation accordée d'office (caméra, micro, position, notifications…).
    const permis = (p) => p === 'fullscreen' || p === 'clipboard-sanitized-write';
    s.setPermissionRequestHandler((_wc, p, rappel) => rappel(permis(p)));
    s.setPermissionCheckHandler((_wc, p) => permis(p));
    // Pas de téléchargement silencieux : le navigateur de l'ordinateur s'en charge (il demande où enregistrer).
    s.on('will-download', (e, item) => {
      e.preventDefault();
      if (web(item.getURL())) void shell.openExternal(item.getURL());
    });
  }

  function nouvelOnglet(url) {
    const f = ctx.fenetre();
    if (!f) return 0;
    if (onglets.size >= ONGLETS_MAX) fermerOnglet([...onglets.keys()][0]);
    const v = new WebContentsView({
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
      },
    });
    v.setBackgroundColor('#ffffff');
    v.setVisible(false);
    f.contentView.addChildView(v);
    const id = suivant++;
    onglets.set(id, v);
    const w = v.webContents;
    w.on('will-navigate', (e, u) => {
      if (!web(u)) e.preventDefault();
    });
    // Un lien qui ouvre une fenêtre ouvre un nouvel onglet, comme dans un navigateur.
    w.setWindowOpenHandler(({ url: cible }) => {
      if (web(cible)) choisirOnglet(nouvelOnglet(cible));
      return { action: 'deny' };
    });
    const maj = () => {
      if (id === actif) envoyerEtat();
      envoyerOnglets();
    };
    for (const ev of [
      'did-navigate',
      'did-navigate-in-page',
      'page-title-updated',
      'did-start-loading',
      'did-stop-loading',
      'zoom-changed',
    ])
      w.on(ev, maj);
    // Chromium envoie des résultats partiels pendant la recherche : seul le résultat final compte.
    w.on('found-in-page', (_e, r) => {
      if (id === actif && r.finalUpdate)
        versApp('six:navigateur-recherche', { trouves: r.matches, position: r.activeMatchOrdinal });
    });
    // Raccourcis habituels quand la page a le clavier.
    w.on('before-input-event', (e, entree) => {
      if (entree.type !== 'keyDown' || !(entree.control || entree.meta)) return;
      const k = entree.key.toLowerCase();
      if (k === 't') choisirOnglet(nouvelOnglet());
      else if (k === 'w') fermerOnglet(id);
      else if (k === 'f') versApp('six:navigateur-commande', { type: 'rechercher' });
      else if (k === 'p') w.print();
      else if (k === '=' || k === '+') zoomer(1);
      else if (k === '-') zoomer(-1);
      else if (k === '0') w.setZoomFactor(1);
      else return;
      e.preventDefault();
      maj();
    });
    if (url && web(url)) {
      voulues.set(v, url);
      void w.loadURL(url).catch(() => {});
    }
    envoyerOnglets();
    return id;
  }

  function fermerVues(liste) {
    for (const v of liste.values()) {
      ctx.fenetre()?.contentView.removeChildView(v);
      v.webContents.close();
    }
  }

  /** Discussion affichée : ses onglets et son profil remplacent ceux de la précédente (mise de côté). */
  function changerContexte(nouveau) {
    if (nouveau === contexte) return;
    vueActive()?.webContents.stopFindInPage('clearSelection');
    for (const v of onglets.values()) v.setVisible(false);
    groupes.delete(contexte);
    groupes.set(contexte, { onglets, actif });
    const g = groupes.get(nouveau) ?? { onglets: new Map(), actif: 0 };
    groupes.delete(nouveau);
    onglets = g.onglets;
    actif = g.actif;
    contexte = nouveau;
    partition = partitionDe(nouveau);
    preparerSession(partition);
    // Au-delà, les onglets de la plus ancienne se ferment ; leurs adresses restent mémorisées (rouverts au retour).
    while (groupes.size > GROUPES_MAX) {
      const [plusAncien, vieux] = groupes.entries().next().value;
      groupes.delete(plusAncien);
      fermerVues(vieux.onglets);
    }
    if (!onglets.size) {
      // Retour sur une discussion : ses onglets mémorisés se rouvrent.
      const m = lireMem().onglets[nouveau];
      const urls = (m?.urls ?? []).filter(web).slice(0, ONGLETS_MAX);
      const ids = urls.map((u) => nouvelOnglet(u));
      actif = ids[Math.min(Math.max(0, Number(m?.actif) || 0), ids.length - 1)] ?? nouvelOnglet();
    }
    placer();
    envoyerEtat();
    envoyerOnglets();
  }

  /**
   * Premier message d'une discussion : son brouillon (onglets, profil, adresses mémorisées) devient le sien ; le
   * brouillon repart vierge, avec un profil neuf.
   */
  function adopter(de, vers) {
    const m = lireMem();
    m.partitions[vers] = partitionDe(de);
    m.partitions[de] = `persist:six-${randomBytes(12).toString('hex')}`;
    if (m.onglets[de]) m.onglets[vers] = m.onglets[de];
    m.onglets = sans(m.onglets, de);
    if (contexte === de) contexte = vers;
    else if (groupes.has(de)) {
      groupes.set(vers, groupes.get(de));
      groupes.delete(de);
    }
    sauverMemoire();
  }

  function choisirOnglet(id) {
    if (!onglets.has(id)) return;
    vueActive()?.webContents.stopFindInPage('clearSelection');
    actif = id;
    placer();
    envoyerEtat();
    envoyerOnglets();
  }

  function fermerOnglet(id) {
    const v = onglets.get(id);
    if (!v) return;
    const ids = [...onglets.keys()];
    const i = ids.indexOf(id);
    onglets.delete(id);
    ctx.fenetre()?.contentView.removeChildView(v);
    v.webContents.close();
    if (id === actif) {
      const reste = [...onglets.keys()];
      actif = reste[Math.min(i, reste.length - 1)] ?? 0;
      if (!actif) actif = nouvelOnglet();
      placer();
      envoyerEtat();
    }
    envoyerOnglets();
  }

  function zoomer(sens) {
    const w = vueActive()?.webContents;
    if (!w) return;
    const z = w.getZoomFactor();
    const i = ZOOMS.findIndex((x) => x >= z - 0.001);
    const j = Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? ZOOMS.indexOf(1) : i) + sens));
    w.setZoomFactor(ZOOMS[j]);
    envoyerEtat();
  }

  async function effacerDonnees() {
    const f = ctx.fenetre();
    if (!f) return;
    const { response } = await dialog.showMessageBox(f, {
      type: 'warning',
      buttons: ['Effacer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      title: 'Effacer les données de navigation',
      message: 'Effacer les données de navigation de cette discussion ?',
      detail:
        'Les cookies, connexions aux sites, fichiers en cache et données des sites de cette discussion seront effacés. Les autres discussions ne changent pas.',
    });
    if (response !== 0) return;
    const s = session.fromPartition(partition);
    await s.clearStorageData();
    await s.clearCache();
    for (const v of onglets.values()) v.webContents.reload();
  }

  function ouvrirMenu(x, y) {
    const f = ctx.fenetre();
    const v = vueActive();
    if (!f || !v) return;
    const w = v.webContents;
    const url = w.getURL();
    const zoom = Math.round(w.getZoomFactor() * 100);
    Menu.buildFromTemplate([
      {
        label: 'Nouvel onglet',
        accelerator: 'CmdOrCtrl+T',
        click: () => choisirOnglet(nouvelOnglet()),
      },
      { type: 'separator' },
      {
        label: 'Rechercher dans la page…',
        accelerator: 'CmdOrCtrl+F',
        click: () => versApp('six:navigateur-commande', { type: 'rechercher' }),
      },
      { label: 'Imprimer…', accelerator: 'CmdOrCtrl+P', click: () => w.print() },
      {
        label: 'Capture de la page',
        sublabel: 'Copiée dans le presse-papiers',
        click: async () => clipboard.writeImage(await w.capturePage()),
      },
      { type: 'separator' },
      { label: `Zoom : ${zoom} %`, enabled: false },
      { label: 'Zoom avant', accelerator: 'CmdOrCtrl+=', click: () => zoomer(1) },
      { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: () => zoomer(-1) },
      {
        label: 'Taille normale',
        accelerator: 'CmdOrCtrl+0',
        enabled: zoom !== 100,
        click: () => {
          w.setZoomFactor(1);
          envoyerEtat();
        },
      },
      { type: 'separator' },
      {
        label: 'Copier le lien',
        enabled: web(url),
        click: () => clipboard.writeText(url),
      },
      {
        label: "Ouvrir dans le navigateur de l'ordinateur",
        enabled: web(url),
        click: () => void shell.openExternal(url),
      },
      {
        label: 'Téléchargements',
        click: () => void shell.openPath(app.getPath('downloads')),
      },
      {
        label: 'Historique',
        click: () => versApp('six:navigateur-commande', { type: 'historique' }),
      },
      { type: 'separator' },
      { label: 'Effacer les données de navigation…', click: () => void effacerDonnees() },
    ]).popup({ window: f, x: borne(x, 0, 8000), y: borne(y + ctx.barre, 0, 8000) });
  }

  /** Commande venue de l'app (six:navigateur). */
  function piloter(evenement, c) {
    const f = ctx.fenetre();
    if (!ctx.depuisApp(evenement) || !f || !c || typeof c !== 'object') return false;
    if (c.action === 'contexte') {
      if (typeof c.contexte !== 'string' || !CONTEXTE.test(c.contexte)) return false;
      changerContexte(c.contexte);
      return true;
    }
    if (c.action === 'contexte-adopter') {
      if (typeof c.de !== 'string' || typeof c.vers !== 'string') return false;
      if (!CONTEXTE.test(c.de) || !CONTEXTE.test(c.vers) || c.de === c.vers) return false;
      adopter(c.de, c.vers);
      return true;
    }
    if (!onglets.size) actif = nouvelOnglet();
    const w = vueActive()?.webContents;
    if (!w) return false;
    switch (c.action) {
      case 'afficher': {
        // Position donnée dans la page de l'app, qui commence sous la barre du haut.
        const [lw, lh] = f.getContentSize();
        const b = c.bornes ?? {};
        const x = borne(b.x, 0, lw);
        const y = borne(Number(b.y) + ctx.barre, ctx.barre, lh);
        bornes = {
          x,
          y,
          width: borne(b.largeur, 0, lw - x),
          height: borne(b.hauteur, 0, lh - y),
        };
        visible = true;
        placer();
        return true;
      }
      case 'cacher':
        visible = false;
        placer();
        return true;
      case 'ouvrir':
        if (typeof c.url !== 'string' || c.url.length > 4000 || !web(c.url)) return false;
        if (w.getURL() !== c.url) {
          const vue = vueActive();
          if (vue) voulues.set(vue, c.url);
          void w.loadURL(c.url).catch(() => {});
        }
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
      case 'onglet-nouveau':
        choisirOnglet(nouvelOnglet(typeof c.url === 'string' ? c.url : undefined));
        return true;
      case 'onglet-choisir':
        choisirOnglet(Number(c.id));
        return true;
      case 'onglet-fermer':
        fermerOnglet(Number(c.id));
        return true;
      case 'rechercher':
        if (typeof c.texte !== 'string' || !c.texte) {
          w.stopFindInPage('clearSelection');
          versApp('six:navigateur-recherche', { trouves: 0, position: 0 });
        } else
          w.findInPage(c.texte.slice(0, 200), {
            forward: c.precedent !== true,
            findNext: c.suite === true,
          });
        return true;
      case 'arreter-recherche':
        w.stopFindInPage('clearSelection');
        return true;
      case 'zoom':
        if (c.sens === 0) w.setZoomFactor(1);
        else zoomer(c.sens > 0 ? 1 : -1);
        return true;
      case 'menu':
        ouvrirMenu(Number(c.x), Number(c.y));
        return true;
      case 'etat':
        envoyerEtat();
        envoyerOnglets();
        return true;
      default:
        return false;
    }
  }

  return {
    preparerSession,
    piloter,
    /** Nouvelle page de l'app : le navigateur se cache jusqu'à ce que le volet le replace. */
    cacher: () => {
      visible = false;
      placer();
    },
    oublier: () => {
      onglets.clear();
      groupes.clear();
      actif = 0;
    },
  };
}

module.exports = { creerNavigateur };
