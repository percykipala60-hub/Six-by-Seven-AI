'use strict';
/**
 * Terminal de Cosinus (app de bureau) : un vrai shell de l'ordinateur, ouvert dans le dossier de la discussion.
 * - Windows : PowerShell ; ailleurs : le shell de la personne (bash par défaut).
 * - Pas de pseudo-terminal (aucun module natif à installer) : les commandes passent ligne par ligne, la sortie
 *   revient au fil de l'eau. Les programmes plein écran (éditeurs, menus interactifs) ne sont pas pris en charge.
 * - Après chaque commande, le shell écrit une marque invisible avec son dossier courant : la page sait que la
 *   commande est finie et affiche la bonne invite.
 * - Seule la personne tape dans le terminal : l'agent de Six n'y a pas accès.
 */
const { spawn, execFile } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WINDOWS = process.platform === 'win32';
const MARQUE = '\u0001SIXPWD:';
const COMMANDE_MAX = 8000;
const TERMINAUX_MAX = 6;

/** Ligne qui fait écrire au shell la marque de fin avec le dossier courant. */
const LIGNE_MARQUE = WINDOWS
  ? `[Console]::Out.WriteLine([char]1 + 'SIXPWD:' + (Get-Location).Path)`
  : `printf '\\001SIXPWD:%s\\n' "$PWD"`;

/** Préparation du shell : sortie en UTF-8 (accents), puis première invite. */
const DEPART = WINDOWS
  ? `$u = New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding = $u; [Console]::OutputEncoding = $u; $OutputEncoding = $u; $ProgressPreference = 'SilentlyContinue'`
  : 'export TERM=dumb';

/**
 * PowerShell lit son entrée dans la page de code de la console : les accents tapés arriveraient abîmés. La commande
 * part donc en base64 (ASCII pur) et PowerShell la décode en UTF-8 avant de l'exécuter.
 */
function ligneCommande(commande) {
  if (!WINDOWS || !/[^\x20-\x7e\t]/.test(commande)) return commande;
  const b64 = Buffer.from(commande, 'utf8').toString('base64');
  return `Invoke-Expression ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))`;
}

function dossierValide(d) {
  try {
    if (typeof d === 'string' && path.isAbsolute(d) && fs.statSync(d).isDirectory())
      return path.normalize(d);
  } catch {
    /* dossier absent : dossier personnel */
  }
  return os.homedir();
}

/** Arrête le shell et tout ce qu'il a lancé (sous Windows, kill ne suffit pas pour les enfants). */
function tuer(p) {
  if (!p || p.exitCode !== null) return;
  if (WINDOWS && p.pid)
    execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else p.kill('SIGKILL');
}

/**
 * @param {(evenement: { id: number, type: 'sortie' | 'pret' | 'fin', texte?: string, cwd?: string }) => void} envoyer
 */
