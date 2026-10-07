import type { CSSProperties } from "react";
import { ClipboardPaste, Copy, EyeOff, Lock, MessagesSquare, ShieldAlert, Smartphone, Sparkles, WifiOff } from "lucide-react";
import { manifesto } from "../content/site";
import { Reveal } from "../components/ui/Reveal";
import styles from "./Manifesto.module.css";

// Une rangée d'icônes rondes qui ondule, puis la phrase manifeste en grand,
// comme le bloc d'introduction d'antigravity.google.
const ICONS = [ClipboardPaste, MessagesSquare, EyeOff, Sparkles, ShieldAlert, Copy, Lock, WifiOff, Smartphone];

export function Manifesto() {
  return (
    <section className={styles.section} aria-label="Six en une phrase">
      <div className={styles.row} aria-hidden="true">
        {ICONS.map((Icon, i) => (
          <span key={i} className={styles.chip} style={{ "--i": i } as CSSProperties}>
            <Icon />
          </span>
        ))}
      </div>
      <Reveal className="container">
        <p className={styles.text}>
          {manifesto.text}
          <span className={styles.caret} aria-hidden="true" />
        </p>
      </Reveal>
    </section>
  );
}
