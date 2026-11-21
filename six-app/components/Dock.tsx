"use client";

import { useEffect, useState } from "react";
import { AppIcon, type AppId } from "./AppIcon";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

// Ouvre l'app du réseau sur le téléphone (lien d'application), avec la vraie icône de l'app (components/AppIcon.tsx).
// Ordre : priorités de la matrice des réseaux. Six n'est affilié à aucune de ces apps.
const APPS: { id: AppId; label: string; href: string }[] = [
  { id: "whatsapp", label: "WhatsApp", href: "whatsapp://" },
  { id: "sms", label: "Messages", href: "sms:" },
  { id: "email", label: "Gmail", href: "mailto:" },
  { id: "messenger", label: "Messenger", href: "fb-messenger://" },
  { id: "instagram", label: "Instagram", href: "instagram://" },
  { id: "telegram", label: "Telegram", href: "tg://" },
  { id: "linkedin", label: "LinkedIn", href: "linkedin://" },
  { id: "tiktok", label: "TikTok", href: "tiktok://" },
];

/** Dernier rang : rejoindre Six (moteur de moto-taxi Kin Rush sur /jeu). */
export const APP_KINRUSH: { label: string; href: string } = { label: "Installer Kin Rush", href: "/jeu" };
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Barre du bas de l'accueil : installer Six (il apparaît alors dans le menu « Partager » des messageries)
 * et ouvrir directement le réseau où l'on écrit.
 */
export function Dock() {
  const [installe, setInstalle] = useState(false);
  const [invite, setInvite] = useState<InstallEvent | null>(null);
  const [aide, setAide] = useState(false);
  const [teleportKinh, setTeleportKinh] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setInstalle(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
    const garder = (e: Event) => {
      e.preventDefault(); // on garde l'invitation pour la proposer au bon moment
      setInvite(e as InstallEvent);
    };
    const fini = () => {
      setInstalle(true);
      setInvite(null);
    };
    window.addEventListener("beforeinstallprompt", garder);
    window.addEventListener("appinstalled", fini);
    return () => {
      window.removeEventListener("beforeinstallprompt", garder);
      window.removeEventListener("appinstalled", fini);
    };
  }, []);

  async function installer() {
    if (!invite) {
      setAide((v) => !v);
      return;
    }
    await invite.prompt();
    const { outcome } = await invite.userChoice;
    if (outcome === "accepted") setInstalle(true);
    setInvite(null);
  }

  function kinRush() {
    setTeleportKinh(true);
    window.location.href = APP_KINRUSH.href;
  }

  return (
    <section className="dock" aria-labelledby="dock-titre">
      <h2 className="sr" id="dock-titre">
        Ouvrir une app
      </h2>
      <div className="dock-row">
        {APPS.map((a) => (
          <a key={a.id} className="dock-app" href={a.href} aria-label={`Ouvrir ${a.label}`}>
            <AppIcon id={a.id} />
            {a.label}
          </a>
        ))}
        {installe ? (
          <span className="dock-app" title="Six est installé">
            <span className="dock-ico dock-ico dock-ok">
              <Icon name="check" size={20} stroke={2.6} />
            </span>
            Installé
          </span>
        ) : (
          <button className="dock-app dock-six" onClick={installer} aria-expanded={invite ? undefined : aide}>
            <span className="dock-ico dock-ico">
              <Logo small label="" />
            </span>
            Installer
          </button>
        )}
        <a className="dock-app dock-kin" href={APP_KINRUSH.href} aria-label={APP_KINRUSH.label}>
          <span className="dock-ico dock-kin-ico" aria-hidden="true">
            <Logo small label="" />
          </span>
          {APP_KINRUSH.label}
        </a>
      </div>
      {installe ? (
        <p className="muted small">Dans WhatsApp ou une autre app : Partager, puis Six. La discussion arrive ici, déjà prête à masquer.</p>
      ) : (
        <button className="muted small dock-kin-link" type="button" onClick={kinRush}>Kin Rush — moteur de moto-taxi six ou sept</button>
      )}
      {aide && (
        <p className="muted small" role="status">
          Menu du navigateur, puis « Installer l&apos;application » (Android) ou Partager, puis « Sur l&apos;écran d&apos;accueil » (iPhone). Six apparaît ensuite dans le menu Partager de tes messageries.
        </p>
      )}
      {teleportKinh && (
        <p className="muted small" role="status">
          Bientôt disponible hors ligne, sur ton téléphone. Pour l&apos;instant, Kin Rush démarre dans le navigateur. Ton score reste sur cet appareil.
        </p>
      )}
    </section>
  );
}
