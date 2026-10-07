import { privacy } from "../content/site";
import { Reveal } from "../components/ui/Reveal";
import { Words } from "../components/ui/Words";
import styles from "./Privacy.module.css";

export function Privacy() {
  return (
    <section id={privacy.id} className={styles.section} aria-labelledby="privacy-title">
      <div className="container">
        <Reveal className={styles.intro}>
          <h2 id="privacy-title">
            <Words>{privacy.title}</Words>
          </h2>
          <p>
            <Words delay={5}>{privacy.text}</Words>
          </p>
        </Reveal>

        <dl className={styles.points}>
          {privacy.points.map((p, i) => (
            <Reveal key={p.title} delay={i * 80} className={styles.point}>
              <dt>
                <Words>{p.title}</Words>
              </dt>
              <dd>{p.text}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
