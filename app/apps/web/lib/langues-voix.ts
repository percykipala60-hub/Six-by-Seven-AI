export const LANGUES_VOIX = [
  {
    id: 'fr',
    nom: 'Français',
    bcp47: 'fr-FR',
    essai: 'Bonjour, je suis Six. Comment puis-je t’aider ?',
  },
  { id: 'en', nom: 'Anglais', bcp47: 'en-US', essai: 'Hello, I am Six. How can I help you?' },
  { id: 'es', nom: 'Espagnol', bcp47: 'es-ES', essai: 'Hola, soy Six. ¿En qué puedo ayudarte?' },
  {
    id: 'de',
    nom: 'Allemand',
    bcp47: 'de-DE',
    essai: 'Hallo, ich bin Six. Wie kann ich dir helfen?',
  },
  { id: 'zh', nom: 'Mandarin', bcp47: 'zh-CN', essai: '你好，我是 Six。有什么可以帮你的吗？' },
  {
    id: 'ln',
    nom: 'Lingala',
    bcp47: 'ln-CD',
    essai: 'Mbote, nazali Six. Nakoki kosalisa yo ndenge nini?',
  },
  {
    id: 'sw',
    nom: 'Swahili',
    bcp47: 'sw-KE',
    essai: 'Habari, mimi ni Six. Ninaweza kukusaidiaje?',
  },
  { id: 'auto', nom: 'Détection automatique', bcp47: 'fr-FR', essai: '' },
] as const;

export type LangueVoix = (typeof LANGUES_VOIX)[number]['id'];

export function estLangueVoix(valeur: unknown): valeur is LangueVoix {
  return LANGUES_VOIX.some(({ id }) => id === valeur);
}
