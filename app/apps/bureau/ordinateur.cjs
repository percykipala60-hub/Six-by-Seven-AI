'use strict';
/**
 * Contrôle de l'ordinateur par Six (app de bureau, Windows pour commencer) : lire une fenêtre (accessibilité de
 * Windows + capture d'écran), cliquer, remplir, taper, raccourcis, ouvrir une application. Le travail bas niveau est
 * fait par ordinateur-windows.ps1 (UI Automation et user32, sans dépendance) ; ce module applique les protections
 * AVANT chaque commande :
 * - accord global (une fois par lancement), puis accord par application, demandés à la personne (jamais d'office) ;
 * - applications toujours interdites : fenêtres de sécurité et de connexion de Windows, gestionnaires de mots de
 *   passe, et Six lui-même ;
 * - jamais de mot de passe (les champs de mot de passe sont refusés), jamais de clic engageant (acheter, payer,
 *   supprimer, envoyer, publier, confirmer, commander, s'abonner…) : laissés à la personne ;
 * - arrêt d'urgence : Ctrl+Alt+Échap, ou la commande « arreter » ; tout est refusé jusqu'au prochain accord.
 * Seule la page de l'app (même origine) peut envoyer des commandes (vérifié par depuisApp dans main.cjs).
 */
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { dialog, desktopCapturer, globalShortcut } = require('electron');

const DELAI_MS = 15_000;
// Jamais pilotées, même avec accord : sécurité de Windows, connexion, gestionnaires de mots de passe.
const INTERDITES = new Set(
  [
    'consent',
    'credentialuibroker',
    'logonui',
    'lockapp',
    'securityhealthsystray',
    'sechealthui',
    'windowsdefender',
    'msmpeng',
    'mmc',
    'regedit',
    'taskmgr',
    'cmd',
    'powershell',
    'pwsh',
    'windowsterminal',
    'wt',
    '1password',
    'bitwarden',
    'keepass',
    'keepassxc',
    'protonpass',
    'dashlane',
    'lastpass',
    'enpass',
    'nordpass',
    'roboform',
  ].map((n) => n.toLowerCase()),
);
const ENGAGEANT =
  /acheter|payer|paiement|commander|supprimer|effacer d[ée]finitivement|envoyer|publier|confirmer|valider le paiement|s['’]abonner|transf[ée]rer|virement|install(er|ation)|d[ée]sinstaller|formater/i;
const ACTIONS = new Set([
  'fenetres',
  'observer',
  'capture',
  'cliquer',
  'remplir',
  'taper',
  'raccourci',
  'focaliser',
  'ouvrir',
  'applications',
  'arreter',
  'etat',
]);
const RACCOURCIS_INTERDITS = /^(ctrl\+alt\+(suppr|del)|alt\+f4\+?|win)/i;

/** Raccourcis du menu Démarrer : nom affiché -> chemin du .lnk (pour « ouvrir » une application par son nom). */
function raccourcisDemarrer() {
  const dossiers = [
    path.join(
      process.env.ProgramData || 'C:\\ProgramData',
      'Microsoft\\Windows\\Start Menu\\Programs',
    ),
    path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
  ];
  const trouves = new Map();
  const parcourir = (d, profondeur) => {
    if (profondeur > 3) return;
    let entrees;
    try {
      entrees = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) parcourir(p, profondeur + 1);
      else if (e.name.toLowerCase().endsWith('.lnk')) {
        const nom = e.name.slice(0, -4);
        if (!/uninstall|désinstaller|readme|help|aide de/i.test(nom)) trouves.set(nom, p);
      }
    }
  };
  for (const d of dossiers) parcourir(d, 0);
  return trouves;
}
const sansAccents = (t) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * @param {{ fenetre: () => import('electron').BrowserWindow | null }} ctx
 */
