/**
 * Accessibilité (Réglages → Thème) : mouvement, contraste et largeur de la conversation.
 * Chaque choix reste sur l'appareil et se pose sur <html> (data-mouvement, data-contraste, data-largeur) :
 * le CSS fait le reste. Le script de démarrage (app/layout.tsx) les pose avant le premier affichage.
 */
export type Mouvement = 'systeme' | 'reduit';
export type Contraste = 'systeme' | 'eleve';
export type Largeur = 'etroite' | 'moyenne' | 'large';

export const ACCES = {
  mouvement: {
    cle: 'six-mouvement',
    attr: 'mouvement',
    defaut: 'systeme',
    valeurs: ['systeme', 'reduit'],
  },
  contraste: {
    cle: 'six-contraste',
    attr: 'contraste',
    defaut: 'systeme',
    valeurs: ['systeme', 'eleve'],
  },
  largeur: {
    cle: 'six-largeur',
    attr: 'largeur',
    defaut: 'etroite',
    valeurs: ['etroite', 'moyenne', 'large'],
  },
} as const;

type Reglage = keyof typeof ACCES;

export function lireAcces<R extends Reglage>(r: R): (typeof ACCES)[R]['valeurs'][number] {
  const { cle, defaut, valeurs } = ACCES[r];
  try {
    const v = localStorage.getItem(cle);
    if (v && (valeurs as readonly string[]).includes(v))
      return v as (typeof ACCES)[R]['valeurs'][number];
  } catch {
    /* stockage indisponible : réglage par défaut */
  }
  return defaut;
}

export function ecrireAcces<R extends Reglage>(
  r: R,
  v: (typeof ACCES)[R]['valeurs'][number],
): void {
  const { cle, attr, defaut } = ACCES[r];
  const root = document.documentElement;
  try {
    if (v === defaut) localStorage.removeItem(cle);
    else localStorage.setItem(cle, v);
  } catch {
    /* le choix vaut au moins pour cette visite */
  }
  if (v === defaut) root.removeAttribute(`data-${attr}`);
  else root.dataset[attr] = v;
}

/** Vrai si les animations doivent rester calmes : choix fait dans Six, ou réglage du téléphone. */
export function mouvementReduit(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    document.documentElement.dataset.mouvement === 'reduit' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Morceau du script de démarrage : pose les choix d'accessibilité avant le premier affichage. */
export const SCRIPT_ACCES = Object.values(ACCES)
  .map(
    ({ cle, attr, valeurs, defaut }) =>
      `var ${attr}=localStorage.getItem(${JSON.stringify(cle)});if(${JSON.stringify(valeurs.filter((v) => v !== defaut))}.indexOf(${attr})>=0)r.dataset.${attr}=${attr};`,
  )
  .join('');
