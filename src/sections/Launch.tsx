import { Globe, Smartphone } from "lucide-react";
import { app, beta, launch, socials } from "../content/site";
import { SocialIcon } from "../components/brand/SocialIcon";
import { AppButton } from "../components/ui/AppButton";
import { BetaButton } from "../components/ui/BetaButton";
import { ParticleField } from "../components/ui/ParticleField";
import { Reveal } from "../components/ui/Reveal";
import { Words } from "../components/ui/Words";
import styles from "./Launch.module.css";

// Section de téléchargement, dans un grand panneau sombre à particules (comme sur antigravity.google) :
// la bêta, l'application ou la version web, puis les réseaux.
export function Launch() {
  const linked = socials.filter((s) => s.href);
  const options = [
    { kind: "download" as const, Icon: Smartphone, copy: app.download },
    { kind: "web" as const, Icon: Globe, copy: app.web },
  ];
  return (
    <section id={app.sectionId} className={styles.section} aria-labelledby="download-title">
      <div className={`surface-dark ${styles.panel}`}>
        <ParticleField theme="dark" density={0.8} />
        <div className={`container ${styles.inner}`}>
        <Reveal className={styles.head}>
          <h2 id="download-title">
            <Words>{launch.title}</Words>
          </h2>
          <p>
            <Words delay={4}>{launch.text}</Words>
          </p>
        </Reveal>

        <Reveal className={styles.beta}>
          <div>
            <p className={styles.betaTag}>{beta.tag}</p>
            <h3>{beta.title}</h3>
            <p>{beta.text}</p>
          </div>
          <BetaButton />
        </Reveal>

        <div className={styles.options}>
          {options.map(({ kind, Icon, copy }, i) => (
            <Reveal key={kind} delay={i * 100} className={styles.option}>
              <div className={styles.optionTop}>
                <Icon size={22} aria-hidden="true" />
                <span className={styles.platforms}>{copy.platforms}</span>
              </div>
              <h3>{copy.title}</h3>
              <p>{copy.text}</p>
              <p className={styles.date}>{launch.date}</p>
              <AppButton kind={kind} long variant="secondary" badge={false} className={styles.optionBtn} />
            </Reveal>
          ))}
        </div>

        <Reveal className={styles.follow}>
          <p>{launch.follow}</p>
          <ul className={styles.socials}>
            {linked.map((s) => (
              <li key={s.id}>
                <a href={s.href} target="_blank" rel="noopener noreferrer">
                  <SocialIcon id={s.id} />
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
        </div>
      </div>
    </section>
  );
}
