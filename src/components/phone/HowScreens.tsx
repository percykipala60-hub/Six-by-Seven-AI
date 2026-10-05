import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { maskExample } from "../../content/site";
import { howScreens } from "../../content/phoneScenes";
import { SixAppIcon } from "../brand/Logos";
import { StatusBar } from "./Screens";
import styles from "./HowScreens.module.css";

function SixTop({ back }: { back?: boolean }) {
  return (
    <>
      <StatusBar />
      <div className={styles.top}>
        {back ? <ChevronLeft size={24} className={styles.back} /> : <SixAppIcon size={28} />}
        <b>Six</b>
      </div>
    </>
  );
}

// Étape 1 : la discussion collée dans Six.
export function ImportScreen() {
  const s = howScreens.import;
  return (
    <div className={styles.screen}>
      <SixTop />
      <div className={styles.body}>
        <h4 className={styles.title}>{s.title}</h4>
        <div className={styles.segmented}>
          {s.sources.map((src, i) => (
            <span key={src} data-on={i === 0 || undefined}>
              {src}
            </span>
          ))}
        </div>
        <div className={styles.paste}>
          {s.transcript.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <span className={styles.caret} />
        </div>
        <p className={styles.meta}>{s.meta}</p>
        <span className={styles.primary}>{s.action}</span>
      </div>
    </div>
  );
}

// Étape 2 : ce que l'IA va lire, avec bascule automatique vers l'original.
export function VerifyScreen({ active }: { active: boolean }) {
  const s = howScreens.verify;
  const [original, setOriginal] = useState(false);

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setOriginal((o) => !o), 2400);
    return () => window.clearInterval(id);
  }, [active]);

  return (
    <div className={styles.screen}>
      <SixTop back />
      <div className={styles.body}>
        <h4 className={styles.title}>{s.title}</h4>
        <p className={styles.sub}>{s.sub}</p>
        <div className={styles.paste}>
          <p>
            {maskExample.segments.map((seg, i) =>
              typeof seg === "string" ? (
                seg
              ) : (
                <span key={i} className={original ? styles.token : `${styles.token} ${styles.masked}`}>
                  {original ? seg.original : seg.masked}
                </span>
              ),
            )}
          </p>
        </div>
        <div className={styles.switchRow}>
          <span>{s.toggle}</span>
          <span className={styles.switch} data-on={original || undefined}>
            <i />
          </span>
        </div>
        <p className={styles.count}>{s.count}</p>
        <span className={styles.ghost}>{s.add}</span>
        <span className={styles.primary}>{s.action}</span>
      </div>
    </div>
  );
}
