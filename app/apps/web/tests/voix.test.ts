import { describe, expect, it, vi } from 'vitest';
import {
  choisirVoix,
  bcp47,
  estPhraseFantome,
  passagesALire,
  texteALire,
  texteEssaiVoix,
  ecrirePreferencesVoix,
  lirePreferencesVoix,
  phrases,
  voixPourLangue,
} from '@/lib/voix';

const memoire = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memoire.get(k) ?? null,
  setItem: (k: string, v: string) => void memoire.set(k, v),
  removeItem: (k: string) => void memoire.delete(k),
});

const voix = (name: string, lang: string) =>
  ({ name, lang, voiceURI: name }) as unknown as SpeechSynthesisVoice;
const toutes = [
  voix('Microsoft Paul - French (France)', 'fr-FR'),
  voix('Microsoft Denise Online (Natural) - French (France)', 'fr-FR'),
  voix('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
];

describe('voix de Six', () => {
  it('lit la réponse phrase par phrase', () => {
    expect(phrases('Bonjour ! Je suis Six. Comment vas-tu ?')).toEqual([
      'Bonjour !',
      'Je suis Six.',
      'Comment vas-tu ?',
    ]);
    expect(phrases('Sans ponctuation finale')).toEqual(['Sans ponctuation finale']);
    expect(phrases('  ')).toEqual([]);
  });

  it('privilégie une voix naturelle sans changer de langue', () => {
    expect(voixPourLangue(toutes, 'fr')[0]?.name).toContain('Denise');
    expect(voixPourLangue(toutes, 'en').map((v) => v.lang)).toEqual(['en-US']);
    const p = {
      micro: '',
      voix: '',
      langue: 'ln' as const,
      vitesse: 1.05,
      declenchement: 'auto' as const,
    };
    expect(choisirVoix(toutes, p)).toBeUndefined();
    expect(
      choisirVoix(toutes, { ...p, langue: 'fr', voix: 'Microsoft Paul - French (France)' })?.name,
    ).toContain('Paul');
    expect(
      choisirVoix(toutes, { ...p, langue: 'de', voix: 'Microsoft Paul - French (France)' }),
    ).toBeUndefined();
  });

  it('choisit les voix et les exemples espagnols ou allemands', () => {
    const allemand = voix('Katja Natural', 'de-DE');
    const espagnol = voix('Elvira Natural', 'es-ES');
    const variantes = [voix('Alvaro Natural', 'es-MX'), allemand, espagnol, ...toutes];
    expect(bcp47('es')).toBe('es-ES');
    expect(bcp47('de')).toBe('de-DE');
    expect(voixPourLangue(variantes, 'es')[0]).toBe(espagnol);
    expect(voixPourLangue(variantes, 'de')).toEqual([allemand]);
    expect(texteEssaiVoix('es')).toContain('Hola');
    expect(texteEssaiVoix('de')).toContain('Hallo');
  });

  it('garde les préférences et ignore les valeurs inconnues', () => {
    expect(lirePreferencesVoix()).toMatchObject({ langue: 'fr', declenchement: 'auto' });
    ecrirePreferencesVoix({
      micro: '',
      voix: 'x',
      langue: 'en',
      vitesse: 1.2,
      declenchement: 'toucher',
    });
    expect(lirePreferencesVoix()).toEqual({
      micro: '',
      voix: 'x',
      langue: 'en',
      vitesse: 1.2,
      declenchement: 'toucher',
    });
    memoire.set('six-voix', JSON.stringify({ langue: 'xx', vitesse: 9, declenchement: '?' }));
    expect(lirePreferencesVoix()).toMatchObject({
      langue: 'fr',
      vitesse: 1.05,
      declenchement: 'auto',
    });
  });
});

describe('texte lu par Six', () => {
  it('retire symboles, liens, emojis et colle la ponctuation', () => {
    expect(texteALire('Salut ! 😊 Voici **un** lien : https://exemple.com « ok » ?')).toBe(
      'Salut! Voici un lien: ok?',
    );
  });

  it('regroupe les phrases en passages', () => {
    const p = passagesALire('Un. Deux. Trois.', 10);
    expect(p).toEqual(['Un. Deux.', 'Trois.']);
    expect(passagesALire('Une seule phrase courte.')).toEqual(['Une seule phrase courte.']);
  });

  it('reconnaît les phrases fantômes de Whisper', () => {
    expect(estPhraseFantome('Merci d’avoir regardé.'.replace('’', "'"))).toBe(true);
    expect(estPhraseFantome('Sous-titres réalisés par la communauté d’Amara.org')).toBe(true);
    expect(estPhraseFantome('you')).toBe(true);
    expect(estPhraseFantome('Merci pour ton aide, Six.')).toBe(false);
    expect(estPhraseFantome('Bonjour Six')).toBe(false);
  });
});
