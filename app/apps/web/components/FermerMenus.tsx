'use client';

import { useEffect } from 'react';

/** Menus ouverts avec <details> (Plus, utilisation, jetons…) : ils se ferment en cliquant ailleurs ou avec Échap. */
const MENUS = '.drawer-plus, .six-utilisation, .seven-jetons, details[data-menu]';

export function fermerMenusDehors(cible: Node | null, racine: ParentNode = document): void {
  racine.querySelectorAll<HTMLDetailsElement>(MENUS).forEach((d) => {
    if (d.open && !(cible && d.contains(cible))) d.open = false;
  });
}

export function FermerMenus() {
  useEffect(() => {
    const clic = (e: PointerEvent) => fermerMenusDehors(e.target as Node);
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermerMenusDehors(null);
    };
    document.addEventListener('pointerdown', clic);
    document.addEventListener('keydown', touche);
    return () => {
      document.removeEventListener('pointerdown', clic);
      document.removeEventListener('keydown', touche);
    };
  }, []);
  return null;
}
