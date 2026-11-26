'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { terminerGithub } from '@/lib/github';

/** Retour de GitHub après l'installation de « Six by Seven » : relie le compte, puis revient dans Réglages → Cloud. */
export function RetourGithub() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState('Liaison avec GitHub…');
  const fait = useRef(false);

  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    const code = params.get('code') ?? '';
    const installation = params.get('installation_id') ?? '';
    const etat = params.get('state') ?? '';
    if (!code || !installation) {
      setMessage(
        'GitHub n’a pas envoyé d’autorisation. Recommence depuis Réglages → Cloud → Connecter GitHub.',
      );
      return;
    }
    void terminerGithub(code, installation, etat).then((erreur) => {
      if (erreur) setMessage(erreur);
      else router.replace('/reglages?v=memoire');
    });
  }, [params, router]);

  return (
    <main className="screen settings lg-page">
      <p className="lg-pied" role="status">
        {message}
      </p>
    </main>
  );
}
