'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const calme = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Texte qui s'écrit lettre par lettre, comme une IA qui répond. Un repère de masquage (« [PERSONNE 1] ») apparaît d'un coup,
 * jamais à moitié. `rendu` affiche le texte partiel (pastilles de masquage) ; `onFin` prévient quand tout est écrit.
 * Mouvement réduit : le texte entier tout de suite.
 */
export function Ecrit({
  texte,
  rendu,
  actif = true,
  onFin,
}: {
  texte: string;
  rendu: (t: string) => ReactNode;
  actif?: boolean;
  onFin?: () => void;
}) {
  const [n, setN] = useState(0);
  const fin = useRef(onFin);
  fin.current = onFin;

  useEffect(() => {
    if (!actif) return;
    if (calme()) {
      setN(texte.length);
      fin.current?.();
      return;
    }
    setN(0);
    let i = 0;
    let raf = 0;
    let avant = 0;
    const pas = (t: number) => {
      // Environ 90 caractères par seconde : une réponse de 300 caractères s'écrit en un peu plus de 3 secondes.
      const ecoule = avant ? t - avant : 16;
      avant = t;
      let k = Math.max(1, Math.round(ecoule / 11));
      while (k-- > 0 && i < texte.length) {
        if (texte[i] === '[') {
          const ferme = texte.indexOf(']', i);
          i = ferme > -1 && ferme - i < 24 ? ferme + 1 : i + 1;
        } else i += 1;
      }
      setN(i);
      if (i < texte.length) raf = requestAnimationFrame(pas);
      else fin.current?.();
    };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [texte, actif]);

  if (!actif) return null;
  const ecrit = texte.slice(0, n);
  return (
    <>
      <span className="sr">{texte}</span>
      <span aria-hidden="true">
        {rendu(ecrit)}
        {n < texte.length && <span className="curseur" />}
      </span>
    </>
  );
}

/**
 * Jauge de tension : la barre balaie pendant l'analyse, puis se remplit jusqu'à la valeur finale pendant que le nombre compte.
 */
export function Jauge({ valeur }: { valeur: number | null }) {
  const [affiche, setAffiche] = useState(0);

  useEffect(() => {
    if (valeur === null) {
      setAffiche(0);
      return;
    }
    if (calme()) {
      setAffiche(valeur);
      return;
    }
    const debut = performance.now();
    let raf = 0;
    const compte = (t: number) => {
      const p = Math.min(1, (t - debut) / 1000);
      setAffiche(Math.round(valeur * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(compte);
    };
    raf = requestAnimationFrame(compte);
    return () => cancelAnimationFrame(raf);
  }, [valeur]);

  const label =
    valeur === null
      ? 'Je mesure la tension…'
      : valeur < 35
        ? 'Calme'
        : valeur < 65
          ? 'Pressant'
          : 'Tendu';
  return (
    <div
      className="tension"
      title="La tension estime la pression ressentie dans le message, pas sa gentillesse ou sa qualité."
    >
      <b>{label}</b>
      {valeur !== null && <span className="muted small">Pression du message reçu</span>}
      <div
        className={`gauge${valeur === null ? ' cherche' : ''}`}
        role="meter"
        aria-label="Pression estimée du message reçu"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valeur ?? undefined}
        aria-valuetext={valeur === null ? 'Mesure en cours' : `${label}, ${valeur} sur 100`}
      >
        <i style={{ transform: `scaleX(${valeur === null ? 0.5 : affiche / 100})` }} />
      </div>
      {valeur !== null && <span className="muted small">{affiche}/100</span>}
    </div>
  );
}
