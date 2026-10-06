import { useEffect, useMemo } from "react";
import { ArrowUpRight, Download, Globe } from "lucide-react";
import { Link } from "react-router";
import { app, beta, downloadPage, type PlatformId } from "../content/site";
import { DeviceShowcase } from "../components/phone3d/DeviceShowcase";
import styles from "./DownloadPage.module.css";

// Devine l'appareil du visiteur pour lui proposer directement sa version.
function detectPlatform(): PlatformId | null {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua)) return navigator.maxTouchPoints > 1 ? "ios" : "mac";
  if (/Windows/i.test(ua)) return "windows";
  return null;
}

// Photos produit des appareils, tirées des modèles 3D du site (fond transparent).
const PHOTO: Record<PlatformId, string> = {
  ios: "/devices/iphone.webp",
  android: "/devices/android.webp",
  mac: "/devices/mac.webp",
  windows: "/devices/windows.webp",
};

// Page de téléchargement, à la manière d'une page produit : tuiles de choix de l'appareil,
// démonstration 3D, puis une fiche par plateforme avec sa photo et ses boutons.
export function DownloadPage() {
  const detectedId = useMemo(detectPlatform, []);

  useEffect(() => {
    document.title = `${downloadPage.title} · Six by Seven.AI`;
    return () => {
      document.title = "Six by Seven.AI";
    };
  }, []);

  const betaHref = beta.url || "#beta";
  const betaTarget = beta.url ? { target: "_blank", rel: "noopener noreferrer" } : {};

  return (
    <div className={styles.page}>
      <header className={`container ${styles.head}`}>
        <div>
          <h1>{downloadPage.title}</h1>
          <p className={styles.intro}>{downloadPage.intro}</p>
        </div>
        <div className={styles.primary}>
          {/* Action principale : la bêta, seule version disponible avant la sortie. */}
          <a className={styles.mainBtn} href={betaHref} {...betaTarget}>
            {beta.open}
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
          <p className={styles.release}>{beta.finalRelease}</p>
        </div>
      </header>

      {/* Tuiles de choix de l'appareil : elles mènent à la fiche correspondante. */}
      <nav className={styles.tilesWrap} aria-label="Choisir un appareil">
        <ul className={`container ${styles.tiles}`}>
          {app.platforms.map((p) => (
            <li key={p.id}>
              <a href={`#${p.id}`} className={styles.tile}>
                <span>
                  <b>{p.name}</b>
                </span>
                <img src={PHOTO[p.id]} alt="" loading="lazy" />
              </a>
            </li>
          ))}
          <li>
            <a href="#web" className={styles.tile}>
              <span>
                <b>{app.web.title}</b>
              </span>
              <Globe className={styles.tileIcon} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </nav>

      <div className={`container ${styles.stage}`}>
        {/* Carrousel des appareils en 3D : commence par celui du visiteur. */}
        <DeviceShowcase initial={detectedId} />
      </div>

      <section id="plateformes" className={`container ${styles.cards}`} aria-labelledby="plateformes-title">
        <h2 id="plateformes-title">{downloadPage.others}</h2>
        <ul className={styles.grid}>
          {app.platforms.map((p) => (
            <li key={p.id} id={p.id} className={styles.card}>
              <img src={PHOTO[p.id]} alt={`Six sur ${p.name}`} loading="lazy" />
              <h3>{p.name}</h3>
              <p className={styles.system}>{p.system}</p>
              <p className={styles.status}>{p.url ? downloadPage.available : app.release}</p>
              <div className={styles.cardActions}>
                {p.url ? (
                  <a className={styles.pillDark} href={p.url} rel="noopener noreferrer">
                    <Download size={16} aria-hidden="true" />
                    {downloadPage.download}
                  </a>
                ) : (
                  <span className={styles.pillDark} aria-disabled="true">
                    <Download size={16} aria-hidden="true" />
                    {app.releaseShort}
                  </span>
                )}
                <a className={styles.pillLine} href={betaHref} {...betaTarget}>
                  {beta.short}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>

        {/* Version web : pas d'installation, une fiche en longueur. */}
        <div id="web" className={`${styles.card} ${styles.wide}`}>
          <Globe className={styles.webIcon} aria-hidden="true" />
          <div>
            <h3>{app.web.title}</h3>
            <p className={styles.system}>{app.web.text}</p>
            <p className={styles.status}>{app.webUrl ? downloadPage.available : app.release}</p>
          </div>
          <div className={styles.cardActions}>
            {app.webUrl ? (
              <a className={styles.pillDark} href={app.webUrl} target="_blank" rel="noopener noreferrer">
                {downloadPage.open}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            ) : (
              <span className={styles.pillDark} aria-disabled="true">
                {app.releaseShort}
              </span>
            )}
            <a className={styles.pillLine} href={betaHref} {...betaTarget}>
              {beta.label}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section id="beta" className={`container ${styles.beta}`}>
        <div>
          <p className={styles.betaTag}>{beta.tag}</p>
          <h2>{beta.title}</h2>
          <p>{beta.text}</p>
        </div>
        {beta.url ? (
          <a className={styles.mainBtn} href={beta.url} target="_blank" rel="noopener noreferrer">
            {beta.label}
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        ) : (
          <span className={styles.pending}>{beta.pending}</span>
        )}
      </section>

      <p className={`container ${styles.help}`}>
        {downloadPage.help} <Link to="/legal/utilisation-ia">{downloadPage.helpLink}</Link>
      </p>
    </div>
  );
}
