'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApprobationQr } from './ScannerQr';
import { Logo } from './Logo';
import { lireLienQr } from '@/lib/qr-connexion';

/**
 * Page /qr : ouverte quand on scanne le code QR de connexion avec l'appareil photo du téléphone (le code est un
 * lien). Il faut être connecté à Six sur ce téléphone (sinon l'écran de connexion s'affiche d'abord), puis on
 * confirme comme dans le scanner de l'app.
 */
export function PageQr() {
  const router = useRouter();
  const [demande, setDemande] = useState<{ id: string; secret: string } | null | undefined>();
  useEffect(() => {
    setDemande(lireLienQr(window.location.href));
  }, []);
  return (
    <main className="screen auth-screen">
      <div className="auth-card">
        <div className="auth-hero">
          <Logo label="Six" />
          <span className="auth-eyebrow">CONNEXION PAR CODE QR</span>
          <h2>Connecter un appareil</h2>
        </div>
        {demande === null ? (
          <p className="seven-erreur">Ce lien ne contient pas de code de connexion Six valable.</p>
        ) : demande ? (
          <ApprobationQr demande={demande} onFini={() => router.replace('/')} />
        ) : null}
      </div>
    </main>
  );
}
