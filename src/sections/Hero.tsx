import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { app, hero } from "../content/site";
import { AppButton } from "../components/ui/AppButton";
import { Reveal } from "../components/ui/Reveal";
import { PhoneShowcase } from "../components/phone/PhoneShowcase";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={`dark ${styles.hero}`} aria-labelledby="hero-title">
      <div className={`container ${styles.grid}`}>
        <Reveal className={styles.text}>
          <h1 id="hero-title" className={styles.title}>
            {hero.title.split(/(?<=\.) /).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className={styles.lead}>{hero.lead}</p>
          <div className={styles.ctas}>
            <AppButton kind="download" long variant="light" />
            <AppButton kind="web" long variant="outlineDark" />
          </div>
          <p className={styles.meta}>
            <span>{app.release}</span>
            <span aria-hidden="true">·</span>
            <span>{app.download.platforms}</span>
            <Link to={`/${hero.more.href}`} className={styles.textLink}>
              {hero.more.label}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </p>
        </Reveal>

        <Reveal delay={200} className={styles.visual}>
          <PhoneShowcase />
        </Reveal>
      </div>
    </section>
  );
}
