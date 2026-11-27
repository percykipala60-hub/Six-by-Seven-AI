'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { Logo } from './Logo';
import { plateforme } from '@/lib/plateforme';
import { audioMicro } from '@/lib/voix';

export type PhaseVoix = 'attente' | 'ecoute' | 'reflechit' | 'parle';

const LIBELLES: Record<PhaseVoix, string> = {
  attente: 'Touchez la sphère pour parler',
  ecoute: 'Je vous écoute…',
  reflechit: 'Six réfléchit…',
  parle: 'Six vous répond…',
};

/**
 * Mode vocal : à la place de la discussion, six pétales lumineux en hexagone autour du logo de Six (le chiffre six),
 * qui réagissent à la voix.
 * - Pendant l'écoute, elle suit le volume du micro (Web Audio, rien n'est enregistré ni envoyé) ;
 * - pendant la réflexion, elle respire lentement ; pendant la réponse de Six, elle ondule.
 * Sur iPhone et Android, la dictée native garde le micro pour elle : la sphère s'anime alors sans mesure.
 */
export function VoixOrbe({
  phase,
  onTerminer,
  onToucher,
}: {
  phase: PhaseVoix;
  onTerminer: () => void;
  onToucher: () => void;
}) {
  const orbe = useRef<HTMLButtonElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    let arret = false;
    let flux: MediaStream | null = null;
    let contexte: AudioContext | null = null;
    let image = 0;
    let lisse = 0;

    const dessiner = (analyseur: AnalyserNode | null, donnees: Uint8Array | null) => {
      if (arret) return;
      let niveau: number;
      const t = performance.now() / 1000;
      if (phaseRef.current === 'ecoute' && analyseur && donnees) {
        analyseur.getByteTimeDomainData(donnees);
        let somme = 0;
        for (const v of donnees) somme += ((v - 128) / 128) ** 2;
        niveau = Math.min(1, Math.sqrt(somme / donnees.length) * 4.5);
      } else if (phaseRef.current === 'parle') {
        niveau = 0.35 + 0.25 * Math.sin(t * 7) * Math.sin(t * 2.3);
      } else if (phaseRef.current === 'ecoute') {
        niveau = 0.15 + 0.1 * Math.sin(t * 3);
      } else {
        niveau = 0.08 + 0.06 * Math.sin(t * 1.6);
      }
      lisse += (niveau - lisse) * 0.2;
      orbe.current?.style.setProperty('--niveau', lisse.toFixed(3));
      image = requestAnimationFrame(() => dessiner(analyseur, donnees));
    };

    void (async () => {
      const p = await plateforme();
      if (p === 'ios' || p === 'android' || !navigator.mediaDevices?.getUserMedia) {
        dessiner(null, null);
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({ audio: audioMicro() });
        if (arret) return;
        contexte = new AudioContext();
        const analyseur = contexte.createAnalyser();
        analyseur.fftSize = 512;
        contexte.createMediaStreamSource(flux).connect(analyseur);
        dessiner(analyseur, new Uint8Array(analyseur.fftSize));
      } catch {
        dessiner(null, null);
      }
    })();

    return () => {
      arret = true;
      cancelAnimationFrame(image);
      flux?.getTracks().forEach((piste) => piste.stop());
      void contexte?.close();
    };
  }, []);

  return (
    <div className="voix-scene" role="status" aria-live="polite">
      <button
        type="button"
        ref={orbe}
        className={`voix-orbe ${phase}`}
        aria-label={phase === 'attente' ? 'Parler à Six' : LIBELLES[phase]}
        disabled={phase !== 'attente'}
        onClick={onToucher}
      >
        <span className="voix-halo" />
        {/* Six pétales, en hexagone : le chiffre de Six. Ils s'écartent avec la voix. */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="voix-petale" style={{ '--i': i } as CSSProperties} />
        ))}
        <span className="voix-centre">
          <Logo label="" />
        </span>
      </button>
      <p className="voix-libelle">{LIBELLES[phase]}</p>
      <button type="button" className="voix-terminer" onClick={onTerminer}>
        Terminer
      </button>
    </div>
  );
}
