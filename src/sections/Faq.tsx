import { Plus } from "lucide-react";
import { faq } from "../content/site";
import styles from "./Faq.module.css";

// Questions fréquentes : chaque réponse se déplie sur place, sans script (élément <details>).
export function Faq() {
  return (
    <section id={faq.id} className={styles.section} aria-labelledby="faq-title">
      <div className={`container ${styles.grid}`}>
        <div className={styles.head}>
          <h2 id="faq-title">
            {faq.title}
          </h2>
          <p>
            {faq.intro}
          </p>
        </div>
        <div className={styles.list}>
          {faq.items.map((item) => (
            <details key={item.q} className={styles.item}>
              <summary>
                {item.q}
                <Plus className={styles.icon} size={20} aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
