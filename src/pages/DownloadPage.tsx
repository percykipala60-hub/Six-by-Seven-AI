import { useEffect, useMemo } from "react";
import { Download, Laptop, Monitor, Smartphone, TabletSmartphone } from "lucide-react";
import { app, downloadPage, type PlatformId } from "../content/site";
import { AppButton } from "../components/ui/AppButton";
import { SixAppIcon } from "../components/brand/Logos";
import styles from "./DownloadPage.module.css";

const icons: Record<PlatformId, typeof Smartphone> = {
  ios: Smartphone,
  android: TabletSmartphone,
  mac: Laptop,
  windows: Monitor,
};

// Devine l'appareil du visiteur pour mettre sa version en avant.
function detectPlatform(): PlatformId | null {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua)) return navigator.maxTouchPoints > 1 ? "ios" : "mac";
  if (/Windows/i.test(ua)) return "windows";
  return null;
}

export function DownloadPage() {
  const detectedId = useMemo(detectPlatform, []);
  const detected = app.platforms.find((p) => p.id === detectedId);

  useEffect(() => {
    document.title = `${downloadPage.title} · Six by Seven.AI`;
    return () => {
      document.title = "Six by Seven.AI";
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className="container">
        <header className={styles.head}>
          <SixAppIcon size={64} />
          <h1>{downloadPage.title}</h1>
          <p>{downloadPage.intro}</p>
        </header>

        {detected && (
          <section className={styles.featured} aria-label={downloadPage.detected}>
            <div className={styles.featuredText}>
              <p className={styles.label}>{downloadPage.detected}</p>
              <h2>Six pour {detected.name}</h2>
              <p className={styles.system}>{detected.system}</p>
            </div>
            <PlatformAction url={detected.url} large />
          </section>
        )}

        <h2 className={styles.gridTitle}>{downloadPage.others}</h2>
        <ul className={styles.grid}>
          {app.platforms.map((p) => {
            const Icon = icons[p.id];
            return (
              <li key={p.id} className={styles.card} data-current={p.id === detectedId || undefined}>
                <Icon size={26} aria-hidden="true" className={styles.icon} />
                <h3>{p.name}</h3>
                <p>{p.system}</p>
                <PlatformAction url={p.url} />
              </li>
            );
          })}
        </ul>

        <section id="web" className={styles.web}>
          <div>
            <h2>{downloadPage.webTitle}</h2>
            <p>{downloadPage.webText}</p>
          </div>
          <AppButton kind="web" long variant="light" />
        </section>
      </div>
    </div>
  );
}

// Bouton de téléchargement d'une plateforme, ou la date de sortie tant que le lien n'existe pas.
function PlatformAction({ url, large }: { url: string; large?: boolean }) {
  if (!url) {
    return <span className={large ? `${styles.soon} ${styles.soonLarge}` : styles.soon}>{downloadPage.soon}</span>;
  }
  return (
    <a className={large ? `${styles.dl} ${styles.dlLarge}` : styles.dl} href={url} rel="noopener noreferrer">
      <Download size={large ? 18 : 16} aria-hidden="true" />
      {downloadPage.download}
    </a>
  );
}
