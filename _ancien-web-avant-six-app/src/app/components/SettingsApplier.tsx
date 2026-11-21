'use client';

import { useEffect } from 'react';
import { applySettings, useSettings } from '@/lib/settings';

/** Applique les réglages au chargement et suit le thème du téléphone en mode « Auto ». */
export function SettingsApplier() {
  const settings = useSettings();
  useEffect(() => {
    applySettings(settings);
    if (settings.theme !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applySettings(settings);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings]);

  // Service worker : hors-ligne et partage depuis WhatsApp. En production seulement.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
