import { relations } from "../content/site";
import shared from "./Privacy.module.css";
import styles from "./Relations.module.css";

// Six pour toutes les relations et toutes les cultures. Même présentation que la section confidentialité.
export function Relations() {
  return (
    <section id={relations.id} className={styles.section} aria-labelledby="relations-title">
      <div className="container">
        <div className={shared.intro}>
          <h2 id="relations-title">
            {relations.title}
          </h2>
          <p>
            {relations.text}
          </p>
        </div>

        <dl className={shared.points}>
          {relations.points.map((p) => (
            <div key={p.title} className={shared.point}>
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
