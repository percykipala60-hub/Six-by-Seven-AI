import { Smartphone } from "lucide-react";
import { app, hero } from "../content/site";
import { SixLogo } from "../components/brand/Logos";
import { AppButton } from "../components/ui/AppButton";
import { BetaButton } from "../components/ui/BetaButton";
import { ParticleField } from "../components/ui/ParticleField";
import { Reveal } from "../components/ui/Reveal";
import { PhoneShowcase } from "../components/phone/PhoneShowcase";
import styles from "./Hero.module.css";

// Haut de page, dans l'esprit d'antigravity.google : un anneau de particules, le logo, la promesse en grand,
// une carte de téléchargement, puis le téléphone qui joue la démonstration dans un grand panneau sombre.
export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.top}>
        <ParticleField className={styles.particles} />
        <Reveal className={`container ${styles.text}`}>
          <SixLogo size={26} className={styles.logo} />
          <h1 id="hero-title" className={styles.title}>
            {hero.title.split(/(?<=\.) /).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className={styles.lead}>{hero.lead}</p>

          <div className={styles.card}>
            <Smartphone className={styles.cardIcon} aria-hidden="true" />
            <div className={styles.cardBody}>
              <p className={styles.cardTitle}>{app.download.long}</p>
              <p className={styles.cardText}>{hero.meta}</p>
              <div className={styles.ctas}>
                <BetaButton />
                <AppButton kind="download" variant="secondary" badge={false} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      <div className={styles.stageWrap}>
        <Reveal delay={200} className={`surface-dark ${styles.stage}`}>
          <PhoneShowcase />
        </Reveal>
      </div>
    </section>
  );
}