function creerOrdinateur(ctx) {
  /** @type {import('node:child_process').ChildProcess | null} */
  let aide = null;
  let tampon = '';
  let suivant = 1;
  const attentes = new Map();
  let accordGlobal = false;
  let arrete = false;
  const autorisees = new Set();
  const refusees = new Set();
  let raccourcis = null;

  function demarrerAide() {
    if (aide && !aide.killed && aide.exitCode === null) return aide;
    const script = path
      .join(__dirname, 'ordinateur-windows.ps1')
      .replace('app.asar', 'app.asar.unpacked');
    aide = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    tampon = '';
    aide.stdout.on('data', (d) => {
      tampon += d.toString('utf8');
      let i;
      while ((i = tampon.indexOf('\n')) >= 0) {
        const ligne = tampon.slice(0, i).trim();
        tampon = tampon.slice(i + 1);
        if (!ligne) continue;
        try {
          const r = JSON.parse(ligne);
          const a = attentes.get(r.id);
          if (a) {
            attentes.delete(r.id);
            clearTimeout(a.minuterie);
            if (r.ok) a.resoudre(r.resultat);
            else a.rejeter(new Error(r.erreur || 'Action impossible.'));
          }
        } catch {
          /* ligne illisible : ignorée */
        }
      }
    });
    aide.on('exit', () => {
      for (const a of attentes.values()) {
        clearTimeout(a.minuterie);
        a.rejeter(new Error('Le module de contrôle s’est arrêté.'));
      }
      attentes.clear();
      aide = null;
    });
    return aide;
  }

  function envoyer(commande) {
    const p = demarrerAide();
    const id = suivant++;
    return new Promise((resoudre, rejeter) => {
      const minuterie = setTimeout(() => {
        attentes.delete(id);
        rejeter(new Error('Pas de réponse de la fenêtre (délai dépassé).'));
      }, DELAI_MS);
      attentes.set(id, { resoudre, rejeter, minuterie });
      p.stdin.write(`${JSON.stringify({ ...commande, id })}\n`);
    });
  }

  function surveillerArret() {
    if (raccourcis) return;
    raccourcis = true;
    try {
      globalShortcut.register('CommandOrControl+Alt+Escape', () => {
        arrete = true;
        accordGlobal = false;
        void dialog.showMessageBox({
          type: 'info',
          title: 'Six',
          message: 'Contrôle de l’ordinateur arrêté.',
          detail: 'Six ne touchera plus à l’ordinateur sans un nouvel accord.',
        });
      });
    } catch {
      /* raccourci déjà pris par une autre application */
    }
  }

  async function demander(message, detail) {
    const f = ctx.fenetre();
    const options = {
      type: 'question',
      buttons: ['Autoriser', 'Refuser'],
      defaultId: 1,
      cancelId: 1,
      title: 'Six',
      message,
      detail,
    };
    const { response } = f
      ? await dialog.showMessageBox(f, options)
      : await dialog.showMessageBox(options);
    return response === 0;
  }

  async function exigerAccordGlobal() {
    if (arrete && !accordGlobal) arrete = false;
    if (accordGlobal) return;
    surveillerArret();
    const ok = await demander(
      'Autoriser Six à contrôler cet ordinateur ?',
      'Six pourra lire les fenêtres que tu autorises, cliquer et taper pour toi. Il te demandera l’accord pour chaque application. Il ne touche jamais aux mots de passe ni aux paiements. Arrêt immédiat : Ctrl+Alt+Échap.',
    );
    if (!ok) throw new Error('Contrôle de l’ordinateur refusé par la personne.');
    accordGlobal = true;
  }

  const estSixLuiMeme = (chemin) =>
    Boolean(chemin) &&
    path.resolve(chemin).toLowerCase() === path.resolve(process.execPath).toLowerCase();

  async function exigerApplication(appNom, chemin) {
    const nom = String(appNom || '').toLowerCase();
    if (!nom) throw new Error('Application inconnue : observe une fenêtre d’abord.');
    if (INTERDITES.has(nom) || estSixLuiMeme(chemin))
      throw new Error(`« ${appNom} » ne peut pas être contrôlée par Six (sécurité).`);
    if (autorisees.has(nom)) return;
    if (refusees.has(nom)) throw new Error(`La personne a refusé que Six utilise « ${appNom} ».`);
    const ok = await demander(
      `Autoriser Six à utiliser « ${appNom} » ?`,
      'Il pourra lire cette fenêtre, cliquer et taper dedans.',
    );
    if (!ok) {
      refusees.add(nom);
      throw new Error(`La personne a refusé que Six utilise « ${appNom} ».`);
    }
    autorisees.add(nom);
  }

  /** Application de la fenêtre visée (ou de celle au premier plan). */
  async function appDe(fenetre) {
    if (fenetre) {
      const { fenetres } = await envoyer({ action: 'fenetres' });
      const f = fenetres.find((x) => String(x.fenetre) === String(fenetre));
      if (!f) throw new Error('Fenêtre introuvable : liste de nouveau les fenêtres.');
      return f;
    }
    return envoyer({ action: 'premier_plan' });
  }

  let derniere = null; // application de la dernière observation (les repères lui appartiennent)
  let fenetreActive = null; // fenêtre où Six travaille : remise devant la personne avant chaque action

  /** Ramène la fenêtre de travail au premier plan (la personne voit ce que fait Six, même si elle a réduit Six). */
  async function devant() {
    if (fenetreActive)
      await envoyer({ action: 'focaliser', fenetre: fenetreActive }).catch(() => {});
  }

  async function capture() {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 800 },
    });
    const ecran = sources[0];
    if (!ecran) throw new Error('Capture d’écran indisponible.');
    return { image: `data:image/jpeg;base64,${ecran.thumbnail.toJPEG(60).toString('base64')}` };
  }

  /**
   * Commande venue de l'agent de Six (par la page de l'app). Renvoie le résultat, ou lève une erreur lisible
   * (renvoyée à l'agent comme observation).
   */
  async function piloter(c) {
    if (process.platform !== 'win32')
      throw new Error('Le contrôle de l’ordinateur arrive bientôt sur ce système.');
    if (!c || typeof c !== 'object' || !ACTIONS.has(c.action)) throw new Error('Action inconnue.');
    if (c.action === 'etat')
      return { actif: accordGlobal && !arrete, applications: [...autorisees] };
    if (c.action === 'arreter') {
      arrete = true;
      accordGlobal = false;
      return { fait: 'arrêté' };
    }
    await exigerAccordGlobal();
    switch (c.action) {
      case 'applications':
        return { applications: [...raccourcisDemarrer().keys()].sort().slice(0, 300) };
      case 'fenetres': {
        const { fenetres } = await envoyer({ action: 'fenetres' });
        // Titres seulement pour les applications déjà autorisées : les autres ne montrent que leur nom.
        return {
          fenetres: fenetres
            .filter((f) => !estSixLuiMeme(f.chemin))
            .map((f) => ({
              fenetre: f.fenetre,
              app: f.app,
              titre: autorisees.has(String(f.app).toLowerCase()) ? f.titre : '',
            })),
        };
      }
      case 'focaliser': {
        const f = await appDe(c.fenetre);
        await exigerApplication(f.app, f.chemin);
        await envoyer({ action: 'focaliser', fenetre: f.fenetre });
        fenetreActive = f.fenetre;
        return { fait: 'fenêtre au premier plan', app: f.app, titre: f.titre };
      }
      case 'observer': {
        if (!c.fenetre) await devant();
        const f = await appDe(c.fenetre ?? fenetreActive ?? undefined);
        await exigerApplication(f.app, f.chemin);
        fenetreActive = f.fenetre;
        await devant();
        const r = await envoyer({ action: 'observer', fenetre: f.fenetre });
        derniere = String(r.app || '').toLowerCase();
        // Les valeurs des champs de mot de passe ne sont jamais lues ; on les signale seulement.
        r.elements = (r.elements || []).map((e) => (e.motDePasse ? { ...e, valeur: '' } : e));
        return r;
      }
      case 'capture': {
        const f = await appDe(undefined);
        await exigerApplication(f.app, f.chemin);
        return { app: f.app, ...(await capture()) };
      }
      case 'cliquer':
      case 'remplir': {
        await devant();
        const f = await appDe(undefined);
        await exigerApplication(f.app, f.chemin);
        if (!derniere || derniere !== String(f.app).toLowerCase())
          throw new Error('La fenêtre au premier plan a changé : observe-la de nouveau.');
        const cible = await envoyer({ action: 'cible', element: String(c.element || '') });
        if (cible.motDePasse)
          throw new Error('Champ de mot de passe : laisse la personne le remplir.');
        if (c.action === 'cliquer' && ENGAGEANT.test(cible.nom || ''))
          throw new Error(
            `Action engageante (« ${cible.nom} ») : laisse la personne cliquer elle-même.`,
          );
        return envoyer(
          c.action === 'cliquer'
            ? { action: 'cliquer', element: String(c.element) }
            : {
                action: 'remplir',
                element: String(c.element),
                texte: String(c.texte ?? '').slice(0, 2000),
              },
        );
      }
      case 'taper': {
        await devant();
        const f = await appDe(undefined);
        await exigerApplication(f.app, f.chemin);
        return envoyer({ action: 'taper', texte: String(c.texte ?? '').slice(0, 2000) });
      }
      case 'raccourci': {
        const touches = String(c.touches || '').trim();
        if (!touches || RACCOURCIS_INTERDITS.test(touches)) throw new Error('Raccourci refusé.');
        await devant();
        const f = await appDe(undefined);
        await exigerApplication(f.app, f.chemin);
        return envoyer({ action: 'raccourci', touches });
      }
      case 'ouvrir': {
        const demande = sansAccents(String(c.app || ''));
        if (!demande) throw new Error('Nom d’application manquant.');
        const liste = [...raccourcisDemarrer()];
        const trouve =
          liste.find(([nom]) => sansAccents(nom) === demande) ??
          liste.find(([nom]) => sansAccents(nom).includes(demande));
        if (!trouve) throw new Error(`Application « ${c.app} » introuvable dans le menu Démarrer.`);
        const [nom, chemin] = trouve;
        await exigerApplication(nom, '');
        const r = await envoyer({ action: 'ouvrir', chemin });
        // La nouvelle fenêtre est devant la personne ; elle devient la fenêtre de travail (même accord pour son
        // processus : la personne vient d'autoriser cette application).
        if (r.fenetre) {
          fenetreActive = r.fenetre;
          if (r.app && !INTERDITES.has(String(r.app).toLowerCase()) && !estSixLuiMeme(r.chemin))
            autorisees.add(String(r.app).toLowerCase());
        }
        return { fait: r.fait, app: nom, fenetre: r.fenetre, titre: r.titre };
      }
      default:
        throw new Error('Action inconnue.');
    }
  }

  return {
    piloter,
    arreter: () => {
      try {
        globalShortcut.unregister('CommandOrControl+Alt+Escape');
      } catch {
        /* rien */
      }
      if (aide) aide.kill();
    },
  };
}

module.exports = { creerOrdinateur, ENGAGEANT, INTERDITES };
