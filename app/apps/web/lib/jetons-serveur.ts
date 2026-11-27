import { AsyncLocalStorage } from 'node:async_hooks';
import type { UsageJetons } from './types';

const mesure = new AsyncLocalStorage<{ usage?: UsageJetons }>();

export function mesurerJetons<T>(executer: (lire: () => UsageJetons | undefined) => T): T {
  const demande: { usage?: UsageJetons } = {};
  return mesure.run(demande, () => executer(() => demande.usage));
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
