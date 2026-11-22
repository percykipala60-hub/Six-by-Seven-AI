'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';

type GameEvent = { source?: string; type?: string; paused?: boolean };

export function GameShell({
  src,
  title,
  allow,
  pauseable = false,
}: {
  src: string;
  title: string;
  allow?: string;
  pauseable?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [enPartie, setEnPartie] = useState(false);
  const [pause, setPause] = useState(false);

  useEffect(() => {
    const receive = (event: MessageEvent<GameEvent>) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin)
        return;
      const data = event.data;
      if (data?.source !== 'kin-rush' && data?.source !== 'coupe-arnaque') return;

      if (data.type === 'run_start' || data.type === 'game_start') {
        setEnPartie(true);
        setPause(false);
      } else if (data.type === 'run_end' || data.type === 'game_end') {
        setEnPartie(false);
        setPause(false);
      } else if (data.type === 'pause_state') {
        setPause(data.paused === true);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  function basculerPause() {
    if (!enPartie) return;
    frame.current?.contentWindow?.postMessage(
      { source: 'six-host', type: pause ? 'resume' : 'pause' },
      window.location.origin,
    );
  }

  return (
    <main className="jeu">
      <div className="jeu-bar">
        <Link href="/espace-jeu" className="jeu-retour" aria-label={`Quitter ${title}`}>
          <Icon name="x" /> <span>Quitter</span>
        </Link>
        <span className="jeu-titre">{title}</span>
        {pauseable && (
          <button
            type="button"
            className="jeu-control"
            aria-label={pause ? 'Reprendre le jeu' : 'Mettre le jeu en pause'}
            onClick={basculerPause}
            disabled={!enPartie}
          >
            <Icon name={pause ? 'play' : 'pause'} size={18} />
            <span>{pause ? 'Reprendre' : 'Pause'}</span>
          </button>
        )}
      </div>
      <iframe
        ref={frame}
        src={src}
        title={title}
        className="jeu-frame"
        allow={allow}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-pointer-lock allow-orientation-lock"
      />
    </main>
  );
}
