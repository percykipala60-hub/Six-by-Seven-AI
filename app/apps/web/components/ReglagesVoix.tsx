'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import {
  LANGUES_VOIX,
  VITESSES,
  bcp47,
  chargerVoix,
  choisirVoix,
  ecrirePreferencesVoix,
  lirePreferencesVoix,
  listerMicros,
  voixPourLangue,
  type Declenchement,
  type LangueVoix,
  type PreferencesVoix,
} from '@/lib/voix';

/** Une rangée de réglage : titre et explication à gauche, choix à droite (comme les réglages de ChatGPT). */
function Rangee({ titre, sous, children }: { titre: string; sous?: string; children: ReactNode }) {
  return (
    <div className="voix-rangee">
      <div className="voix-rangee-texte">
        <span className="voix-rangee-titre">{titre}</span>
        {sous && <span className="voix-rangee-sous">{sous}</span>}
      </div>
      <div className="voix-rangee-choix">{children}</div>
    </div>
  );
}

/** Nom lisible d'une voix : « Microsoft Hortense - French (France) » → « Hortense ». */
const nomVoix = (v: SpeechSynthesisVoice) =>
  v.name
    .replace(/^(Microsoft|Google)\s+/, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s*\(.*\)$/, '');

/**
 * Réglages → Voix : micro, langue, voix de Six, vitesse et façon d'écouter. Rangées regroupées en deux parties,
 * chaque choix dans une liste déroulante.
 */
export function ReglagesVoix() {
  const [p, setP] = useState<PreferencesVoix | null>(null);
  const [voix, setVoix] = useState<SpeechSynthesisVoice[]>([]);
  const [micros, setMicros] = useState<MediaDeviceInfo[]>([]);

  const rafraichirMicros = useCallback(
    (demander = false) =>
      void listerMicros(demander)
        .then(setMicros)
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    setP(lirePreferencesVoix());
    void chargerVoix().then(setVoix);
    rafraichirMicros();
    // Un micro branché ou débranché : la liste se met à jour.
    const md = navigator.mediaDevices;
    const maj = () => rafraichirMicros();
    md?.addEventListener?.('devicechange', maj);
    return () => md?.removeEventListener?.('devicechange', maj);
  }, [rafraichirMicros]);

  if (!p) return null;
  const changer = (maj: Partial<PreferencesVoix>) => {
    const n = { ...p, ...maj };
    setP(n);
    ecrirePreferencesVoix(n);
  };
  const disponibles = voixPourLangue(voix, p.langue);
  const actuelle = choisirVoix(voix, p);
  const nomsCaches = micros.length > 0 && micros.every((m) => !m.label);

  const ecouter = (v = actuelle) => {
    const s = window.speechSynthesis;
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(
      p.langue === 'en'
        ? 'Hello, I am Six. How can I help you?'
        : 'Bonjour, je suis Six. Comment puis-je t’aider ?',
    );
    if (v) u.voice = v;
    u.lang = v?.lang ?? bcp47(p.langue);
    u.rate = p.vitesse;
    s.speak(u);
  };

  return (
    <div className="voix-reglages">
      <section className="voix-bloc">
        <h2 className="voix-bloc-titre">Général</h2>
        <Rangee titre="Microphone" sous="Utilisé pour la dictée et le mode vocal">
          <select
            className="select voix-select"
            value={p.micro}
            aria-label="Microphone"
            onFocus={() => nomsCaches && rafraichirMicros(true)}
            onChange={(e) => changer({ micro: e.target.value })}
          >
            <option value="">Par défaut du système</option>
            {micros.map((m, i) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Micro ${i + 1}`}
              </option>
            ))}
          </select>
        </Rangee>
        <Rangee titre="Langue" sous="La langue que vous parlez, ou laissez Six la reconnaître">
          <select
            className="select voix-select"
            value={p.langue}
            aria-label="Langue"
            onChange={(e) => changer({ langue: e.target.value as LangueVoix, voix: '' })}
          >
            {LANGUES_VOIX.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id === 'auto' ? 'Détection automatique' : l.nom}
              </option>
            ))}
          </select>
        </Rangee>
      </section>

      <section className="voix-bloc">
        <h2 className="voix-bloc-titre">Conversation vocale</h2>
        <Rangee titre="Voix" sous="La voix de Six pour lire ses réponses">
          <div className="voix-choix-ligne">
            <button
              type="button"
              className="voix-ecouter"
              aria-label="Écouter la voix"
              title="Écouter"
              onClick={() => ecouter()}
            >
              <Icon name="play" size={14} stroke={2} />
            </button>
            <select
              className="select voix-select"
              value={actuelle?.voiceURI ?? ''}
              aria-label="Voix de Six"
              onChange={(e) => {
                changer({ voix: e.target.value });
                ecouter(voix.find((v) => v.voiceURI === e.target.value));
              }}
            >
              {disponibles.length === 0 && <option value="">Voix de l’appareil</option>}
              {disponibles.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {nomVoix(v)}
                </option>
              ))}
            </select>
          </div>
        </Rangee>
        <Rangee titre="Vitesse de lecture">
          <select
            className="select voix-select"
            value={p.vitesse}
            aria-label="Vitesse de lecture"
            onChange={(e) => changer({ vitesse: Number(e.target.value) })}
          >
            {VITESSES.map((v) => (
              <option key={v.valeur} value={v.valeur}>
                {v.nom}
              </option>
            ))}
          </select>
        </Rangee>
        <Rangee
          titre="Quand Six écoute"
          sous="Dès que vous parlez (les bruits sont ignorés), ou après un toucher"
        >
          <select
            className="select voix-select"
            value={p.declenchement}
            aria-label="Quand Six écoute"
            onChange={(e) => changer({ declenchement: e.target.value as Declenchement })}
          >
            <option value="auto">Dès que vous parlez</option>
            <option value="toucher">En touchant les pétales</option>
          </select>
        </Rangee>
      </section>
    </div>
  );
}
