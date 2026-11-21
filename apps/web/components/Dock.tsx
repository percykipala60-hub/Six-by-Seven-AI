'use client';

import { AppIcon, type AppId } from './AppIcon';

// Ouvre l'app du réseau sur le téléphone (lien d'application), avec la vraie icône de l'app (components/AppIcon.tsx).
// Ordre : priorités de la matrice des réseaux. Six n'est affilié à aucune de ces apps.
const APPS: { id: AppId; label: string; href: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', href: 'whatsapp://' },
  { id: 'sms', label: 'Messages', href: 'sms:' },
  { id: 'email', label: 'Gmail', href: 'mailto:' },
  { id: 'messenger', label: 'Messenger', href: 'fb-messenger://' },
  { id: 'instagram', label: 'Instagram', href: 'instagram://' },
  { id: 'facebook', label: 'Facebook', href: 'fb://' },
  { id: 'telegram', label: 'Telegram', href: 'tg://' },
  { id: 'linkedin', label: 'LinkedIn', href: 'linkedin://' },
  { id: 'tiktok', label: 'TikTok', href: 'tiktok://' },
];

/** Rangée d'icônes d'apps : rouvrir la messagerie où l'on écrit (fin du parcours). */
export function AppsRow({ label = 'Ouvrir une app' }: { label?: string }) {
  return (
    <div className="retour-apps" role="group" aria-label={label}>
      {APPS.map((a) => (
        <a key={a.id} className="dock-app" href={a.href} aria-label={`Ouvrir ${a.label}`}>
          <AppIcon id={a.id} />
          {a.label}
        </a>
      ))}
    </div>
  );
}
