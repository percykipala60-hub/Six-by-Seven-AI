import { hero } from "../content/site";
import { AppButton } from "../components/ui/AppButton";
import { BetaButton } from "../components/ui/BetaButton";
import { Reveal } from "../components/ui/Reveal";
import { PhoneShowcase } from "../components/phone/PhoneShowcase";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={`container ${styles.grid}`}>
        <Reveal className={styles.text}>
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

        <Reveal delay={200} className={styles.visual}>
          <PhoneShowcase />
        </Reveal>
      </div>
    </section>
  );
}
