import { hero } from "../content/site";
import { AppButton } from "../components/ui/AppButton";
import { BetaButton } from "../components/ui/BetaButton";
import { Reveal } from "../components/ui/Reveal";
import { PhoneShowcase } from "../components/phone/PhoneShowcase";
import styles from "./Hero.module.css";

// Haut de page : la promesse au centre, puis le téléphone qui joue la démonstration sur une scène claire.
export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <Reveal className={`container ${styles.text}`}>
        <h1 id="hero-title" className={styles.title}>
          {hero.title.split(/(?<=\.) /).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
        <p className={styles.lead}>{hero.lead}</p>
        <div className={styles.ctas}>
          <BetaButton />
          <AppButton kind="download" long variant="secondary" badge={false} />
        </div>
        <p className={styles.meta}>{hero.meta}</p>
      </Reveal>

      <div className="container">
        <Reveal delay={200} className={styles.stage}>
          <PhoneShowcase />
        </Reveal>
      </div>
    </section>
  );
}
