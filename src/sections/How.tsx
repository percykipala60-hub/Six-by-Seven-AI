import { useEffect, useRef, useState } from "react";
import { how } from "../content/site";
import { scenes } from "../content/phoneScenes";
import { Reveal } from "../components/ui/Reveal";
import { DevicePhone } from "../components/phone3d/DevicePhone";
import { ImportScreen, VerifyScreen } from "../components/phone/HowScreens";
import { SixScreen } from "../components/phone/Screens";
import { ScreenZoom } from "../components/ui/ScreenZoom";
import { PHONE_SCREEN_PX } from "../components/phone/screenSize";
import styles from "./How.module.css";

// Récit au défilement : le téléphone reste en place, son écran suit l'étape lue.
export function How() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const screens = (
    <div className={styles.screens}>
      <div className={styles.screenLayer} data-on={active === 0 || undefined}>
        <ImportScreen />
      </div>
      <div className={styles.screenLayer} data-on={active === 1 || undefined}>
        <VerifyScreen active={active === 1} />
      </div>
      <div className={styles.screenLayer} data-on={active === 2 || undefined}>
        <SixScreen scene={scenes[0]} step={3} />
      </div>
    </div>
  );

  return (
    <section id={how.id} className={styles.section} aria-labelledby="how-title">
      <div className="container">
        <Reveal className={styles.head}>
          <h2 id="how-title">{how.title}</h2>
          <p>{how.intro}</p>
        </Reveal>

        <div className={styles.story}>
          <div className={styles.phoneCol}>
            <div className={styles.sticky}>
              <DevicePhone follow={false} finish="burgundy">
                {screens}
              </DevicePhone>
              {/* Sur téléphone : les étapes en onglets juste sous l'appareil, son écran suit le toucher. */}
              <div className={styles.mobileSteps} role="tablist" aria-label="Étapes">
                {how.steps.map((step, i) => (
                  <button key={step.short} type="button" role="tab" aria-selected={active === i} onClick={() => setActive(i)}>
                    {step.short}
                  </button>
                ))}
              </div>
              <p className={styles.mobileText} aria-live="polite">
                <b>{how.steps[active].title}</b>
                {how.steps[active].text}
              </p>
              <div className={styles.zoom}>
                <ScreenZoom kind="phone" model="pro" width={PHONE_SCREEN_PX.w} height={PHONE_SCREEN_PX.h}>
                  {screens}
                </ScreenZoom>
              </div>
            </div>
          </div>

          <ol className={styles.steps}>
            {how.steps.map((step, i) => (
              <li
                key={step.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                data-index={i}
                className={styles.step}
                data-active={active === i || undefined}
              >
                <button type="button" onClick={() => setActive(i)} aria-pressed={active === i}>
                  <span className={styles.stepTitle}>{step.title}</span>
                  <span className={styles.stepText}>{step.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
