'use client';

import { useEffect, useState } from 'react';
import { Groupe, Ligne, LigneChoix, LigneInfo } from './Liste';
import {
  LANGUES_VOIX,
  VITESSES,
  bcp47,
  chargerVoix,
  choisirVoix,
  ecrirePreferencesVoix,
  lirePreferencesVoix,
  voixPourLangue,
  type PreferencesVoix,
} from '@/lib/voix';

/**
 * Réglages → Voix : le mode vocal de Six. La voix (parmi celles de l'appareil, les plus naturelles d'abord),
 * la langue de la dictée et de la lecture, la vitesse, et comment Six commence à écouter.
 */
export function ReglagesVoix() {
  const [p, setP] = useState<PreferencesVoix | null>(null);
  const [toutes, setToutes] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setP(lirePreferencesVoix());
    void chargerVoix().then(setToutes);
  }, []);

  if (!p) return null;
  const changer = (maj: Partial<PreferencesVoix>) => {
    const n = { ...p, ...maj };
    setP(n);
    ecrirePreferencesVoix(n);
  };
  const disponibles = voixPourLangue(toutes, p.langue);
  const actuelle = choisirVoix(toutes, p);

  const ecouter = (voix?: SpeechSynthesisVoice) => {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(
      p.langue === 'en'
        ? 'Hello, I am Six. How can I help you?'
        : 'Bonjour, je suis Six. Comment puis-je t’aider ?',
    );
    const v = voix ?? actuelle;
    if (v) u.voice = v;
    u.lang = v?.lang ?? bcp47(p.langue);
    u.rate = p.vitesse;
    s.speak(u);
  };

  return (
    <>
      <Groupe
        titre="Voix de Six"
        pied="Les voix viennent de cet appareil. Les plus naturelles sont en tête de liste."
      >
        {disponibles.length === 0 ? (
          <LigneInfo icon="mic" label="Voix de l’appareil" sous="Choisie automatiquement" />
        ) : (
          <div role="radiogroup" aria-label="Voix de Six">
            {disponibles.map((v) => (
              <LigneChoix
                key={v.voiceURI}
                choisi={actuelle?.voiceURI === v.voiceURI}
                label={v.name.replace(/^Microsoft\s+|\s+-\s+.*$/g, '')}
                sous={v.lang}
                onClick={() => {
                  changer({ voix: v.voiceURI });
                  ecouter(v);
                }}
              />
            ))}
          </div>
        )}
        <Ligne icon="play" label="Écouter la voix" onClick={() => ecouter()} />
      </Groupe>

      <Groupe
        titre="Langue"
        pied="La langue dans laquelle vous parlez à Six et dans laquelle il vous lit ses réponses."
      >
        <div role="radiogroup" aria-label="Langue">
          {LANGUES_VOIX.map((l) => (
            <LigneChoix
              key={l.id}
              choisi={p.langue === l.id}
              label={l.nom}
              sous={l.id === 'auto' ? 'Six reconnaît la langue que vous parlez' : undefined}
              onClick={() => changer({ langue: l.id, voix: '' })}
            />
          ))}
        </div>
      </Groupe>

      <Groupe titre="Vitesse de lecture">
        <div role="radiogroup" aria-label="Vitesse de lecture">
          {VITESSES.map((v) => (
            <LigneChoix
              key={v.valeur}
              choisi={p.vitesse === v.valeur}
              label={v.nom}
              onClick={() => changer({ vitesse: v.valeur })}
            />
          ))}
        </div>
      </Groupe>

      <Groupe titre="Quand Six écoute">
        <div role="radiogroup" aria-label="Quand Six écoute">
          <LigneChoix
            choisi={p.declenchement === 'auto'}
            label="Dès que vous parlez"
            sous="Six détecte votre voix et ignore les bruits"
            onClick={() => changer({ declenchement: 'auto' })}
          />
          <LigneChoix
            choisi={p.declenchement === 'toucher'}
            label="Quand vous touchez la sphère"
            sous="Six écoute seulement après un toucher"
            onClick={() => changer({ declenchement: 'toucher' })}
          />
        </div>
      </Groupe>
    </>
  );
}
