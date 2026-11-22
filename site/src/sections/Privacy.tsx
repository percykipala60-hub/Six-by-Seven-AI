import { privacy } from "../content/site";
import styles from "./Privacy.module.css";

export function Privacy() {
  return (
    <section id={privacy.id} className={styles.section} aria-labelledby="privacy-title">
      <div className="container">
        <div className={styles.intro}>
          <h2 id="privacy-title">
            {privacy.title}
          </h2>
          <p>
            {privacy.text}
          </p>
        </div>

        <dl className={styles.points}>
          {privacy.points.map((p) => (
            <div key={p.title} className={styles.point}>
              <dt>
                {p.title}
              </dt>
              <dd>{p.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
