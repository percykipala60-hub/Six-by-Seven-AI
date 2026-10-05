import { sevenAi } from "../content/site";
import { SevenMark, SixMark } from "../components/brand/Logos";
import { Reveal } from "../components/ui/Reveal";
import styles from "./SevenAi.module.css";

// Présentation de l'entreprise à travers l'histoire de ses logos.
export function SevenAi() {
  return (
    <section id={sevenAi.id} className={styles.section} aria-labelledby="seven-title">
      <div className="container">
        <Reveal className={`dark ${styles.card}`}>
          <div className={styles.mark}>
            <SevenMark size={190} title="Seven.AI" />
          </div>
          <div className={styles.text}>
            <p className={styles.label}>{sevenAi.label}</p>
            <h2 id="seven-title">{sevenAi.title}</h2>
            <p className={styles.body}>{sevenAi.text}</p>
            <p className={styles.six}>
              <SixMark size={26} />
              {sevenAi.sixStory}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
