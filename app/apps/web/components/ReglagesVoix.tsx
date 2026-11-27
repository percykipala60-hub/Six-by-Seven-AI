'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { lireAvecElevenLabs } from '@/lib/lecture-elevenlabs';
import { trouverVoixElevenLabs, VOIX_ELEVENLABS } from '@/lib/voix-elevenlabs';
import {
  LANGUES_VOIX,
  VITESSES,
  bcp47,
  chargerVoix,
  choisirVoix,
  ecrirePreferencesVoix,
  lirePreferencesVoix,
  listerMicros,
  texteEssaiVoix,
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
  const [erreurVoix, setErreurVoix] = useState('');
  const [elevenlabs, setElevenLabs] = useState(false);
  const apercu = useRef<AbortController | null>(null);

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
  useEffect(() => {
    const ctl = new AbortController();
    void fetch('/api/chat/voix', { signal: ctl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ctl.signal.aborted) setElevenLabs(data?.elevenlabs === true);
      })
      .catch(() => {});
    return () => {
      ctl.abort();
      apercu.current?.abort();
    };
  }, []);

  if (!p) return null;
  const changer = (maj: Partial<PreferencesVoix>) => {
    apercu.current?.abort();
    const n = { ...p, ...maj };
    setP(n);
    ecrirePreferencesVoix(n);
    setErreurVoix('');
  };
  const disponibles = voixPourLangue(voix, p.langue);
  const voixDistantes = elevenlabs ? VOIX_ELEVENLABS.filter((v) => v.langue === p.langue) : [];
  const selection =
    voixDistantes.some((v) => v.selection === p.voix) ||
    disponibles.some((v) => v.voiceURI === p.voix)
      ? p.voix
      : '';
  const nomsCaches = micros.length > 0 && micros.every((m) => !m.label);

  const ecouter = (choix = p.voix) => {
    apercu.current?.abort();
    const s = window.speechSynthesis;
    s?.cancel();
    setErreurVoix('');
    const distante = trouverVoixElevenLabs(choix);
    if (distante) {
      const ctl = new AbortController();
      apercu.current = ctl;
      void lireAvecElevenLabs(texteEssaiVoix(distante.langue), choix, p.vitesse, ctl.signal)
        .catch((e) => {
          if (!ctl.signal.aborted)
            setErreurVoix(e instanceof Error ? e.message : 'Aperçu indisponible.');
        })
        .finally(() => {
          if (apercu.current === ctl) apercu.current = null;
        });
      return;
    }
    if (!s || typeof SpeechSynthesisUtterance === 'undefined') {
      setErreurVoix('La lecture vocale est indisponible sur cet appareil.');
      return;
    }
    const v = choisirVoix(voix, { ...p, voix: choix });
    const u = new SpeechSynthesisUtterance(texteEssaiVoix(p.langue));
    if (v) u.voice = v;
    u.lang = v?.lang ?? bcp47(p.langue);
    u.rate = p.vitesse;
    u.onerror = ({ error }) => {
      if (error === 'canceled' || error === 'interrupted') return;
      setErreurVoix(
        'Impossible de lire dans cette langue. Vérifiez les voix installées sur votre appareil.',
      );
    };
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
        <Rangee titre="Langue" sous="Dictée et lecture des réponses">
          <select
            className="select voix-select"
            value={p.langue}
            aria-label="Langue"
            onChange={(e) => {
              // La voix suit la langue : la voix de Six prévue pour cette langue, sinon celle de l'appareil.
              const langue = e.target.value as LangueVoix;
              const prevue = elevenlabs
                ? VOIX_ELEVENLABS.find((v) => v.langue === langue)
                : undefined;
              changer({ langue, voix: prevue?.selection ?? '' });
            }}
          >
            {LANGUES_VOIX.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
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
              value={selection}
              aria-label="Voix de Six"
              onChange={(e) => {
                changer({ voix: e.target.value });
                if (!trouverVoixElevenLabs(e.target.value)) ecouter(e.target.value);
              }}
            >
              <option value="">Automatique (appareil)</option>
              {voixDistantes.map((v) => (
                <option key={v.selection} value={v.selection}>
                  {v.nom}
                </option>
              ))}
              {disponibles.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {nomVoix(v)}
                </option>
              ))}
            </select>
          </div>
          {trouverVoixElevenLabs(selection) && (
            <p className="muted small">Le texte lu est envoyé à ElevenLabs pour générer l’audio.</p>
          )}
          {erreurVoix && (
            <p role="status" className="muted small">
              {erreurVoix}
            </p>
          )}
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
