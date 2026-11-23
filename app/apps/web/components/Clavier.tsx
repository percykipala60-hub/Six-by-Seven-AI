'use client';

import { useEffect } from 'react';

/**
 * Clavier du téléphone : l'écran se cale sur la partie visible au-dessus du clavier, comme une appli
 * de discussion. La barre de saisie se pose sur le clavier, le fil garde ses derniers messages en vue
 * et le fond ne bouge pas.
 *
 * On suit la zone visible (visualViewport) et on publie en CSS :
 *  --vvh   : hauteur visible au-dessus du clavier ;
 *  --vvtop : décalage appliqué par Safari quand il fait glisser la page.
 * La classe `clavier` sur <html> (clavier ouvert) active la mise en page dédiée (globals.css).
 * Les valeurs sont appliquées tout de suite, sans attendre l'image suivante : un retard d'une image
 * suffit à faire trembler la barre pendant que Safari déplace la page. Sur Android, le navigateur
 * redimensionne déjà l'écran (interactive-widget=resizes-content) : la classe ne s'active pas.
 */
export function Clavier() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const racine = document.documentElement;
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
