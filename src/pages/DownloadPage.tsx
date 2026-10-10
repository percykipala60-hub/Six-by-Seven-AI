import { useMemo } from "react";
import { ArrowUpRight, Download, Globe } from "lucide-react";
import { Link } from "react-router";
import { app, downloadPage, type PlatformId } from "../content/site";
import { DeviceShowcase } from "../components/phone3d/DeviceShowcase";
import { usePageMeta } from "../hooks/usePageMeta";
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

// Page de téléchargement, à la manière d'une page produit : l'action principale, la démonstration 3D
// (le seul visuel), puis une fiche par plateforme avec son statut et ses boutons.
export function DownloadPage() {
  const detectedId = useMemo(detectPlatform, []);

  usePageMeta({ title: downloadPage.title, description: downloadPage.intro });

  // Bouton principal : le lien de l'appareil du visiteur s'il est publié, sinon sa fiche plus bas.
  const detected = app.platforms.find((p) => p.id === detectedId);
  const mainHref = detected?.url || `#${detected?.id ?? "plateformes"}`;

  return (
    <div className={styles.page}>
      <header className={`container ${styles.head}`}>
        <div>
          <h1>{downloadPage.title}</h1>
          <p className={styles.intro}>{downloadPage.intro}</p>
        </div>
        <div className={styles.primary}>
          <a className={styles.mainBtn} href={mainHref}>
            <Download size={18} aria-hidden="true" />
            {detected ? `${downloadPage.mainFor} ${detected.name}` : downloadPage.main}
          </a>
          <p className={styles.release}>{downloadPage.release}</p>
        </div>
      </header>

      <div className={`container ${styles.stage}`}>
        {/* Carrousel des appareils en 3D : commence par celui du visiteur. */}
        <DeviceShowcase initial={detectedId} />
      </div>

      <section id="plateformes" className={`container ${styles.cards}`} aria-labelledby="plateformes-title">
        <h2 id="plateformes-title">{downloadPage.others}</h2>
        <ul className={styles.grid}>
          {app.platforms.map((p) => (
            <li key={p.id} id={p.id} className={styles.card}>
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
                  // Avant la sortie : le même bouton, non cliquable (la date est écrite juste au-dessus).
                  <span className={styles.pillDark} aria-disabled="true" title={app.release}>
                    <Download size={16} aria-hidden="true" />
                    {downloadPage.download}
                  </span>
                )}
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
              <span className={styles.pillDark} aria-disabled="true" title={app.release}>
                {downloadPage.open}
                <ArrowUpRight size={16} aria-hidden="true" />
              </span>
            )}
          </div>
        </div>
      </section>

      <p className={`container ${styles.help}`}>
        {downloadPage.help} <Link to="/legal/utilisation-ia">{downloadPage.helpLink}</Link>
      </p>
    </div>
  );
}
