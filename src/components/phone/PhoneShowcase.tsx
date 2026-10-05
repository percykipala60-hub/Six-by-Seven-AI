import { useEffect, useRef, useState } from "react";
import { sceneDuration, scenes, stepDurations } from "../../content/phoneScenes";
import { DevicePhone } from "../phone3d/DevicePhone";
import { AppChat, SixScreen } from "./Screens";
import styles from "./PhoneShowcase.module.css";

// Le téléphone de l'accueil joue seul une suite de scènes, d'une appli à l'autre.
// Étapes : 0 message reçu · 1 ouverture de Six · 2 propositions · 3 choix · 4 retour et envoi.
export function PhoneShowcase() {
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const scene = scenes[index];

  // Pause quand la démo sort de l'écran ou que l'onglet est caché.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let inView = true;
    const update = () => setPlaying(inView && !document.hidden);
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      update();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const last = scene.scam ? 3 : 4;
    const duration = stepDurations[step] + (scene.scam && step === last ? 1200 : 0);
    const id = window.setTimeout(() => {
      if (step < last) setStep(step + 1);
      else {
        setIndex((i) => (i + 1) % scenes.length);
        setStep(0);
      }
    }, duration);
    return () => window.clearTimeout(id);
  }, [playing, step, scene]);

  const goTo = (i: number) => {
    setIndex(i);
    setStep(0);
  };

  const inSix = step >= 1 && step <= 3;
  const sent = !scene.scam && step >= 4 ? scene.suggestions?.[scene.pick ?? 0] : undefined;

  return (
    <div ref={rootRef} className={styles.showcase}>
      <DevicePhone hint swatches finish="silver" label="Démonstration : un message arrive dans une messagerie, Six propose des réponses, la réponse choisie est envoyée.">
        <div key={index} className={styles.scene}>
          <div className={styles.layer} data-hidden={inSix || undefined} data-side="app">
            <AppChat scene={scene} showIncoming={step >= 0} sent={sent} />
          </div>
          <div className={styles.layer} data-hidden={!inSix || undefined} data-side="six">
            <SixScreen scene={scene} step={step} />
          </div>
        </div>
      </DevicePhone>

      <div className={styles.apps} role="tablist" aria-label="Exemples par application">
        {scenes.map((s, i) => (
          <button
            key={s.app}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => goTo(i)}
            className={styles.app}
          >
            {s.appName}
            {i === index && (
              <span
                key={index}
                className={styles.progress}
                style={{
                  animationDuration: `${sceneDuration(s)}ms`,
                  animationPlayState: playing ? "running" : "paused",
                }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
