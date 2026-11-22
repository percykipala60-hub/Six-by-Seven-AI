'use client';

import { useEffect, useState } from 'react';
import { Logo } from './Logo';

/**
 * Six réfléchit : le logo respire, deux ondes s'en éloignent et une phrase dit ce que Six fait.
 * Les phrases avancent une à une puis restent sur la dernière : elles décrivent le travail, sans promettre de durée.
 * `compact` : une ligne, pour une réécriture sur place (écran des réponses).
 */
export function Reflexion({ phases, compact = false }: { phases: string[]; compact?: boolean }) {
  const [i, setI] = useState(0);
  const cle = phases.join('|'); // un nouveau tableau aux mêmes phrases ne relance pas la séquence
  useEffect(() => {
    setI(0);
    const n = cle.split('|').length;
    const t = window.setInterval(() => setI((k) => (k < n - 1 ? k + 1 : k)), 1800);
    return () => window.clearInterval(t);
  }, [cle]);

  if (compact) {
    return (
      <p className="reflexion-ligne" role="status" aria-live="polite">
        <span className="reflexion-point" aria-hidden="true" />
        <span key={i} className="reflexion-phrase">
          {phases[i]}
        </span>
      </p>
    );
  }

  return (
    <div className="reflexion" role="status" aria-live="polite">
      <div className="reflexion-logo" aria-hidden="true">
        <span className="reflexion-onde" />
        <span className="reflexion-onde" />
        <Logo label="" />
      </div>
      <p className="reflexion-titre">Six réfléchit</p>
      <p key={i} className="reflexion-phrase muted">
        {phases[i]}
      </p>
    </div>
  );
}
