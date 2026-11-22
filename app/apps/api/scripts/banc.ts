/**
 * Banc d'essai : le même modèle, seul puis encadré par l'Agent Six, sur un dossier de vraies
 * conversations. Mesure ce que l'agent change, chiffres à l'appui.
 *
 *   pnpm banc mes-conversations/ --moi="Damien"
 *   pnpm banc mes-conversations/ --moi="Damien" --modele=mistral:7b
 *
 * Nomme « arnaque-….txt » les conversations qui contiennent une arnaque : le banc vérifie
 * alors qu'elle est bien signalée. Rien n'est enregistré.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generateReplies, ProviderError } from '../src/ai/openai-compatible.js';
import type { ReplyRequest } from '../src/ai/prompt.js';
import { modelRef, providerFromEnv } from '../src/ai/providers.js';
import { AGENT_VERSION, runAgent } from '../src/agent/agent.js';
import { checkDrafts } from '../src/agent/check.js';
import { detectScam } from '../src/agent/scam.js';
import { parseThread } from '../src/agent/thread.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    moi: { type: 'string' },
    modele: { type: 'string' },
    'cloud-ok': { type: 'boolean', default: false },
  },
});

const out = (line = '') => process.stdout.write(`${line}\n`);
function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const folder = positionals[0];
if (!folder)
  stop('Usage : pnpm banc <dossier de conversations .txt> [--moi="Ton nom"] [--modele=mistral:7b]');
const dir = resolve(process.env.INIT_CWD ?? process.cwd(), folder);
if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory())
  stop(`Dossier introuvable : ${folder}`);
const files = readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.txt'))
  .sort();
if (files.length === 0) stop('Aucun fichier .txt dans ce dossier.');

const config = values.modele
  ? modelRef(values.modele, process.env)
  : providerFromEnv('ollama', process.env);
if (!config) stop('Modèle introuvable ou sans clé.');
if (config.cloud && !values['cloud-ok'])
  stop('Modèle en ligne : ajoute --cloud-ok (offre gratuite = données réutilisables).');

out(`\nBanc d'essai · ${config.name} (${config.model}) seul contre ${AGENT_VERSION}`);
out(`${files.length} conversation(s) · un essai à la fois\n`);

interface Score {
  utilisables: number; // brouillons sans aucun problème
  fautes: number;
  echecs: number; // pas de réponse exploitable
  arnaquesVues: number;
  arnaquesAttendues: number;
  /** Alerte moyenne ou élevée sur une conversation normale. */
  faussesAlertes: number;
  normales: number;
  ms: number;
}
const raw: Score = {
  utilisables: 0,
  fautes: 0,
  echecs: 0,
  arnaquesVues: 0,
  arnaquesAttendues: 0,
  faussesAlertes: 0,
  normales: 0,
  ms: 0,
};
const agent: Score = { ...raw };

for (const file of files) {
  const conversation = readFileSync(join(dir, file), 'utf8');
  const request: ReplyRequest = {
    conversation,
    ton: 'naturel',
    langue: 'fr',
    ...(values.moi ? { moi: values.moi } : {}),
  };
  const isScam = file.toLowerCase().startsWith('arnaque');
  if (isScam) {
    raw.arnaquesAttendues++;
    agent.arnaquesAttendues++;
  } else {
    raw.normales++;
    agent.normales++;
  }
  const source = parseThread(conversation)
    .slice(-8)
    .map((m) => m.text)
    .join('\n');

  // Modèle seul.
  let ligneBrut: string;
  try {
    const result = await generateReplies(config, request);
    const issues = checkDrafts(result.suggestions, { source, scam: detectScam([source]).niveau });
    const bad = new Set(issues.map((i) => i.index));
    raw.utilisables += 3 - bad.size;
    raw.fautes += issues.length;
    raw.ms += result.latencyMs;
    const rawAlert = /arnaque|escroquer|fraude|suspect/i.test(result.suggestions.resume);
    if (isScam && rawAlert) raw.arnaquesVues++;
    if (!isScam && rawAlert) raw.faussesAlertes++;
    ligneBrut =
      `${3 - bad.size}/3 utilisables, ${issues.length} faute(s), ${(result.latencyMs / 1000).toFixed(0)} s` +
      issues.map((i) => `\n      · brouillon ${i.index + 1} ${i.message}`).join('');
  } catch (error) {
    raw.echecs++;
    ligneBrut = `échec (${error instanceof ProviderError ? error.kind : 'erreur'})`;
  }

  // Modèle encadré par l'agent.
  const run = await runAgent(config, request);
  const bad = new Set(run.problemes.map((p) => p.index));
  // Les brouillons de secours ne comptent pas comme réussite du modèle.
  if (run.modeleEnEchec) agent.echecs++;
  else agent.utilisables += 3 - bad.size;
  agent.fautes += run.problemes.length;
  agent.ms += run.latencyMs;
  const agentAlert = run.scam.niveau === 'eleve' || run.scam.niveau === 'moyen';
  if (isScam && agentAlert) agent.arnaquesVues++;
  if (!isScam && agentAlert) agent.faussesAlertes++;
  const ligneAgent = run.bouclier
    ? `bouclier anti-arnaque : 3 réponses sûres sans IA, ${(run.latencyMs / 1000).toFixed(0)} s`
    : run.modeleEnEchec
      ? `modèle en échec, brouillons de secours fournis, ${(run.latencyMs / 1000).toFixed(0)} s`
      : `${3 - bad.size}/3 utilisables, ${run.problemes.length} faute(s), ${(run.latencyMs / 1000).toFixed(0)} s` +
        `${run.corrections ? `, ${run.corrections} correction(s)` : ''}${run.secours ? ', secours' : ''}` +
        run.problemes.map((i) => `\n      · brouillon ${i.index + 1} ${i.message}`).join('');

  const niveau = { aucun: 'aucun', faible: 'faible', moyen: 'moyen', eleve: 'élevé' }[
    run.scam.niveau
  ];
  out(`${file}${isScam ? ' (arnaque attendue)' : ''}`);
  out(
    `  arnaque selon l'agent : ${niveau}${run.scam.raisons.length ? ` — ${run.scam.raisons.join(' ')}` : ''}`,
  );
  out(`  seul  : ${ligneBrut}`);
  out(`  agent : ${ligneAgent}`);
}

const total = files.length * 3;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '—');
out('\nRésultat');
out(
  `  Brouillons utilisables  seul ${raw.utilisables}/${total} (${pct(raw.utilisables, total)})   agent ${agent.utilisables}/${total} (${pct(agent.utilisables, total)})`,
);
out(`  Fautes restantes        seul ${raw.fautes}   agent ${agent.fautes}`);
out(`  Réponses inexploitables seul ${raw.echecs}   agent ${agent.echecs}`);
if (raw.arnaquesAttendues) {
  out(
    `  Arnaques signalées      seul ${raw.arnaquesVues}/${raw.arnaquesAttendues}   agent ${agent.arnaquesVues}/${agent.arnaquesAttendues}`,
  );
}
if (raw.normales) {
  out(
    `  Fausses alertes         seul ${raw.faussesAlertes}/${raw.normales}   agent ${agent.faussesAlertes}/${agent.normales}`,
  );
}
out(
  `  Temps moyen             seul ${(raw.ms / files.length / 1000).toFixed(0)} s   agent ${(agent.ms / files.length / 1000).toFixed(0)} s`,
);
out(
  '\nLes fautes sont comptées par le même contrôleur pour les deux : relis aussi les brouillons toi-même.',
);
