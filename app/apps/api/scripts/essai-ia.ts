/**
 * Essai réel des modèles d'IA sur une vraie conversation.
 *
 *   pnpm essai-ia chat.txt --moi="Damien"
 *   pnpm essai-ia chat.txt --moi="Damien" --verifier=mistral:7b
 *   pnpm essai-ia chat.txt --moi="Damien" --agent   (Agent Six : règles + corrections)
 *   pnpm essai-ia chat.txt --fournisseurs=ollama,groq --cloud-ok
 *
 * Plusieurs modèles Ollama : OLLAMA_MODEL=llama3.2:3b,mistral:7b dans apps/api/.env.
 * Les modèles tournent en même temps (option --sequentiel pour l'un après l'autre).
 * Rien n'est enregistré : tout s'affiche seulement dans le terminal.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGUAGES, TONES, type Language, type Tone } from '@six/shared';
import {
  generateReplies,
  ProviderError,
  type ProviderConfig,
  type ProviderResult,
} from '../src/ai/openai-compatible.js';
import { lastChars, PROMPT_VERSION, whoToAnswer, type ReplyRequest } from '../src/ai/prompt.js';
import {
  modelRef,
  PROVIDER_NAMES,
  providerConfigs,
  type ProviderName,
} from '../src/ai/providers.js';
import { VERIFIER_VERSION, verifyReplies } from '../src/ai/verifier.js';
import { AGENT_VERSION, runAgent, type AgentResult } from '../src/agent/agent.js';
import { createInterface } from 'node:readline/promises';
import {
  interlocutorKey,
  loadProfile,
  newOwnMessages,
  saveProfile,
} from '../src/agent/profile-store.js';
import { describeStyle, learnChoice, learnStyle } from '../src/agent/style.js';
import { authorsOf, isSelfAlias, parseThread, resolveMe } from '../src/agent/thread.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    fournisseurs: { type: 'string', default: PROVIDER_NAMES.join(',') },
    ton: { type: 'string', default: 'naturel' },
    langue: { type: 'string', default: 'fr' },
    objectif: { type: 'string' },
    moi: { type: 'string' },
    verifier: { type: 'string' },
    sequentiel: { type: 'boolean', default: false },
    agent: { type: 'boolean', default: false },
    'sans-apprentissage': { type: 'boolean', default: false },
    'cloud-ok': { type: 'boolean', default: false },
  },
});

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

const file = positionals[0];
if (!file) {
  stop(
    'Usage : pnpm essai-ia <conversation.txt> [--moi="Ton nom dans WhatsApp"] [--verifier=mistral:7b]\n' +
      '        [--fournisseurs=ollama,groq,gemini,mistral] [--ton=professionnel] [--langue=fr|en|ln]\n' +
      '        [--objectif="..."] [--agent] [--sequentiel] [--cloud-ok]',
  );
}
if (!(TONES as readonly string[]).includes(values.ton)) {
  stop(`Ton inconnu. Choix : ${TONES.join(', ')}`);
}
if (!(LANGUAGES as readonly string[]).includes(values.langue)) {
  stop(`Langue inconnue. Choix : ${LANGUAGES.join(', ')}`);
}

let conversation: string;
try {
  // pnpm lance le script depuis apps/api : on lit le chemin par rapport au dossier d'origine.
  conversation = readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8');
} catch {
  stop(`Impossible de lire « ${file} ».`);
}
if (conversation.trim().length === 0) stop('Le fichier est vide.');

const wanted = values.fournisseurs.split(',').map((name) => name.trim()) as ProviderName[];
const unknown = wanted.filter((name) => !PROVIDER_NAMES.includes(name));
if (unknown.length > 0) stop(`Fournisseur inconnu : ${unknown.join(', ')}`);

const out = (line = '') => process.stdout.write(`${line}\n`);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const describe = (error: unknown) =>
  error instanceof ProviderError ? `${error.kind} — ${error.message}` : String(error);

const request: ReplyRequest = {
  conversation,
  ton: values.ton as Tone,
  langue: values.langue as Language,
  ...(values.objectif ? { objectif: values.objectif } : {}),
  ...(values.moi ? { moi: values.moi } : {}),
};
const sent = lastChars(conversation);
const parsedThread = parseThread(conversation);
// L'utilisateur tel qu'il apparaît vraiment dans l'export (« Vous » chez WhatsApp).
const meAuthor = resolveMe(parsedThread, values.moi);
if (values.moi && !meAuthor) {
  stop(
    `« ${values.moi} » n'apparaît pas dans la conversation.\n` +
      `Participants trouvés : ${authorsOf(parsedThread).join(', ') || 'aucun'}.\n` +
      'Relance avec --moi="<ton nom tel qu’il apparaît ci-dessus>".',
  );
}
if (meAuthor && values.moi && meAuthor.toLowerCase() !== values.moi.trim().toLowerCase()) {
  out(
    `Note : dans cet export, tes messages sont signés « ${meAuthor} ». Je les traite comme les tiens.`,
  );
}
const interlocuteur = whoToAnswer(sent, values.moi);

out(
  `\nSix · essai réel · ${values.agent ? AGENT_VERSION : PROMPT_VERSION}${values.verifier ? ` + ${VERIFIER_VERSION}` : ''}`,
);
out(`Conversation : ${conversation.length} caractères, ${sent.length} envoyés (fin de l'échange)`);
out(
  `Ton : ${values.ton} · langue : ${values.langue}${values.objectif ? ` · objectif : ${values.objectif}` : ''}`,
);
out(
  `Réponse à : ${interlocuteur ?? 'inconnu (format non reconnu)'}` +
    (values.moi
      ? ` · au nom de : ${values.moi}`
      : ' · ajoute --moi="Ton nom" si ce n’est pas la bonne personne'),
);
out();

// 1. Quels modèles rédigent ?
const writers: ProviderConfig[] = [];
for (const name of wanted) {
  const configs = providerConfigs(name, process.env);
  if (configs.length === 0) {
    out(`— ${name} : ignoré (pas de clé dans apps/api/.env)`);
  } else if (configs[0]?.cloud && !values['cloud-ok']) {
    out(
      `— ${name} : ignoré. Offre gratuite = la conversation peut servir à entraîner leur modèle.` +
        ` Ajoute --cloud-ok si les personnes de la conversation sont d'accord.`,
    );
  } else {
    writers.push(...configs);
  }
}

// 2. Quel modèle vérifie ?
const verifier = values.verifier ? modelRef(values.verifier, process.env) : undefined;
if (values.verifier && !verifier) stop(`Vérificateur introuvable ou sans clé : ${values.verifier}`);
if (verifier?.cloud && !values['cloud-ok'])
  stop('Le vérificateur est en ligne : ajoute --cloud-ok.');

if (writers.length === 0) stop('Aucun modèle à essayer.');
out(
  `Rédacteurs : ${writers.map((w) => `${w.name} (${w.model})`).join(', ')}` +
    (writers.length > 1 ? (values.sequentiel ? ' · l’un après l’autre' : ' · en même temps') : ''),
);
if (verifier) out(`Vérificateur : ${verifier.name} (${verifier.model})`);
out();

const started = performance.now();

async function runAll<T>(tasks: (() => Promise<T>)[]): Promise<PromiseSettledResult<T>[]> {
  if (!values.sequentiel) return Promise.allSettled(tasks.map((task) => task()));
  const results: PromiseSettledResult<T>[] = [];
  for (const task of tasks) {
    try {
      results.push({ status: 'fulfilled', value: await task() });
    } catch (reason) {
      results.push({ status: 'rejected', reason });
    }
  }
  return results;
}

// 3. Rédaction (en parallèle par défaut).
// Apprentissage continu du style (agent + --moi) : seulement des chiffres, sur ce PC.
const learning = values.agent && values.moi && !values['sans-apprentissage'];
const stored = learning && values.moi ? loadProfile(values.moi) : undefined;
if (stored && values.moi) {
  const fresh = newOwnMessages(stored, parsedThread, meAuthor ?? values.moi, interlocuteur ?? '');
  stored.profil = learnStyle(stored.profil, fresh.messages);
  if (fresh.lastStamp && interlocuteur)
    stored.appris[interlocutorKey(interlocuteur)] = fresh.lastStamp;
  saveProfile(values.moi, stored);
  const description = describeStyle(stored.profil, isSelfAlias(values.moi) ? 'toi' : values.moi);
  out(
    `Style : ${fresh.messages.length} nouveau(x) message(s) ${isSelfAlias(values.moi) ? 'de toi' : `de ${values.moi}`} appris, ${stored.profil.messages} au total.` +
      (description
        ? `\n  ${description}`
        : ' Il en faut au moins 5 pour imiter ta façon d’écrire.'),
  );
  out();
}

const agentRuns = new Map<ProviderConfig, AgentResult>();
const drafts = await runAll(
  writers.map((writer) => async (): Promise<ProviderResult> => {
    if (!values.agent) return generateReplies(writer, request);
    const run = await runAgent(writer, request, stored ? { style: stored.profil } : {});
    agentRuns.set(writer, run);
    return {
      provider: writer.name,
      model: writer.model,
      latencyMs: run.latencyMs,
      suggestions: run.suggestions,
    };
  }),
);

// 4. Vérification de chaque jeu de brouillons réussi.
const succeeded = drafts
  .map((result, index) => ({ result, writer: writers[index] }))
  .filter(
    (entry): entry is { result: PromiseFulfilledResult<ProviderResult>; writer: ProviderConfig } =>
      entry.result.status === 'fulfilled',
  );
const checks = verifier
  ? await runAll(
      succeeded.map(
        ({ result }) =>
          () =>
            verifyReplies(verifier, request, result.value.suggestions),
      ),
    )
  : [];

// 5. Affichage.
drafts.forEach((result, index) => {
  const writer = writers[index];
  if (!writer) return;
  out(`▶ ${writer.name} (${writer.model})`);
  if (result.status === 'rejected') {
    out(`  ✖ échec : ${describe(result.reason)}`);
    if (
      result.reason instanceof ProviderError &&
      result.reason.kind === 'network' &&
      writer.name === 'ollama'
    ) {
      out('    Ollama est-il lancé ? Ouvre l’app Ollama ou tape « ollama serve ».');
    }
    if (result.reason instanceof ProviderError && result.reason.kind === 'model_missing') {
      out(`    Télécharge-le : ollama pull ${writer.model}`);
    }
    out();
    return;
  }
  const { suggestions, latencyMs } = result.value;
  const check = verifier
    ? checks[succeeded.findIndex((entry) => entry.writer === writer)]
    : undefined;
  out(`  Rédaction : ${seconds(latencyMs)}`);
  const run = agentRuns.get(writer);
  if (run?.reflexion) {
    const r = run.reflexion;
    const qui = (run.interlocuteur ?? 'la personne')
      .replace(/\p{Extended_Pictographic}|\uFE0F/gu, '')
      .trim();
    out('  Réflexion :');
    if (r.relation) out(`    · relation : ${r.relation}`);
    if (r.ressenti) out(`    · ce que ${qui} ressent : ${r.ressenti}`);
    if (r.demande) out(`    · ce que ${qui} demande : ${r.demande}`);
    if (r.non_dit) out(`    · ce que ${qui} attend sans le dire : ${r.non_dit}`);
    if (r.enjeu) out(`    · ce qui compte pour toi : ${r.enjeu}`);
    if (r.registre) out(`    · registre : ${r.registre === 'vous' ? 'vouvoiement' : 'tutoiement'}`);
  }
  if (run) {
    out(
      `  Agent : ${run.etapes.map((e) => `${e.etape} (${e.detail}${e.ms > 50 ? `, ${seconds(e.ms)}` : ''})`).join(' → ')}`,
    );
    out(
      `  Fautes rattrapées : ${run.problemesInitiaux - run.problemes.length} sur ${run.problemesInitiaux}` +
        (run.problemes.length
          ? ` · restantes : ${run.problemes.map((p) => `brouillon ${p.index + 1} ${p.message}`).join(' ; ')}`
          : ''),
    );
    if (run.bouclier)
      out('  🛡 Bouclier : arnaque certaine, l’agent répond seul (aucune IA, aucun risque).');
    if (run.scam.niveau !== 'aucun') {
      out(
        `  ⚠ Arnaque, risque ${run.scam.niveau === 'eleve' ? 'élevé' : run.scam.niveau} : ${run.scam.raisons.join(' ')}`,
      );
    }
  }
  out(`  Compris : ${suggestions.resume}`);
  suggestions.reponses.forEach((reponse, i) => {
    out(`  ${'ABC'[i]} · ${reponse.style} : ${reponse.texte}`);
    if (check?.status === 'fulfilled') {
      const verdict = check.value.verification.verdicts[i];
      if (verdict?.ok) out(`      ✔ validé — ${verdict.raison}`);
      else if (verdict) {
        out(`      ✖ refusé — ${verdict.raison}`);
        if (verdict.correction) out(`      ↳ corrigé : ${verdict.correction}`);
      }
    }
  });
  if (check?.status === 'fulfilled') {
    const refused = check.value.verification.verdicts.filter((v) => !v.ok).length;
    out(`  Vérification : ${seconds(check.value.latencyMs)} · ${3 - refused}/3 brouillons validés`);
  } else if (check?.status === 'rejected') {
    out(`  Vérification ✖ échec : ${describe(check.reason)}`);
  }
  out();
});

out(`Temps total : ${seconds(performance.now() - started)}`);

// Tes choix apprennent à Six quel type de réponse tu préfères (le style seulement, jamais le texte).
const onlyRun = writers.length === 1 ? agentRuns.get(writers[0] as ProviderConfig) : undefined;
if (stored && values.moi && onlyRun && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // Ctrl+C à la question : on quitte proprement, sans rien retenir.
  const controller = new AbortController();
  rl.on('SIGINT', () => controller.abort());
  let answer = '';
  try {
    answer = (
      await rl.question('\nQuel brouillon enverrais-tu ? (A, B, C, ou Entrée pour passer) ', {
        signal: controller.signal,
      })
    )
      .trim()
      .toUpperCase();
  } catch {
    out('\nPassé, rien retenu.');
  } finally {
    rl.close();
  }
  const chosen = onlyRun.suggestions.reponses['ABC'.indexOf(answer)];
  if (answer && chosen) {
    stored.profil = learnChoice(stored.profil, chosen.style);
    saveProfile(values.moi, stored);
    out(`Retenu : tu as choisi une réponse « ${chosen.style} ». Six s’en souviendra.`);
  }
}
