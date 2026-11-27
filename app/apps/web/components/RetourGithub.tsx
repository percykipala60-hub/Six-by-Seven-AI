'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { lireGithub, terminerGithub } from '@/lib/github';

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
    // Retour sans autorisation (réglages de l'application modifiés sur GitHub) : on repasse par l'autorisation,
    // qui revient aussitôt si elle est déjà accordée.
    if (!code) {
      void lireGithub().then((e) => {
        if ('relie' in e && e.relie) router.replace('/reglages?v=memoire');
        else if ('adresse' in e) window.location.assign(e.adresse);
        else setMessage('erreur' in e ? e.erreur : 'La liaison avec GitHub a échoué.');
      });
      return;
    }
    void terminerGithub(code, installation, etat).then((r) => {
      if ('relie' in r) router.replace('/reglages?v=memoire');
      else if ('installer' in r) {
        setMessage('Choisissez les dépôts que Six peut utiliser…');
        window.location.assign(r.installer);
      } else setMessage(r.erreur);
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
