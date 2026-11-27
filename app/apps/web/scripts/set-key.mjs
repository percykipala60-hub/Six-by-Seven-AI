// Enregistre une clé d'API dans .env.local sans jamais l'afficher ni la mettre dans l'historique du terminal.
// Usage : npm run set-key            (te demande le service puis la clé, saisie masquée)
//         npm run set-key -- openai  (pour ChatGPT)
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';

const root = join(import.meta.dirname, '..');
const FICHIER = process.env.ENV_FILE || join(root, '.env.local');
const SERVICES = {
  claude: { variable: 'ANTHROPIC_API_KEY', nom: 'Claude (Anthropic)', debut: 'sk-ant-' },
  openai: { variable: 'OPENAI_API_KEY', nom: 'ChatGPT (OpenAI)', debut: 'sk-' },
  openrouter: { variable: 'OPENROUTER_API_KEY', nom: 'OpenRouter', debut: 'sk-or-' },
};

const SAUT = String.fromCharCode(10);
const RETOUR = String.fromCharCode(13);
const FIN_SAISIE = String.fromCharCode(4);
const ANNULER = String.fromCharCode(3);
const EFFACER = String.fromCharCode(127);
const RETOUR_ARRIERE = String.fromCharCode(8);

let lignesTube = null; // entrée non interactive : toutes les lignes lues d'un coup

function question(texte, { masque = false } = {}) {
  return new Promise((resolve) => {
    const input = process.stdin;
    process.stdout.write(texte);

    if (!input.isTTY) {
      if (lignesTube === null) {
        try {
          lignesTube = readFileSync(0, 'utf8').split(/\r?\n/);
        } catch {
          lignesTube = [];
        }
      }
      process.stdout.write(SAUT);
      resolve((lignesTube.shift() ?? '').trim());
      return;
    }

    if (!masque) {
      const rl = readline.createInterface({ input, output: process.stdout });
      rl.question('', (reponse) => {
        rl.close();
        resolve(reponse.trim());
      });
      return;
    }

    // Saisie masquée : aucun caractère n'est écrit à l'écran.
    let saisie = '';
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const fin = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write(SAUT);
    };
    const onData = (morceau) => {
      for (const c of morceau) {
        if (c === RETOUR || c === SAUT || c === FIN_SAISIE) {
          fin();
          resolve(saisie.trim());
          return;
        }
        if (c === ANNULER) {
          fin();
          process.exit(130);
        }
        if (c === EFFACER || c === RETOUR_ARRIERE) saisie = saisie.slice(0, -1);
        else if (c.charCodeAt(0) >= 32) saisie += c; // ignore Ctrl+V et autres touches de contrôle
      }
    };
    input.on('data', onData);
  });
}

let choix = (process.argv[2] || '').toLowerCase();
if (!SERVICES[choix]) {
  choix =
    (await question('Service (claude, openai ou openrouter) [claude] : ')).toLowerCase() ||
    'claude';
}
const service = SERVICES[choix];
if (!service) {
  console.error('Service inconnu : choisis claude, openai ou openrouter.');
  process.exit(1);
}

const cle = await question(`Colle ta clé ${service.nom} (rien ne s'affiche) puis Entrée : `, {
  masque: true,
});
if (!cle) {
  console.error("Aucune clé saisie. Rien n'a été modifié.");
  process.exit(1);
}
if (/\s/.test(cle) || cle.length < 20) {
  console.error(
    `Cette clé semble incomplète (${cle.length} caractères reçus, espaces ou trop courte). Rien n'a été modifié.`,
  );
  process.exit(1);
}
if (!cle.startsWith(service.debut)) {
  console.warn(
    `Attention : une clé ${service.nom} commence en général par « ${service.debut} ». Je l'enregistre quand même.`,
  );
}

if (!existsSync(FICHIER)) {
  const modele = join(root, '.env.example');
  if (existsSync(modele)) copyFileSync(modele, FICHIER);
  else writeFileSync(FICHIER, '');
}
const lignes = readFileSync(FICHIER, 'utf8').split(/\r?\n/);
const motif = new RegExp('^\\s*' + service.variable + '\\s*=');
const i = lignes.findIndex((l) => motif.test(l));
if (i >= 0) lignes[i] = service.variable + '=' + cle;
else lignes.push(service.variable + '=' + cle);
writeFileSync(FICHIER, lignes.join(SAUT).replace(/\n*$/, SAUT));

console.log(
  `Clé ${service.nom} enregistrée dans ${FICHIER.replace(root, '.')} (${cle.length} caractères, non affichée).`,
);
console.log('Étape suivante : npm run check-ai, puis redémarre le serveur (npm run dev).');
