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
  'fermer',
  'arreter',
  'etat',
]);
const RACCOURCIS_INTERDITS = /^(ctrl\+alt\+(suppr|del)|alt\+f4\+?|win)/i;

const sansAccents = (t) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Noms courants -> nom affiché dans le menu Démarrer (Windows en français ou en anglais).
const ALIAS = new Map([
  ['bloc note', 'bloc notes'],
  ['blocnote', 'bloc notes'],
  ['blocnotes', 'bloc notes'],
  ['notepad', 'bloc notes'],
  ['calculator', 'calculatrice'],
  ['calc', 'calculatrice'],
  ['explorer', 'explorateur de fichiers'],
  ['explorateur', 'explorateur de fichiers'],
  ['file explorer', 'explorateur de fichiers'],
  ['settings', 'parametres'],
  ['reglages', 'parametres'],
]);
const echapperRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Choisit l'application demandée dans le menu Démarrer : nom exact, puis début du nom, puis mot entier. Plusieurs
 * candidates au même rang, ou aucune : erreur avec les noms possibles (Six ne devine jamais).
 * @param {{ nom: string, id: string }[]} liste
 */
function trouverApplication(liste, demandeBrute) {
  const d0 = sansAccents(String(demandeBrute || ''));
  const d = ALIAS.get(d0) ?? d0;
  if (!d) throw new Error('Nom d’application manquant.');
  const motEntier = new RegExp(`(^| )${echapperRegex(d)}( |$)`);
  const rang = (nom) => {
    const n = sansAccents(nom);
    if (n === d) return 3;
    if (n.startsWith(`${d} `)) return 2;
    return motEntier.test(n) ? 1 : 0;
  };
  const notes = liste.map((a) => ({ a, r: rang(a.nom) })).filter((x) => x.r > 0);
  const meilleur = Math.max(0, ...notes.map((x) => x.r));
  const choix = notes.filter((x) => x.r === meilleur);
  if (choix.length === 1) return choix[0].a;
  if (!choix.length) {
    const debut = d.split(' ')[0];
    const proches = liste.filter((a) => sansAccents(a.nom).includes(debut)).slice(0, 8);
    throw new Error(
      `Application « ${demandeBrute} » introuvable.${proches.length ? ` Noms proches : ${proches.map((a) => a.nom).join(', ')}.` : ' Utilise « applications » pour voir la liste.'}`,
    );
  }
  throw new Error(
    `Plusieurs applications correspondent à « ${demandeBrute} » : ${choix.map((x) => x.a.nom).join(', ')}. Précise laquelle.`,
  );
}

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
        // Le module reconnaît ainsi les fenêtres de Six (la personne regarde Six : il peut passer l'application devant).
        env: { ...process.env, SIX_CHEMIN: process.execPath },
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
  const ouvertesParSix = new Set(); // seules fenêtres que Six peut fermer (ouvertes par lui pendant ce lancement)
  let applicationsCache = null;
  async function applications() {
    if (!applicationsCache || Date.now() - applicationsCache.quand > 5 * 60_000)
      applicationsCache = {
        quand: Date.now(),
        liste: (await envoyer({ action: 'applications' })).applications,
      };
    return applicationsCache.liste;
  }

  /** Ramène la fenêtre de travail au premier plan (la personne voit ce que fait Six, même si elle a réduit Six). */
  /** Fenêtre où Six travaille (ouverte ou observée par lui), avec l'accord de la personne pour son application. */
  async function fenetreDeTravail() {
    if (!fenetreActive)
      throw new Error('Aucune fenêtre de travail : ouvre ou observe d’abord l’application.');
    const f = await appDe(fenetreActive).catch(() => null);
    if (!f) {
      fenetreActive = null;
      throw new Error('La fenêtre de travail a été fermée : rouvre l’application.');
    }
    await exigerApplication(f.app, f.chemin);
    return f;
  }

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
        return {
          applications: (await applications())
            .map((a) => a.nom)
            .sort()
            .slice(0, 400),
        };
      case 'fermer': {
        // Retour en arrière : seulement une fenêtre que Six a lui-même ouverte (fermeture normale, l'application
        // propose d'enregistrer si besoin).
        const cible = String(c.fenetre ?? fenetreActive ?? '');
        if (!ouvertesParSix.has(cible))
          throw new Error(
            'Six ne ferme que les fenêtres qu’il a lui-même ouvertes : demande à la personne.',
          );
        await envoyer({ action: 'fermer', fenetre: cible });
        ouvertesParSix.delete(cible);
        if (fenetreActive === cible) fenetreActive = null;
        return { fait: 'fermeture demandée (l’application peut proposer d’enregistrer)' };
      }
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
      // Les actions visent la FENÊTRE DE TRAVAIL (celle que Six a ouverte ou observée), pas la fenêtre active : la
      // personne peut réduire Six ou utiliser une autre application, Six continue (en arrière-plan si besoin). Le
      // module ne tape jamais au clavier si la fenêtre active n'est pas exactement la fenêtre de travail.
      case 'cliquer':
      case 'remplir': {
        const f = await fenetreDeTravail();
        if (!derniere || derniere !== String(f.app).toLowerCase())
          throw new Error(
            'Observe d’abord la fenêtre de travail (les repères viennent de la dernière observation).',
          );
        const cible = await envoyer({ action: 'cible', element: String(c.element || '') });
        if (cible.motDePasse)
          throw new Error('Champ de mot de passe : laisse la personne le remplir.');
        if (c.action === 'cliquer' && ENGAGEANT.test(cible.nom || ''))
          throw new Error(
            `Action engageante (« ${cible.nom} ») : laisse la personne cliquer elle-même.`,
          );
        return envoyer(
          c.action === 'cliquer'
            ? { action: 'cliquer', element: String(c.element), fenetre: f.fenetre }
            : {
                action: 'remplir',
                element: String(c.element),
                texte: String(c.texte ?? '').slice(0, 2000),
                fenetre: f.fenetre,
              },
        );
      }
      case 'taper': {
        const f = await fenetreDeTravail();
        return envoyer({
          action: 'taper',
          texte: String(c.texte ?? '').slice(0, 2000),
          fenetre: f.fenetre,
        });
      }
      case 'raccourci': {
        const touches = String(c.touches || '').trim();
        if (!touches || RACCOURCIS_INTERDITS.test(touches)) throw new Error('Raccourci refusé.');
        const f = await fenetreDeTravail();
        return envoyer({ action: 'raccourci', touches, fenetre: f.fenetre });
      }
      case 'ouvrir': {
        const choix = trouverApplication(await applications(), c.app);
        const nom = choix.nom;
        await exigerApplication(nom, '');
        const r = await envoyer({ action: 'ouvrir', appid: choix.id });
        // La nouvelle fenêtre est devant la personne ; elle devient la fenêtre de travail (même accord pour son
        // processus : la personne vient d'autoriser cette application).
        if (r.fenetre) {
          fenetreActive = String(r.fenetre);
          ouvertesParSix.add(String(r.fenetre));
          if (r.app && !INTERDITES.has(String(r.app).toLowerCase()) && !estSixLuiMeme(r.chemin))
            autorisees.add(String(r.app).toLowerCase());
        }
        // L'agent vérifie que c'est bien l'application demandée (sinon il ferme celle-ci et ouvre la bonne).
        return {
          fait: r.fait,
          demande: String(c.app),
          ouverte: nom,
          fenetre: r.fenetre,
          titre: r.titre,
        };
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

module.exports = { creerOrdinateur, trouverApplication, ENGAGEANT, INTERDITES };
