import { privacy } from "../content/site";
import { Reveal } from "../components/ui/Reveal";
import styles from "./Privacy.module.css";

export function Privacy() {
  return (
    <section id={privacy.id} className={styles.section} aria-labelledby="privacy-title">
      <div className={`container ${styles.grid}`}>
        <Reveal className={styles.intro}>
          <h2 id="privacy-title">{privacy.title}</h2>
          <p>{privacy.text}</p>
        </Reveal>

        <dl className={styles.points}>
          {privacy.points.map((p, i) => (
            <Reveal key={p.title} delay={i * 80} className={styles.point}>
              <dt>{p.title}</dt>
              <dd>{p.text}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
