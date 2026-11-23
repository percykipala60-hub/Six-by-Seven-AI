'use client';

import { useEffect } from 'react';

/**
 * Clavier du téléphone : seule la barre de saisie monte avec lui, le fond reste immobile.
 *
 * Sur iPhone, quand un champ en bas de l'écran reçoit le focus, Safari décale toute la page vers le haut
 * (la « zone visible » glisse) : le fond, les bulles et la barre bougent ensemble. On suit cette zone
 * visible (visualViewport) et on publie deux valeurs en CSS :
 *  --vvh   : hauteur visible au-dessus du clavier ;
 *  --vvtop : décalage appliqué par Safari.
 * La classe `clavier` sur <html> (clavier ouvert) sert au CSS pour garder le fond en place et poser la
 * barre de saisie juste au-dessus du clavier. Sur Android, le navigateur redimensionne l'écran
 * (interactive-widget=resizes-content) : aucun décalage, la classe ne s'active pas.
 */
export function Clavier() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const racine = document.documentElement;
    let image = 0;
    const maj = () => {
      cancelAnimationFrame(image);
      image = requestAnimationFrame(() => {
        const ouvert = window.innerHeight - vv.height > 120;
        racine.classList.toggle('clavier', ouvert);
        racine.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
        racine.style.setProperty('--vvtop', `${Math.round(ouvert ? vv.offsetTop : 0)}px`);
      });
    };
    maj();
    vv.addEventListener('resize', maj);
    vv.addEventListener('scroll', maj);
    return () => {
      cancelAnimationFrame(image);
      vv.removeEventListener('resize', maj);
      vv.removeEventListener('scroll', maj);
      racine.classList.remove('clavier');
    };
  }, []);
  return null;
}
