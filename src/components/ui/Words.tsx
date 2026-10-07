import type { CSSProperties } from "react";
import styles from "./Words.module.css";

// Texte découpé en mots : quand un parent passe en data-words="on", chaque mot surgit de nulle part
// (minuscule, flou, décalé) et vient se coller à sa place, l'un après l'autre.
// Sans parent qui pilote l'effet, le texte s'affiche normalement.
export function Words({ children, delay = 0 }: { children: string; delay?: number }) {
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
}
