import { AsyncLocalStorage } from 'node:async_hooks';
import type { UsageJetons } from './types';

type Mesure = { usage?: UsageJetons; modele?: string };
const mesure = new AsyncLocalStorage<Mesure>();

export function mesurerJetons<T>(
  executer: (lire: () => UsageJetons | undefined, lireModele: () => string | undefined) => T,
): T {
  const demande: Mesure = {};
  return mesure.run(demande, () =>
    executer(
      () => demande.usage,
      () => demande.modele,
    ),
  );
}

export function noterModele(modele: string) {
  const demande = mesure.getStore();
  if (demande && modele) demande.modele = modele;
}

export function compterJetons(entree?: number, sortie?: number) {
  const demande = mesure.getStore();
  if (
    !demande ||
    typeof entree !== 'number' ||
    typeof sortie !== 'number' ||
    !Number.isSafeInteger(entree) ||
    !Number.isSafeInteger(sortie) ||
    entree < 0 ||
    sortie < 0
  )
    return;
  demande.usage = {
    entree: (demande.usage?.entree ?? 0) + entree,
    sortie: (demande.usage?.sortie ?? 0) + sortie,
  };
}
