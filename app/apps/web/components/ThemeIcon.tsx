'use client';

import { useEffect } from 'react';
import { applyThemeIcon } from '@/lib/theme-icon';

/** Au chargement, et quand le téléphone passe en clair ou en sombre, la barre et l'icône suivent le thème. */
export function ThemeIcon() {
  useEffect(() => {
    applyThemeIcon();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyThemeIcon();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return null;
}
