import { security } from "../content/site";
import { scenes } from "../content/phoneScenes";
import { Reveal } from "../components/ui/Reveal";
import { DevicePhone } from "../components/phone3d/DevicePhone";
import { SixScreen } from "../components/phone/Screens";
import styles from "./Security.module.css";

const scamScene = scenes.find((s) => s.scam)!;

export function Security() {
  return (
    <section id={security.id} className={`dark ${styles.section}`} aria-labelledby="security-title">
      <div className={`container ${styles.grid}`}>
        <Reveal className={styles.text}>
          <h2 id="security-title" className={styles.title}>
            {security.title}
          </h2>
          <p className={styles.body}>{security.text}</p>
          <p className={styles.note}>{security.note}</p>
        </Reveal>

        <Reveal delay={150}>
          <DevicePhone pose={{ x: 4, y: 18, z: -2 }} model="ultra" finish="rose" label={`${scamScene.scam!.title} : ${scamScene.scam!.text}`}>
            <SixScreen scene={scamScene} step={2} />
          </DevicePhone>
        </Reveal>
      </div>
    </section>
  );
}
