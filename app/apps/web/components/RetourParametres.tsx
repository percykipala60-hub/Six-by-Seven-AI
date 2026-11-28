'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const cle = 'six-retour-parametres';
// Exclut notamment les adresses de connexion et leurs codes à usage unique.
const espaces = new Set([
  '/',
  '/chat',
  '/cosinus',
  '/responsive',
  '/plugins',
  '/plugins/catalogue',
  '/projets',
  '/taches',
  '/artefacts',
  '/sujets',
  '/jeu',
  '/espace-jeu',
  '/rapide',
  '/ton-juste',
  '/coupe-arnaque',
]);
export function RetourParametres() {
  const chemin = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (chemin === '/reglages') return;
    try {
      if (espaces.has(chemin)) sessionStorage.setItem(cle, chemin + window.location.search);
      else sessionStorage.removeItem(cle);
    } catch {
      /* stockage indisponible */
    }
  }, [chemin, params]);
  return null;
}
export function ecranAvantParametres() {
  try {
    const u = new URL(sessionStorage.getItem(cle) || '/chat', location.origin);
    if (u.origin === location.origin && espaces.has(u.pathname)) return u.pathname + u.search;
  } catch {
    /* accès direct */
  }
  return '/chat';
}
