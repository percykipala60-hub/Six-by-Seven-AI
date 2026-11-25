'use client';

import { useEffect, useRef, useState } from 'react';
import { attendreDemandeQr, creerDemandeQr, lienQr, type DemandeQr } from '@/lib/qr-connexion';

/**
 * Code QR de l'écran de connexion (comme Steam) : un appareil déjà connecté à Six le scanne (menu → « Scanner un
 * code QR ») et confirme ; cet appareil-ci se connecte alors au même compte, sans mot de passe. Le code change
 * toutes les 2 minutes et ne sert qu'une fois.
 */
export function QrConnexion() {
  const [demande, setDemande] = useState<DemandeQr | null>(null);
  const [svg, setSvg] = useState('');
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'connexion' | 'erreur'>('chargement');
  const [reste, setReste] = useState(120);
  const actif = useRef(true);

  // Nouvelle demande (au départ, puis à chaque expiration).
  useEffect(() => {
    actif.current = true;
    if (demande && Date.now() < demande.expire) return;
    let annule = false;
    setEtat('chargement');
    creerDemandeQr()
      .then(async (d) => {
        const { default: QRCode } = await import('qrcode');
        const image = await QRCode.toString(lienQr(d), {
          type: 'svg',
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#0f1a3a', light: '#ffffff' },
        });
        if (annule) return;
        setSvg(image);
        setDemande(d);
        setEtat('pret');
      })
      .catch(() => !annule && setEtat('erreur'));
    return () => {
      annule = true;
      actif.current = false;
    };
  }, [demande]);

  // Attente de l'approbation (toutes les 2 s) et compte à rebours.
  useEffect(() => {
    if (!demande || etat !== 'pret') return;
    const t = setInterval(() => {
      setReste(Math.max(0, Math.round((demande.expire - Date.now()) / 1000)));
      void attendreDemandeQr(demande).then((r) => {
        if (!actif.current) return;
        if (r === 'connecte') setEtat('connexion');
        else if (r === 'expire')
          setDemande(null); // un nouveau code s'affiche
        else if (r === 'refuse') setEtat('erreur');
      });
    }, 2000);
    return () => clearInterval(t);
  }, [demande, etat]);

  return (
    <div className="qr-connexion">
      <div className="qr-image" aria-label="Code QR de connexion" role="img">
        {etat === 'pret' || etat === 'connexion' ? (
          // SVG fabriqué sur l'appareil par la bibliothèque qrcode (aucun contenu venu d'ailleurs).
          // eslint-disable-next-line @next/next/no-img-element -- image fabriquée sur l'appareil (data URL)
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            alt=""
            width={136}
            height={136}
          />
        ) : (
          <span className="qr-attente">{etat === 'erreur' ? '' : 'Préparation du code…'}</span>
        )}
      </div>
      <div className="qr-texte">
        {etat === 'connexion' ? (
          <p>Connexion en cours…</p>
        ) : etat === 'erreur' ? (
          <p>
            Code QR indisponible pour le moment.{' '}
            <button type="button" className="auth-lien" onClick={() => setDemande(null)}>
              Réessayer
            </button>
          </p>
        ) : (
          <>
            <p className="qr-titre">Se connecter avec un code QR</p>
            <ol>
              <li>Ouvre Six sur un appareil déjà connecté (téléphone, ordinateur).</li>
              <li>
                Menu → <strong>Scanner un code QR</strong>, puis vise ce code.
              </li>
              <li>Confirme : cet appareil se connecte à ton compte.</li>
            </ol>
            {etat === 'pret' && <p className="qr-reste">Le code change dans {reste} s.</p>}
          </>
        )}
      </div>
    </div>
  );
}
