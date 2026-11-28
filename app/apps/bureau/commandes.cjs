'use strict';

/**
 * Terminal de Six (outil « executer_commande » de l'agent) : Six travaille par le code, comme Claude Code.
 * - PowerShell ou Python, lancés sur l'ordinateur de la personne, jamais sans son accord ;
 * - accord par programme (git, python, dir…) : refuser, une fois (jusqu'à la fermeture de l'app) ou toujours ;
 * - commandes dangereuses toujours refusées (formatage, suppression récursive d'un disque, registre, arrêt…) ;
 * - délai de 2 minutes, sortie limitée : le résultat repart vers l'agent et s'affiche dans les actions.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DELAI_MS = 120_000;
const SORTIE_MAX = 20_000;

/** Jamais exécutées, même avec accord. */
const INTERDITES = [
  /\bformat(-volume)?\b/i,
  /\bdiskpart\b/i,
  /\bbcdedit\b/i,
  /\bcipher\s+\/w/i,
  /\bshutdown\b|\bstop-computer\b|\brestart-computer\b/i,
  /\breg(\.exe)?\s+(delete|add)\b|\bremove-item\s+[^|;]*hk(lm|cu):/i,
  /\bset-executionpolicy\b/i,
  /\b(rm|del|rd|rmdir|remove-item)\b[^|;]*\s(-r\b|-recurse\b|\/s\b)[^|;]*\s[a-z]:\\?\s*($|[|;])/i,
  /\b(rm|remove-item)\s+-rf?\s+\/(\s|$)/i,
  /\b(iwr|irm|curl|wget|invoke-webrequest|invoke-restmethod)\b[^;]*\|\s*(iex|invoke-expression)\b/i,
  /\b(iex|invoke-expression)\s*\(?\s*(\(?\s*new-object|iwr|irm|invoke-webrequest|invoke-restmethod)/i,
  /\b(net\s+user|net\s+localgroup)\b[^|;]*\s\/add\b/i,
  /\bvssadmin\b[^|;]*delete\b/i,
];

/** Programme principal d'une commande (pour l'accord) : « git status » → « git ». */
function programmeDe(commande, langage) {
  if (langage === 'python') return 'python';
  const sansAppel = String(commande).trim().replace(/^&\s*/, '');
  const premier = sansAppel.split(/[\s|;&]+/)[0] || '';
  return premier
    .replace(/\.exe$/i, '')
    .toLowerCase()
    .slice(0, 60);
}

function interdite(commande) {
  return INTERDITES.some((r) => r.test(commande));
}

function creerCommandes(ctx) {
  const toujours = new Set();
  const uneFois = new Set();
  try {
    const d = JSON.parse(fs.readFileSync(ctx.stockage || '', 'utf8'));
    for (const p of Array.isArray(d.programmes) ? d.programmes : [])
      if (typeof p === 'string') toujours.add(p);
  } catch {
    /* pas encore d'accord permanent */
  }
  const garder = () => {
    if (!ctx.stockage) return;
    try {
      fs.writeFileSync(ctx.stockage, JSON.stringify({ programmes: [...toujours] }));
    } catch {
      /* valables jusqu'à la fermeture */
    }
  };

  async function exigerAccord(programme, commande) {
    if (toujours.has(programme) || uneFois.has(programme)) return;
    const r = await ctx.demander({
      titre: `Autoriser Six à lancer « ${programme} » ?`,
      texte: `Commande :\n${commande.slice(0, 600)}`,
    });
    if (r === 'toujours') {
      toujours.add(programme);
      garder();
    } else if (r === 'une-fois') uneFois.add(programme);
    else throw new Error(`La personne a refusé que Six lance « ${programme} ».`);
  }

  /** Lance la commande et renvoie { code, sortie, erreurs, duree_ms } (texte coupé si trop long). */
  function lancer(commande, langage, dossier) {
    return new Promise((resoudre) => {
      let fichier = '';
      let exe;
      let args;
      if (langage === 'python') {
        fichier = path.join(os.tmpdir(), `six-${process.pid}-${Date.now()}.py`);
        fs.writeFileSync(fichier, commande, 'utf8');
        exe = process.platform === 'win32' ? 'python' : 'python3';
        args = ['-I', fichier];
      } else if (process.platform === 'win32') {
        exe = 'powershell.exe';
        args = ['-NoProfile', '-NonInteractive', '-Command', commande];
      } else {
        exe = '/bin/sh';
        args = ['-c', commande];
      }
      const debut = Date.now();
      let sortie = '';
      let erreurs = '';
      let fini = false;
      const enfant = spawn(exe, args, {
        cwd: dossier && fs.existsSync(dossier) ? dossier : os.homedir(),
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      const terminer = (code) => {
        if (fini) return;
        fini = true;
        clearTimeout(minuterie);
        if (fichier) fs.rm(fichier, { force: true }, () => {});
        const couper = (t) => (t.length > SORTIE_MAX ? t.slice(0, SORTIE_MAX) + '\n… (coupé)' : t);
        resoudre({
          code,
          sortie: couper(sortie),
          erreurs: couper(erreurs),
          duree_ms: Date.now() - debut,
        });
      };
      const minuterie = setTimeout(() => {
        erreurs += `\nArrêtée après ${DELAI_MS / 1000} s (délai dépassé).`;
        enfant.kill();
        terminer(null);
      }, DELAI_MS);
      enfant.stdout.on('data', (b) => {
        if (sortie.length <= SORTIE_MAX) sortie += b.toString('utf8');
      });
      enfant.stderr.on('data', (b) => {
        if (erreurs.length <= SORTIE_MAX) erreurs += b.toString('utf8');
      });
      enfant.on('error', (e) => {
        erreurs += e.message;
        terminer(null);
      });
      enfant.on('close', (code) => terminer(code));
    });
  }

  async function executer(c) {
    const commande = typeof c.commande === 'string' ? c.commande.trim() : '';
    const langage = c.langage === 'python' ? 'python' : 'powershell';
    if (!commande) throw new Error('Commande vide.');
    if (commande.length > 20_000) throw new Error('Commande trop longue.');
    if (interdite(commande))
      throw new Error(
        'Commande refusée : elle pourrait abîmer l’ordinateur (formatage, suppression de disque, registre, arrêt…). Demande à la personne de la lancer elle-même si elle y tient.',
      );
    const programme = programmeDe(commande, langage);
    await exigerAccord(programme, commande);
    return lancer(commande, langage, typeof c.dossier === 'string' ? c.dossier : '');
  }

  /** Rappel à l'ordre (arrêt d'urgence) : tous les accords sont retirés. */
  function oublier() {
    toujours.clear();
    uneFois.clear();
    garder();
  }

  return { executer, oublier, programmes: () => [...toujours] };
}

module.exports = { creerCommandes, programmeDe, interdite };
