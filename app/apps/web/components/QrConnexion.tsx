'use client';

import { useEffect, useRef, useState } from 'react';
import { attendreDemandeQr, creerDemandeQr, lienQr, type DemandeQr } from '@/lib/qr-connexion';
import { Logo } from './Logo';

/**
 * Code QR de l'écran de connexion (comme Steam), avec le « 6 » de Six au centre : un appareil déjà connecté le scanne
 * (Réglages → Appareils connectés → « Associer un appareil ») et confirme ; cet appareil-ci se connecte alors au même compte, sans mot de passe. Le code change
 * toutes les 2 minutes et ne sert qu'une fois.
 */
export function QrConnexion() {
  const [demande, setDemande] = useState<DemandeQr | null>(null);
  const [svg, setSvg] = useState('');
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'connexion' | 'erreur'>('chargement');
  const [reste, setReste] = useState(120);
  const [essai, setEssai] = useState(0); // « Réessayer » : relance même si aucun code n'a encore été créé
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
          // Correction maximale (H, 30 %) : le logo de Six au centre ne gêne pas la lecture.
          errorCorrectionLevel: 'H',
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
  }, [demande, essai]);

  // Code indisponible (réseau) : nouvel essai tout seul après 5 s.
  useEffect(() => {
    if (etat !== 'erreur' || demande) return;
    const t = setTimeout(() => setEssai((n) => n + 1), 5000);
    return () => clearTimeout(t);
  }, [etat, demande]);

  // Confirmé : l'app bascule d'elle-même ; si l'écran reste figé, on recharge (la session est enregistrée).
  useEffect(() => {
    if (etat !== 'connexion') return;
    const t = setTimeout(() => window.location.reload(), 4000);
    return () => clearTimeout(t);
  }, [etat]);

  // Attente de l'approbation (toutes les 2 s) et compte à rebours.
  useEffect(() => {
    if (!demande || etat !== 'pret') return;
    // Une vérification à la fois : sinon, pendant la connexion, une deuxième vérification voit le code « déjà
    // utilisé », en demande un nouveau, et la session de Supabase (verrouillée pendant la connexion) se bloque.
    let enCours = false;
    let fini = false;
    const t = setInterval(() => {
      setReste(Math.max(0, Math.round((demande.expire - Date.now()) / 1000)));
      if (fini) return;
      // Expiré : nouveau code, même si une vérification n'a pas encore répondu.
      if (Date.now() > demande.expire) {
        fini = true;
        setDemande(null);
        return;
      }
      if (enCours) return;
      enCours = true;
      void attendreDemandeQr(demande)
        .then((r) => {
          if (!actif.current || fini) return;
          if (r === 'connecte') {
            fini = true;
            setEtat('connexion');
          } else if (r === 'expire')
            setDemande(null); // un nouveau code s'affiche
          else if (r === 'refuse') {
            fini = true;
            setEtat('erreur');
          }
        })
        .finally(() => {
          enCours = false;
        });
    }, 2000);
    return () => {
      fini = true;
      clearInterval(t);
    };
  }, [demande, etat]);

  return (
    <div className="qr-connexion">
      <div className="qr-image" aria-label="Code QR de connexion" role="img">
        {etat === 'pret' || etat === 'connexion' ? (
          // SVG fabriqué sur l'appareil par la bibliothèque qrcode (aucun contenu venu d'ailleurs).
          <span className="qr-avec-logo">
            {/* eslint-disable-next-line @next/next/no-img-element -- image fabriquée sur l'appareil (data URL) */}
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
              alt=""
              width={260}
              height={260}
            />
            {/* Le « 6 » de Six au centre du code. */}
            <span className="qr-logo" aria-hidden="true">
              <Logo label="" small />
            </span>
          </span>
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
            <button
              type="button"
              className="auth-lien"
              onClick={() => {
                setDemande(null);
                setEssai((n) => n + 1);
              }}
            >
              Réessayer
            </button>
          </p>
        ) : (
          <>
            <p className="qr-titre">Se connecter avec un code QR</p>
            <ol>
              <li>Ouvre Six sur un appareil déjà connecté (téléphone, ordinateur).</li>
              <li>
                Réglages → <strong>Appareils connectés</strong> →{' '}
                <strong>Associer un appareil</strong>, puis vise ce code.
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
