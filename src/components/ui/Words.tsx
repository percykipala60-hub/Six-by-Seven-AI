import { memo, type CSSProperties } from "react";
import { isTranslated } from "../../i18n/autoTranslate";
import styles from "./Words.module.css";

const TRANSLATED = isTranslated();

// Texte découpé en mots : quand un parent passe en data-words="on", chaque mot surgit de nulle part
// (minuscule, décalé) et vient se coller à sa place, l'un après l'autre.
// Sans parent qui pilote l'effet, le texte s'affiche normalement.
// Mémorisé : un texte inchangé n'est jamais redessiné (les guides se mettent à jour souvent).
export const Words = memo(function Words({ children, delay = 0 }: { children: string; delay?: number }) {
  // Page traduite : texte d'un seul tenant, pour que Google Traduction traduise la phrase entière.
  if (TRANSLATED) return <>{children}</>;
  const words = children.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span
            className={styles.word}
            data-word
            style={
              {
                "--i": i + delay,
                // Point de départ propre à chaque mot, dispersé autour de sa place finale.
                "--dx": `${(((i * 37) % 11) - 5) * 9}px`,
                "--dy": `${(((i * 53) % 9) - 4) * 11}px`,
                "--rot": `${(((i * 29) % 7) - 3) * 4}deg`,
              } as CSSProperties
            }
          >
            {w}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
});
