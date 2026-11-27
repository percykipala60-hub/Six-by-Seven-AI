import type { LangueVoix } from './langues-voix';

/**
 * Voix ElevenLabs proposées dans Réglages → Voix, une par langue au moins. Le lingala et le swahili ne sont lus que
 * par le modèle eleven_v3 ; les autres langues gardent eleven_multilingual_v2.
 */
export type ModeleElevenLabs = 'eleven_multilingual_v2' | 'eleven_v3';

export const VOIX_ELEVENLABS = [
  {
    selection: 'elevenlabs:dayn',
    nom: 'Dayn',
    langue: 'fr',
    id: '0urUwl228d9ErGGqBQAR',
    modele: 'eleven_multilingual_v2',
  },
  {
    selection: 'elevenlabs:sarah',
    nom: 'Sarah',
    langue: 'en',
    id: 'EXAVITQu4vr4xnSDxMaL',
    modele: 'eleven_multilingual_v2',
  },
  {
    selection: 'elevenlabs:antonio',
    nom: 'Antonio',
    langue: 'es',
    id: 'htFfPSZGJwjBv1CL0aMD',
    modele: 'eleven_multilingual_v2',
  },
  {
    selection: 'elevenlabs:ava',
    nom: 'Ava',
    langue: 'de',
    id: 'AnvlJBAqSLDzEevYr9Ap',
    modele: 'eleven_multilingual_v2',
  },
  {
    selection: 'elevenlabs:evan',
    nom: 'Evan Zhao',
    langue: 'zh',
    id: 'MI36FIkp9wRP7cpWKPTl',
    modele: 'eleven_multilingual_v2',
  },
  {
    selection: 'elevenlabs:brian-ln',
    nom: 'Brian',
    langue: 'ln',
    id: 'nPczCjzI2devNBz1zQrb',
    modele: 'eleven_v3',
  },
  {
    selection: 'elevenlabs:matilda-sw',
    nom: 'Matilda',
    langue: 'sw',
    id: 'XrExE9yKIg1WjnnlVkGX',
    modele: 'eleven_v3',
  },
] as const satisfies readonly {
  selection: string;
  nom: string;
  langue: LangueVoix;
  id: string;
  modele: ModeleElevenLabs;
}[];

export function trouverVoixElevenLabs(selection: unknown) {
  return VOIX_ELEVENLABS.find((voix) => voix.selection === selection);
}
