'use client';

import { useCallback, useEffect, useState } from 'react';
import { Groupe, Ligne, LigneInfo } from './Liste';
import { useConfirmer } from './Confirmer';
import { ScannerQr } from './ScannerQr';
import { ecouterCompte, lireCompte } from '@/lib/compte';
import {
  dateConnexion,
  deconnecterAppareil,
  deconnecterAutresAppareils,
  estTelephone,
  lireAppareils,
  trierAppareils,
  type Appareil,
} from '@/lib/appareils';

/**
 * Réglages → Appareils connectés (comme dans Claude et WhatsApp) : où le compte est connecté, déconnecter un
 * appareil ou tous les autres. Sur téléphone seulement, « Associer un appareil » ouvre le scanner : on scanne le
 * code QR affiché sur l'écran de connexion de l'autre appareil. Ailleurs, le bloc n'existe pas (chaque version ne
 * montre que ce qu'elle sait faire).
 */
/** Téléphone ou tablette d'après son nom (« Android · Chrome », « iPhone · Safari »…), ordinateur sinon. */
function iconeAppareil(nom: string): 'phone' | 'ordinateur' {
  return /iphone|ipad|android|mobile|t[ée]l[ée]phone|tablette/i.test(nom) ? 'phone' : 'ordinateur';
}

export function AppareilsVue() {
  const [connecte, setConnecte] = useState(() => lireCompte().statut === 'connecte');
  const [telephone, setTelephone] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [liste, setListe] = useState<Appareil[] | null>(null);
  const [cetAppareil, setCetAppareil] = useState('');
  const [gestion, setGestion] = useState(false);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState('');
  const [demande, demander] = useConfirmer();

  useEffect(() => ecouterCompte(() => setConnecte(lireCompte().statut === 'connecte')), []);
  useEffect(() => {
    void estTelephone().then(setTelephone);
  }, []);

  const recharger = useCallback(async () => {
    const r = await lireAppareils();
    if ('erreur' in r) {
      setErreur(r.erreur);
      setListe(null);
      return;
    }
    setErreur('');
    setCetAppareil(r.cetAppareil);
    setGestion(r.gestion);
    setListe(trierAppareils(r.appareils, r.cetAppareil));
  }, []);
  useEffect(() => {
    if (!connecte) return;
    void recharger();
    // Un appareil qui vient de se connecter (ou de s'enregistrer) apparaît sans recharger la page.
    const t = window.setInterval(() => void recharger(), 20_000);
    return () => window.clearInterval(t);
  }, [connecte, recharger]);

  if (!connecte)
    return (
      <Groupe titre="Appareils connectés" pied="Connectez-vous pour voir et gérer vos appareils.">
        <LigneInfo icon="lock" label="Mode invité" sous="Tout reste sur cet appareil" />
      </Groupe>
    );

  const autres = (liste ?? []).filter((a) => a.appareil !== cetAppareil);
  const ceLui = liste?.find((a) => a.appareil === cetAppareil);
  const detail = (a: NonNullable<typeof liste>[number]) =>
    [
      a.appareil === cetAppareil ? '' : dateConnexion(a.derniere_connexion),
      a.role === 'principal' ? 'Principal' : a.role === 'hote' ? 'Hôte' : 'Par code QR',
      a.methode && a.methode !== 'Connexion' && a.methode !== 'Code QR' ? a.methode : '',
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <>
      {demande}
      {scanner && (
        <ScannerQr
          onFermer={() => {
            setScanner(false);
            void recharger();
          }}
        />
      )}

      {telephone && (
        <Groupe
          titre="Associer un appareil"
          pied="Sur l’autre appareil, choisissez « Se connecter avec un code QR », puis scannez le code affiché."
        >
          <Ligne
            icon="qr"
            label="Associer un appareil"
            sous="Scanner un code QR"
            onClick={() => setScanner(true)}
          />
        </Groupe>
      )}

      {ceLui && (
        <Groupe titre="Cet appareil">
          <LigneInfo
            icon={iconeAppareil(ceLui.nom)}
            label={ceLui.nom || 'Cet appareil'}
            sous={detail(ceLui)}
          />
        </Groupe>
      )}

      <Groupe
        titre="Autres appareils"
        pied={
          gestion
            ? 'Déconnecter un appareil ferme sa session : il devra se reconnecter pour utiliser votre compte.'
            : undefined
        }
      >
        {liste === null && !erreur && <LigneInfo icon="refresh" label="Chargement…" />}
        {autres.map((a) => {
          const sous = detail(a);
          // Les autres appareils restent visibles ; seuls ceux que cet appareil peut déconnecter sont cliquables.
          if (!a.gerable)
            return (
              <LigneInfo
                key={a.appareil}
                icon={iconeAppareil(a.nom)}
                label={a.nom || 'Appareil'}
                sous={sous}
              />
            );
          return (
            <Ligne
              key={a.appareil}
              icon={iconeAppareil(a.nom)}
              label={a.nom || 'Appareil'}
              sous={occupe === a.appareil ? 'Déconnexion…' : sous}
              disabled={Boolean(occupe)}
              onClick={() =>
                demander({
                  titre: 'Déconnecter cet appareil ?',
                  texte: `« ${a.nom || 'Cet appareil'} » devra se reconnecter pour utiliser votre compte.`,
                  action: 'Déconnecter',
                  danger: true,
                  onConfirmer: async () => {
                    setOccupe(a.appareil);
                    const e = await deconnecterAppareil(a.appareil);
                    setOccupe('');
                    setErreur(e ?? '');
                    await recharger();
                  },
                })
              }
            />
          );
        })}
        {liste && autres.length === 0 && (
          <LigneInfo icon="shield" label="Aucun autre appareil connecté" />
        )}
        {gestion && autres.some((a) => a.gerable) && (
          <Ligne
            icon="logout"
            danger
            label="Déconnecter tous les autres appareils"
            disabled={Boolean(occupe)}
            onClick={() =>
              demander({
                titre: 'Déconnecter les autres appareils ?',
                texte: 'Cet appareil reste connecté. Les autres devront se reconnecter.',
                action: 'Déconnecter',
                danger: true,
                onConfirmer: async () => {
                  setOccupe('tous');
                  const e = await deconnecterAutresAppareils();
                  setOccupe('');
                  setErreur(e ?? '');
                  await recharger();
                },
              })
            }
          />
        )}
      </Groupe>
      {erreur && (
        <p className="lg-pied" role="alert">
          {erreur}
        </p>
      )}
    </>
  );
}
