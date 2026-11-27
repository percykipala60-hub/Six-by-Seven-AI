'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { approuverDemandeQr, lireDemandeQr, lireLienQr, type DemandeQr } from '@/lib/qr-connexion';

type Demande = Pick<DemandeQr, 'id' | 'secret'>;

/**
 * Scanner de code QR de Six (appareil déjà connecté) : la caméra lit le code affiché sur l'écran de connexion
 * d'un autre appareil, puis on confirme. Lecture par le détecteur du navigateur (BarcodeDetector : Chrome, Edge,
 * Android) ou, sinon, par jsQR. Rien ne part tant que la personne n'a pas confirmé.
 */
export function ScannerQr({ onFermer }: { onFermer: () => void }) {
  const [demande, setDemande] = useState<Demande | null>(null);
  const [erreur, setErreur] = useState('');
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (demande) return;
    let flux: MediaStream | null = null;
    let arret = false;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('Cet appareil ne permet pas d’utiliser la caméra ici.');
        flux = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (arret || !video.current) return;
        video.current.srcObject = flux;
        await video.current.play().catch(() => {});
        const Detecteur = (
          window as unknown as {
            BarcodeDetector?: new (o: { formats: string[] }) => {
              detect(s: CanvasImageSource): Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;
        const detecteur = Detecteur ? new Detecteur({ formats: ['qr_code'] }) : null;
        const jsQR = detecteur ? null : (await import('jsqr')).default;
        const toile = document.createElement('canvas');
        const ctx = toile.getContext('2d', { willReadFrequently: true });
        const lire = async () => {
          if (arret || !video.current) return;
          const v = video.current;
          let texte = '';
          if (v.videoWidth) {
            if (detecteur) {
              texte = (await detecteur.detect(v).catch(() => []))[0]?.rawValue ?? '';
            } else if (jsQR && ctx) {
              const e = Math.min(1, 640 / v.videoWidth);
              toile.width = Math.round(v.videoWidth * e);
              toile.height = Math.round(v.videoHeight * e);
              ctx.drawImage(v, 0, 0, toile.width, toile.height);
              const img = ctx.getImageData(0, 0, toile.width, toile.height);
              texte = jsQR(img.data, img.width, img.height)?.data ?? '';
            }
          }
          if (texte) {
            const d = lireLienQr(texte);
            if (d) {
              setDemande(d);
              return;
            }
            setErreur('Ce code QR n’est pas un code de connexion Six.');
          }
          minuterie = setTimeout(() => void lire(), 250);
        };
        void lire();
      } catch (e) {
        const nom = e instanceof DOMException ? e.name : '';
        setErreur(
          nom === 'NotAllowedError' || nom === 'SecurityError'
            ? 'Accès à la caméra refusé. Autorisez la caméra pour Six, puis réessayez.'
            : nom === 'NotFoundError'
              ? 'Aucune caméra trouvée sur cet appareil.'
              : e instanceof Error && e.message
                ? e.message
                : 'Caméra indisponible.',
        );
      }
    })();
    return () => {
      arret = true;
      clearTimeout(minuterie);
      flux?.getTracks().forEach((p) => p.stop());
    };
  }, [demande]);

  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [onFermer]);

  return createPortal(
    <div className="scanner-fond" onPointerDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="scanner" role="dialog" aria-modal="true" aria-labelledby="scanner-titre">
        <div className="scanner-tete">
          <h2 id="scanner-titre">{demande ? 'Connecter un appareil' : 'Scanner un code QR'}</h2>
          <button type="button" aria-label="Fermer" onClick={onFermer}>
            <Icon name="x" size={16} stroke={2} />
          </button>
        </div>
        {demande ? (
          <ApprobationQr demande={demande} onFini={onFermer} />
        ) : (
          <>
            <div className="scanner-camera">
              <video ref={video} muted playsInline />
              <span className="scanner-cadre" aria-hidden="true" />
            </div>
            <p className="scanner-aide">
              Vise le code QR affiché sur l’écran de connexion de l’autre appareil.
            </p>
            {erreur && <p className="seven-erreur">{erreur}</p>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation : nom de l'appareil qui demande à se connecter, avertissement, puis « Connecter ».
 * (Utilisé aussi par la page /qr, ouverte quand on scanne le code avec l'appareil photo du téléphone.)
 */
export function ApprobationQr({ demande, onFini }: { demande: Demande; onFini?: () => void }) {
  const [info, setInfo] = useState<{ appareil: string; statut: string } | null | undefined>();
  const [etat, setEtat] = useState<'choix' | 'envoi' | 'fait'>('choix');
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    void lireDemandeQr(demande).then(setInfo);
  }, [demande]);

  const valide = info && info.statut === 'attente';
  async function connecter() {
    setEtat('envoi');
    setErreur('');
    const e = await approuverDemandeQr(demande);
    if (e) {
      setErreur(e);
      setEtat('choix');
    } else setEtat('fait');
  }

  if (info === undefined) return <p className="scanner-aide">Lecture du code…</p>;
  if (!valide)
    return (
      <div className="scanner-approbation">
        <p className="seven-erreur">
          Ce code QR a expiré ou a déjà servi. Affiche-en un nouveau sur l’autre appareil.
        </p>
        {onFini && (
          <button type="button" className="btn ghost" onClick={onFini}>
            Fermer
          </button>
        )}
      </div>
    );
  if (etat === 'fait')
    return (
      <div className="scanner-approbation">
        <div className="auth-alert-succes" role="status">
          <Icon name="check" size={18} />
          <span>
            C’est fait : « {info.appareil || 'l’appareil'} » se connecte à votre compte. Vous allez
            recevoir un e-mail de confirmation.
          </span>
        </div>
        {onFini && (
          <button type="button" onClick={onFini}>
            Terminer
          </button>
        )}
      </div>
    );
  return (
    <div className="scanner-approbation">
      <p className="scanner-appareil">
        <Icon name="phone" size={18} stroke={1.8} />
        <span>{info.appareil || 'Appareil inconnu'}</span>
      </p>
      <p>
        Cet appareil demande à se connecter à <strong>votre</strong> compte Six.
      </p>
      <p className="scanner-attention">
        Ne confirmez que si ce code s’affiche sur un écran à vous, devant vous. Personne de Six ne
        vous demandera jamais de scanner un code.
      </p>
      {erreur && <p className="seven-erreur">{erreur}</p>}
      <div className="scanner-boutons">
        {onFini && (
          <button type="button" className="btn ghost" onClick={onFini} disabled={etat === 'envoi'}>
            Annuler
          </button>
        )}
        <button type="button" onClick={() => void connecter()} disabled={etat === 'envoi'}>
          {etat === 'envoi' ? 'Connexion…' : 'Connecter cet appareil'}
        </button>
      </div>
    </div>
  );
}
