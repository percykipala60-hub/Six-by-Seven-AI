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
  return texte
    .replace(DENEGATION, (m: string, avant: string) => {
      // Phrase entière retirée : on garde la fin de la phrase précédente. Proposition retirée (« , et je ne suis pas… ») :
      // on garde la ponctuation qui terminait la phrase.
      if (/[.;!?]/.test(avant)) return `${avant.trim()} `;
      return /[.;!?]$/.test(m) ? m.slice(-1) : '';
    })
    .replace(/,\s*([.;!?])/g, '$1')
    .replace(/\s+([.;,!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_m, a: string, l: string) => a + l.toUpperCase())
    .trim();
}
