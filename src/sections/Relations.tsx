import { relations } from "../content/site";
import { Reveal } from "../components/ui/Reveal";
import { Words } from "../components/ui/Words";
import shared from "./Privacy.module.css";
import styles from "./Relations.module.css";

// Six pour toutes les relations et toutes les cultures. Même présentation que la section confidentialité.
export function Relations() {
  return (
    <section id={relations.id} className={styles.section} aria-labelledby="relations-title">
      <div className="container">
        <Reveal className={shared.intro}>
          <h2 id="relations-title">
            <Words>{relations.title}</Words>
          </h2>
          <p>
            <Words delay={5}>{relations.text}</Words>
          </p>
        </Reveal>

        <dl className={shared.points}>
          {relations.points.map((p, i) => (
            <Reveal key={p.title} delay={i * 80} className={shared.point}>
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
