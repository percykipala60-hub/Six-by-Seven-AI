import type { LangueVoix } from './langues-voix';

export const VOIX_ELEVENLABS = [
  { selection: 'elevenlabs:dayn', nom: 'Dayn', langue: 'fr', id: '0urUwl228d9ErGGqBQAR' },
  { selection: 'elevenlabs:antonio', nom: 'Antonio', langue: 'es', id: 'htFfPSZGJwjBv1CL0aMD' },
  { selection: 'elevenlabs:ava', nom: 'Ava', langue: 'de', id: 'AnvlJBAqSLDzEevYr9Ap' },
  { selection: 'elevenlabs:evan', nom: 'Evan Zhao', langue: 'zh', id: 'MI36FIkp9wRP7cpWKPTl' },
] as const satisfies readonly { selection: string; nom: string; langue: LangueVoix; id: string }[];

export function trouverVoixElevenLabs(selection: unknown) {
  return VOIX_ELEVENLABS.find((voix) => voix.selection === selection);
}
