import { useEffect, useMemo } from "react";
import { ArrowRight, ArrowUpRight, Download } from "lucide-react";
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

// Page de téléchargement, mise en page éditoriale : un en-tête avec l'action principale,
// puis la liste des plateformes séparées par de fins traits, et la bêta en une ligne.
export function DownloadPage() {
  const detectedId = useMemo(detectPlatform, []);

  useEffect(() => {
    document.title = `${downloadPage.title} · Six by Seven.AI`;
    return () => {
      document.title = "Six by Seven.AI";
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={`container ${styles.hero}`}>
        <div className={styles.heroText}>
          <h1>{downloadPage.title}</h1>
          <p className={styles.intro}>{downloadPage.intro}</p>

          {/* Action principale : la bêta, seule version disponible avant la sortie. */}
          <div className={styles.primary}>
            <a
              className={styles.mainBtn}
              href={beta.url || "#beta"}
              {...(beta.url ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {beta.open}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <p className={styles.release}>{beta.finalRelease}</p>
          </div>

          <a className={styles.webLink} href="#plateformes">
            {downloadPage.otherLink}
            <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>

        <div className={styles.heroVisual}>
          {/* Carrousel des appareils : commence par celui du visiteur. */}
          <DeviceShowcase initial={detectedId} />
        </div>
      </div>

      <section id="plateformes" className={`container ${styles.list}`} aria-labelledby="plateformes-title">
        <h2 id="plateformes-title">{downloadPage.others}</h2>
        <ul>
          {app.platforms.map((p) => (
            <li key={p.id} className={styles.row}>
              <span className={styles.name}>
                {p.name}
                {p.id === detectedId && <span className={styles.yours}>{downloadPage.yours}</span>}
              </span>
              <span className={styles.system}>{p.system}</span>
              <span className={styles.action}>
                {p.url ? (
                  <a href={p.url} rel="noopener noreferrer">
                    {downloadPage.download}
                    <Download size={15} aria-hidden="true" />
                  </a>
                ) : (
                  <span className={styles.pending}>{app.release}</span>
                )}
              </span>
            </li>
          ))}
          <li id="web" className={styles.row}>
            <span className={styles.name}>{app.web.title}</span>
            <span className={styles.system}>{app.web.platforms}</span>
            <span className={styles.action}>
              {app.webUrl ? (
                <a href={app.webUrl} target="_blank" rel="noopener noreferrer">
                  {downloadPage.open}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              ) : (
                <span className={styles.pending}>{app.release}</span>
              )}
            </span>
          </li>
        </ul>
      </section>

      <section id="beta" className={`container ${styles.beta}`}>
        <div>
          <h2>{beta.title}</h2>
          <p>{beta.text}</p>
        </div>
        {beta.url ? (
          <a className={styles.betaLink} href={beta.url} target="_blank" rel="noopener noreferrer">
            {beta.label}
            <ArrowUpRight size={16} aria-hidden="true" />
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
