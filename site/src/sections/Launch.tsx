import { Globe, Smartphone } from "lucide-react";
import { app, launch, socials } from "../content/site";
import { SocialIcon } from "../components/brand/SocialIcon";
import { AppButton } from "../components/ui/AppButton";
import { WaveField } from "../components/ui/WaveField";
import styles from "./Launch.module.css";

// Section de téléchargement, dans un grand panneau bleu nuit parcouru de vagues (façon PS4) :
// l'application ou la version web, puis les réseaux.
export function Launch() {
  const linked = socials.filter((s) => s.href);
  const options = [
    { kind: "download" as const, Icon: Smartphone, copy: app.download },
    { kind: "web" as const, Icon: Globe, copy: app.web },
  ];
  return (
    <section id={app.sectionId} className={styles.section} aria-labelledby="download-title">
      <div className={`surface-dark ${styles.panel}`}>
        <WaveField theme="dark" />
        <div className={`container ${styles.inner}`}>
        <div className={styles.head}>
          <h2 id="download-title">
            {launch.title}
          </h2>
          <p>
            {launch.text}
          </p>
        </div>

        <div className={styles.options}>
          {options.map(({ kind, Icon, copy }) => (
            <div key={kind} className={styles.option}>
              <div className={styles.optionTop}>
                <Icon size={22} aria-hidden="true" />
                <span className={styles.platforms}>{copy.platforms}</span>
              </div>
              <h3>{copy.title}</h3>
              <p>{copy.text}</p>
              <AppButton kind={kind} variant="secondary" className={styles.optionBtn} />
            </div>
          ))}
        </div>

        <div className={styles.follow}>
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
        </div>
        </div>
      </div>
    </section>
  );
}
