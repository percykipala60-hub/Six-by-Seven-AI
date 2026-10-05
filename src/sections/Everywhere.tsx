import { everywhere } from "../content/site";
import { Reveal } from "../components/ui/Reveal";
import styles from "./Everywhere.module.css";

export function Everywhere() {
  return (
    <section className={styles.section} aria-labelledby="everywhere-title">
      <div className="container">
        <Reveal className={styles.grid}>
          <h2 id="everywhere-title">{everywhere.title}</h2>
          <p>{everywhere.text}</p>
        </Reveal>
        <Reveal delay={100} className={styles.apps}>
          <p className={styles.appsLabel}>{everywhere.appsLabel}</p>
          <ul>
            {everywhere.apps.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
