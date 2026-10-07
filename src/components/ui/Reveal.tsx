import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./Reveal.module.css";

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

// Fait apparaître son contenu à chaque fois qu'il entre à l'écran : les textes découpés en mots (<Words>)
// surgissent mot par mot et se collent à leur place ; les autres éléments arrivent du fond et se posent.
export function Reveal({ children, className, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // Entrée : quand le bloc est bien à l'écran. Sortie : quand il l'a entièrement quitté (l'effet se rejouera).
    const enter = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "0px 0px -12% 0px" });
    const leave = new IntersectionObserver(([e]) => !e.isIntersecting && setVisible(false));
    enter.observe(el);
    leave.observe(el);
    return () => {
      enter.disconnect();
      leave.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={[styles.reveal, visible && styles.visible, className].filter(Boolean).join(" ")}
      style={{ "--delay": `${delay}ms` } as CSSProperties}
      data-words={visible ? "on" : "off"}
    >
      {children}
    </div>
  );
}