function creerTerminaux(envoyer) {
  /** @type {Map<number, { id: number, cwd: string, p: import('node:child_process').ChildProcess | null, occupe: boolean, reste: string }>} */
  const terminaux = new Map();
  let suivant = 1;

  function demarrer(t) {
    const p = WINDOWS
      ? spawn(
          'powershell.exe',
          ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
          {
            cwd: t.cwd,
            windowsHide: true,
            env: process.env,
          },
        )
      : spawn(process.env.SHELL || '/bin/bash', ['-s'], { cwd: t.cwd, env: process.env });
    t.p = p;
    t.occupe = true;
    t.reste = '';
    const lire = (flux) => {
      const dec = new StringDecoder('utf8');
      flux.on('data', (morceau) => recevoir(t, p, dec.write(morceau)));
    };
    lire(p.stdout);
    lire(p.stderr);
    p.on('error', (e) =>
      envoyer({
        id: t.id,
        type: 'sortie',
        texte: `Impossible de lancer le shell : ${e.message}\n`,
      }),
    );
    p.on('exit', () => {
      if (t.p !== p) return; // remplacé (commande arrêtée) : rien à signaler
      t.p = null;
      t.occupe = false;
      envoyer({ id: t.id, type: 'fin' });
    });
    p.stdin.write(`${DEPART}\n${LIGNE_MARQUE}\n`);
  }

  // La sortie est relayée telle quelle, sauf la marque de fin qui devient un événement « pret ».
  function recevoir(t, p, texte) {
    if (t.p !== p || !texte) return;
    let s = t.reste + texte;
    t.reste = '';
    let i;
    while ((i = s.indexOf(MARQUE)) !== -1) {
      const finLigne = s.indexOf('\n', i);
      if (finLigne === -1) {
        // marque coupée entre deux morceaux : on attend la suite
        if (i > 0) envoyer({ id: t.id, type: 'sortie', texte: s.slice(0, i) });
        t.reste = s.slice(i);
        return;
      }
      if (i > 0) envoyer({ id: t.id, type: 'sortie', texte: s.slice(0, i) });
      t.cwd = s.slice(i + MARQUE.length, finLigne).replace(/\r$/, '') || t.cwd;
      t.occupe = false;
      envoyer({ id: t.id, type: 'pret', cwd: t.cwd });
      s = s.slice(finLigne + 1);
    }
    // Un début possible de marque en fin de morceau reste en attente.
    const debut = s.lastIndexOf('\u0001');
    if (debut !== -1 && MARQUE.startsWith(s.slice(debut))) {
      t.reste = s.slice(debut);
      s = s.slice(0, debut);
    }
    if (s) envoyer({ id: t.id, type: 'sortie', texte: s });
  }

  function trouver(id) {
    const t = terminaux.get(Number(id));
    if (!t) throw new Error('Terminal introuvable.');
    return t;
  }

  return {
    async piloter(c) {
      if (!c || typeof c !== 'object') throw new Error('Commande illisible.');
      switch (c.action) {
        case 'ouvrir': {
          if (terminaux.size >= TERMINAUX_MAX)
            throw new Error(
              `${TERMINAUX_MAX} terminaux au plus. Fermez-en un pour en ouvrir un autre.`,
            );
          const t = { id: suivant++, cwd: dossierValide(c.cwd), p: null, occupe: false, reste: '' };
          terminaux.set(t.id, t);
          demarrer(t);
          return {
            id: t.id,
            cwd: t.cwd,
            shell: WINDOWS ? 'PowerShell' : path.basename(process.env.SHELL || 'bash'),
          };
        }
        case 'ecrire': {
          const t = trouver(c.id);
          const commande = String(c.commande ?? '').replace(/\r/g, '');
          if (commande.length > COMMANDE_MAX) throw new Error('Commande trop longue.');
          if (!t.p) demarrer(t);
          t.occupe = true;
          t.p.stdin.write(`${ligneCommande(commande)}\n${LIGNE_MARQUE}\n`);
          return { ok: true };
        }
        case 'arreter': {
          // Sans pseudo-terminal, Ctrl+C ne peut pas atteindre la commande : le shell repart dans le même dossier.
          const t = trouver(c.id);
          const ancien = t.p;
          t.p = null;
          tuer(ancien);
          envoyer({ id: t.id, type: 'sortie', texte: '^C\n' });
          demarrer(t);
          return { ok: true };
        }
        case 'fermer': {
          const t = terminaux.get(Number(c.id));
          if (t) {
            const p = t.p;
            t.p = null;
            tuer(p);
            terminaux.delete(t.id);
          }
          return { ok: true };
        }
        default:
          throw new Error('Action inconnue.');
      }
    },
    /** Fermeture de l'app : aucun shell ne reste derrière. */
    toutFermer() {
      for (const t of terminaux.values()) {
        const p = t.p;
        t.p = null;
        tuer(p);
      }
      terminaux.clear();
    },
  };
}

module.exports = { creerTerminaux };
