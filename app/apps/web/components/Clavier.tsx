'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Clavier du téléphone : l'écran se cale sur la partie visible au-dessus du clavier, comme une appli
 * de discussion. La barre du haut reste en place, le contenu se recentre, la barre de saisie se pose
 * sur le clavier et le fond ne bouge pas.
 *
 * App iPhone et Android (Capacitor) : le module clavier raccourcit la vue elle-même
 * (capacitor.config.ts, resize « native ») ; ici on retire la barre « ⌃ ⌄ ✓ » au-dessus du clavier
 * et on fige la hauteur du fond, pour que la vague ne se redessine pas quand la vue se raccourcit.
 *
 * Navigateur (Safari) : on suit la zone visible (visualViewport) et on publie en CSS
 *  --vvh   : hauteur visible au-dessus du clavier ;
 *  --vvtop : décalage appliqué par Safari quand il fait glisser la page.
 * La classe `clavier` sur <html> active la mise en page dédiée (globals.css). Les valeurs sont
 * appliquées tout de suite : un retard d'une image suffit à faire trembler la barre. Sur Android
 * (navigateur), l'écran est déjà raccourci (interactive-widget=resizes-content) : la classe ne
 * s'active pas.
 */
export function Clavier() {
  useEffect(() => {
    const racine = document.documentElement;

    if (Capacitor.isNativePlatform()) {
      // Hauteur du fond fixée sur l'écran entier : la vue raccourcie par le clavier ne la change pas.
      const figerFond = () =>
        racine.style.setProperty(
          '--fond-h',
          `${Math.max(window.screen.height, window.screen.width, window.innerHeight)}px`,
        );
      figerFond();
      if (Capacitor.getPlatform() === 'ios') {
        // Ancienne version de l'app sans le module : l'appel échoue sans conséquence.
        Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
      }
      window.addEventListener('orientationchange', figerFond);
      // Clavier ouvert : la barre de saisie se colle au clavier (plus de marge pour la barre de gestes).
      const ecoutes = [
        Keyboard.addListener('keyboardWillShow', () => racine.classList.add('clavier-natif')),
        Keyboard.addListener('keyboardWillHide', () => racine.classList.remove('clavier-natif')),
      ];
      return () => {
        window.removeEventListener('orientationchange', figerFond);
        ecoutes.forEach((e) => void e.then((l) => l.remove()).catch(() => {}));
        racine.classList.remove('clavier-natif');
      };
    }

    const vv = window.visualViewport;
    if (!vv) return;
    let ouvert = false;

    const appliquer = () => {
      const maintenant = window.innerHeight - vv.height > 120;
      // Le fil de discussion était-il tout en bas ? Il doit le rester quand il se raccourcit.
      const fil = document.querySelector<HTMLElement>('.seven-fil');
      const enBas = fil ? fil.scrollHeight - fil.scrollTop - fil.clientHeight < 48 : false;

      racine.style.setProperty('--vvh', `${vv.height}px`);
      racine.style.setProperty('--vvtop', `${maintenant ? vv.offsetTop : 0}px`);
      if (maintenant !== ouvert) {
        ouvert = maintenant;
        racine.classList.toggle('clavier', ouvert);
      }
      // La page elle-même ne doit pas avoir défilé : seul l'écran calé sur la zone visible compte.
      if (ouvert && window.scrollY !== 0) window.scrollTo(0, 0);
      if (fil && enBas) fil.scrollTop = fil.scrollHeight;
    };

    appliquer();
    vv.addEventListener('resize', appliquer);
    vv.addEventListener('scroll', appliquer);
    window.addEventListener('scroll', appliquer, { passive: true });
    return () => {
      vv.removeEventListener('resize', appliquer);
      vv.removeEventListener('scroll', appliquer);
      window.removeEventListener('scroll', appliquer);
      racine.classList.remove('clavier');
    };
  }, []);
  return null;
}
