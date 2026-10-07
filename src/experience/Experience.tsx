import { lazy, Suspense, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { experience } from "../content/experience";
import { SixLogo } from "../components/brand/Logos";
import type { LaptopId, PhoneId } from "./ExperienceScene";
import { DesktopGuide, PhoneGuide } from "./Guides";
import { T, range, useTimelineDriver, useTimelineEffect, window01 } from "./timeline";
import styles from "./Experience.module.css";

const ExperienceScene = lazy(() => import("./ExperienceScene"));

const hasWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

// Appareils de la visite, tirés au hasard à chaque visite (forçables par ?phone=android&pc=mac).
function pickDevices(): { phone: PhoneId; laptop: LaptopId } {
  const q = new URLSearchParams(window.location.search);
  const phone = q.get("phone");
  const pc = q.get("pc");
  return {
    phone: phone === "ios" || phone === "android" ? phone : Math.random() < 0.5 ? "ios" : "android",
    laptop: pc === "mac" || pc === "windows" ? pc : Math.random() < 0.5 ? "mac" : "windows",
  };
}

// Visite animée de Six : la scène reste collée à l'écran pendant que la page défile,
// et chaque écran parcouru fait avancer l'histoire.
export function Experience() {
  const section = useRef<HTMLElement>(null);
  const [devices] = useState(pickDevices);
  const [webgl] = useState(hasWebGL);
  useTimelineDriver(section);

  const { phone: P, laptop: L } = experience;
  const captions: CaptionProps[] = [
    { from: T.phoneFront[0] + 0.4, to: T.phoneOpenSix + 0.05, eyebrow: experience.devices[devices.phone], ...P.arrive },
    { from: T.phoneOpenSix, to: T.phoneDive[0] + 0.45, ...P.open },
    { from: T.phoneExit[0] + 0.3, to: T.phoneExit[1] - 0.05, ...P.done },
    { from: T.laptopFront[0] + 0.45, to: T.laptopDive[0] + 0.4, eyebrow: experience.devices[devices.laptop], ...L.arrive },
    { from: T.laptopExit[1] - 0.45, to: T.total + 0.6, place: "top", ...L.done },
  ];

  return (
    <section ref={section} className={styles.section} style={{ "--units": T.total } as CSSProperties} aria-label={experience.title}>
      <div className={styles.stage}>
        <div className={styles.backdrop} aria-hidden="true" />
        {webgl && (
          <Suspense fallback={null}>
            <ExperienceScene phone={devices.phone} laptop={devices.laptop} />
          </Suspense>
        )}
        <Intro />
        {captions.map((c) => (
          <Caption key={c.title} {...c} />
        ))}
        <PhoneGuide />
        <DesktopGuide os={devices.laptop} />
        <Progress />
      </div>
    </section>
  );
}

// Haut de page : titre, logo et invitation à défiler, qui s'effacent dès qu'on avance.
function Intro() {
  const ref = useRef<HTMLDivElement>(null);
  useTimelineEffect((p) => {
    const el = ref.current;
    if (!el) return;
    const o = 1 - range(p, 0.25, 0.8);
    el.style.opacity = String(o);
    el.style.visibility = o > 0 ? "visible" : "hidden";
    el.style.transform = `translateY(${-range(p, 0, 0.8) * 40}px)`;
    el.style.filter = `blur(${range(p, 0.3, 0.8) * 8}px)`;
  });
  return (
    <div ref={ref} className={styles.intro}>
      <SixLogo size={26} />
      <h1>{experience.intro.title}</h1>
      <p>{experience.intro.text}</p>
      <span className={styles.cue}>
        {experience.intro.cue}
        <ChevronDown size={18} />
      </span>
    </div>
  );
}

type CaptionProps = { from: number; to: number; eyebrow?: string; title: string; text: string; place?: "side" | "top" };

// Légende de la scène 3D : elle sort du flou, monte légèrement, puis repart dans le flou.
function Caption({ from, to, eyebrow, title, text, place = "side" }: CaptionProps) {
  const ref = useRef<HTMLDivElement>(null);
  useTimelineEffect((p) => {
    const el = ref.current;
    if (!el) return;
    const o = window01(p, from, to, 0.22);
    const leaving = p > (from + to) / 2;
    el.style.opacity = String(o);
    el.style.visibility = o > 0.001 ? "visible" : "hidden";
    el.style.filter = o < 1 ? `blur(${(1 - o) * 10}px)` : "none";
    el.style.transform = `translateY(${(1 - o) * (leaving ? -24 : 24)}px)`;
  });
  return (
    <div ref={ref} className={styles.caption} data-place={place}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

// Fine barre d'avancement sur le côté.
function Progress() {
  const ref = useRef<HTMLDivElement>(null);
  useTimelineEffect((p) => {
    const el = ref.current;
    if (el) el.style.transform = `scaleY(${p / T.total})`;
  });
  return (
    <div className={styles.progress} aria-hidden="true">
      <div ref={ref} />
    </div>
  );
}
