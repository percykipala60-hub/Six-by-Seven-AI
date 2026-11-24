'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { useCallback, useEffect, useState } from 'react';
import { Groupe, Ligne, LigneInfo, LigneInterrupteur } from './Liste';

/**
 * Réglages > Bulle et clavier : les deux façons d'utiliser Six sans ouvrir l'app (Android).
 * - La bulle : un rond « 6 » par-dessus toutes les apps ; on copie un message, on la touche, Six propose
 *   trois réponses.
 * - Le clavier Six : dans la messagerie, on passe sur ce clavier, on touche « Réponses de Six », et la réponse
 *   choisie est écrite directement dans le champ.
 */
interface EtatNatif {
  overlayAccess: boolean;
  bubbleEnabled: boolean;
  keyboardEnabled?: boolean;
}

interface PluginRaccourcis {
  getStatus(): Promise<EtatNatif>;
  requestOverlayAccess(): Promise<void>;
  setBubbleEnabled(options: { enabled: boolean }): Promise<void>;
  openKeyboardSettings(): Promise<void>;
  showKeyboardPicker(): Promise<void>;
}

const Natif = registerPlugin<PluginRaccourcis>('SixInterApp');

export function Raccourcis() {
  const android = Capacitor.getPlatform() === 'android';
  const [etat, setEtat] = useState<EtatNatif | null>(null);
  const [message, setMessage] = useState('');

  const lire = useCallback(async () => {
    if (!android) return;
    try {
      setEtat(await Natif.getStatus());
    } catch {
      setMessage("Six n'a pas pu lire l'état de la bulle et du clavier.");
    }
  }, [android]);

  // Relu au retour des réglages d'Android (autorisation donnée, clavier activé).
  useEffect(() => {
    void lire();
    const auRetour = () => document.visibilityState === 'visible' && void lire();
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [lire]);

  async function basculerBulle(on: boolean) {
    setMessage('');
    try {
      if (on && !etat?.overlayAccess) {
        await Natif.requestOverlayAccess();
        setMessage(
          'Autorise « Afficher par-dessus les autres applications » pour Six, puis reviens ici.',
        );
      } else {
        await Natif.setBubbleEnabled({ enabled: on });
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "La bulle n'a pas pu être changée.");
    }
    void lire();
  }

  if (!android) {
    return (
      <>
        <Groupe pied="La bulle et le clavier Six fonctionnent dans l’application Six pour Android.">
          <LigneInfo
            icon="phone"
            label="Disponible sur Android"
            sous="Installe l’application Six pour les utiliser"
          />
        </Groupe>
        <Comment />
      </>
    );
  }

  return (
    <>
      <Groupe
        titre="Bulle Six"
        pied="Copie un message dans ta messagerie, puis touche la bulle : Six propose trois réponses. Fais-la glisser pour la déplacer, tout en bas pour la fermer."
      >
        <LigneInterrupteur
          id="bulle"
          icon="chat"
          label="Afficher la bulle"
          sous={
            etat?.overlayAccess
              ? 'Visible par-dessus les autres applications'
              : 'Android demandera une autorisation'
          }
          checked={Boolean(etat?.bubbleEnabled && etat.overlayAccess)}
          onChange={(on) => void basculerBulle(on)}
        />
      </Groupe>

      <Groupe
        titre="Clavier Six"
        pied="Dans ta messagerie : copie le message reçu, passe sur le clavier Six, touche « Réponses de Six ». La réponse choisie s’écrit dans le champ ; le globe ramène ton clavier habituel."
      >
        <Ligne
          icon="type"
          label={etat?.keyboardEnabled ? 'Clavier Six activé' : 'Activer le clavier Six'}
          sous={
            etat?.keyboardEnabled
              ? 'Gérer les claviers d’Android'
              : 'Ouvre la liste des claviers d’Android'
          }
          onClick={() => void Natif.openKeyboardSettings()}
        />
        {etat?.keyboardEnabled && (
          <Ligne
            icon="refresh"
            label="Changer de clavier maintenant"
            sous="Choisir le clavier Six ou ton clavier habituel"
            onClick={() => void Natif.showKeyboardPicker()}
          />
        )}
      </Groupe>
      {message && <p className="lg-pied">{message}</p>}
      <Comment />
    </>
  );
}

function Comment() {
  return (
    <section className="lg">
      <h2 className="lg-titre">Confidentialité</h2>
      <p className="lg-pied">
        Six ne lit le message copié qu’au moment où tu touches la bulle ou le bouton du clavier. Il
        est masqué sur ton appareil avant l’envoi, et rien n’est envoyé sans ton geste.
      </p>
    </section>
  );
}
