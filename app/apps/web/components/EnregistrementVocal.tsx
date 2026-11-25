'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const BARRES = 56;

/**
 * Pendant un message vocal, la barre de saisie devient une barre d'enregistrement (comme WhatsApp) :
 * « Arrêter » (l'audio est effacé, rien ne part), l'onde de la voix en direct et le temps écoulé, puis « Envoyer »
 * (l'audio part au transcripteur, et le texte s'envoie à Six).
 */
export function EnregistrementVocal({
  flux,
  onArreter,
  onEnvoyer,
}: {
  flux: MediaStream | null;
  onArreter: () => void;
  onEnvoyer: () => void;
}) {
  const barres = useRef<(HTMLSpanElement | null)[]>([]);
  const [secondes, setSecondes] = useState(0);

  useEffect(() => {
    const debut = Date.now();
    const minuterie = window.setInterval(
      () => setSecondes(Math.floor((Date.now() - debut) / 1000)),
      250,
    );
    return () => window.clearInterval(minuterie);
  }, []);

  useEffect(() => {
    if (!flux) return;
    const contexte = new AudioContext();
    const analyseur = contexte.createAnalyser();
    analyseur.fftSize = 512;
    contexte.createMediaStreamSource(flux).connect(analyseur);
    const donnees = new Uint8Array(analyseur.fftSize);
    const historique: number[] = Array<number>(BARRES).fill(0);
    let dernier = 0;
    let image = 0;
    const dessiner = (t: number) => {
      image = requestAnimationFrame(dessiner);
      if (t - dernier < 70) return; // une barre toutes les 70 ms : l'onde défile de droite à gauche
      dernier = t;
      analyseur.getByteTimeDomainData(donnees);
      let somme = 0;
      for (const v of donnees) somme += ((v - 128) / 128) ** 2;
      historique.push(Math.min(1, Math.sqrt(somme / donnees.length) * 5));
      historique.shift();
      historique.forEach((n, i) => {
        const b = barres.current[i];
        if (b) b.style.transform = `scaleY(${Math.max(0.12, n).toFixed(3)})`;
      });
    };
    image = requestAnimationFrame(dessiner);
    return () => {
      cancelAnimationFrame(image);
      void contexte.close();
    };
  }, [flux]);

  const temps = `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;

  return (
    <div className="vocal-enregistrement" role="group" aria-label="Message vocal en cours">
      <button
        type="button"
        className="vocal-arreter"
        onClick={onArreter}
        aria-label="Arrêter et effacer le message vocal"
        title="Arrêter"
      >
        <span className="vocal-carre" aria-hidden="true" />
      </button>
      <span className="vocal-point" aria-hidden="true" />
      <span className="vocal-temps" aria-live="off">
        {temps}
      </span>
      <span className="vocal-onde" aria-hidden="true">
        {Array.from({ length: BARRES }, (_, i) => (
          <i
            key={i}
            ref={(el) => {
              barres.current[i] = el;
            }}
          />
        ))}
      </span>
      <button
        type="button"
        className="vocal-envoyer"
        onClick={onEnvoyer}
        aria-label="Envoyer le message vocal"
        title="Envoyer"
      >
        <Icon name="up" size={18} stroke={2.2} />
      </button>
    </div>
  );
}
