import { ENTREPRISE } from './marque';

const QUESTION_CREATEUR =
  /^\s*(?:qui\s+(?:t['’]\s*a|vous\s+a)\s+(?:cr[ée][ée]e?|d[ée]velopp[ée]e?|con[çc]u[e]?)|qui\s+a\s+(?:cr[ée][ée]|d[ée]velopp[ée]|con[çc]u)\s+six|who\s+(?:created|built|developed)\s+(?:you|six))\s*[?!.]*\s*$/iu;

export function reponseCreateur(question: string): string | undefined {
  if (!QUESTION_CREATEUR.test(question)) return;
  if (/^\s*who\b/i.test(question)) return `I'm Six, an assistant developed by ${ENTREPRISE}.`;
  return `Je suis Six, un assistant développé par ${ENTREPRISE}.`;
}

/**
 * Identité de Six dans ses réponses. Six est développé par Seven.AI à partir de modèles d'IA existants : il ne doit ni
 * se faire passer pour un autre assistant, ni affirmer à tort qu'il n'est pas construit sur tel modèle. Un petit modèle
 * local écrit pourtant souvent « je ne suis pas Qwen… » quand on le lui demande, malgré la consigne : on retire ces
 * dénégations (fausses) de la réponse, sans rien inventer à la place.
 */

const MODELES =
  'qwen|chatgpt|gpt(?:-?\\d[\\w.-]*)?|openai|claude|anthropic|llama|meta|mistral|gemini|bard|deepseek|gemma|phi';

const DENEGATION = new RegExp(
  // « Je ne suis pas Qwen, ni un autre assistant. » / « Je ne suis ni Qwen ni ChatGPT ; » / « (et) je ne suis pas basé sur Llama »
  // Un point collé à un mot (« Seven.AI ») n'est pas une fin de phrase : seul un point suivi d'un espace (ou en fin
  // de texte) termine la dénégation.
  `(^|[.;!?]\\s+|,\\s*|\\s+et\\s+)je\\s+ne\\s+suis\\s+(?:pas|ni)\\s+(?:bas[ée]\\s+sur\\s+|construit\\s+sur\\s+|un\\s+mod[eè]le\\s+)?(?:${MODELES})\\b(?:[^.;!?\\n]|[.](?=\\S))*(?:[.;!?](?=\\s|$))?`,
  'gi',
);

export function corrigerIdentite(texte: string): string {
  const attribution = texte.replace(
    /((?:^|[.!?]\s+)je suis six\b[^.!?\n]{0,100}?\b(?:cr[ée][ée]e?|d[ée]velopp[ée]e?|con[çc]u[e]?) par )anthropic\b/gi,
    (_m, debut: string) => debut + ENTREPRISE,
  );
  let retrait = false;
  const corrige = attribution.replace(DENEGATION, (m: string, avant: string) => {
    retrait = true;
    // Phrase entière retirée : on garde la fin de la phrase précédente. Proposition retirée (« , et je ne suis pas… ») :
    // on garde la ponctuation qui terminait la phrase.
    if (/[.;!?]/.test(avant)) return `${avant.trim()} `;
    return /[.;!?]$/.test(m) ? m.slice(-1) : '';
  });
  if (!retrait) return corrige;
  return corrige
    .replace(/,\s*([.;!?])/g, '$1')
    .replace(/\s+([.;,!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_m, a: string, l: string) => a + l.toUpperCase())
    .trim();
}
