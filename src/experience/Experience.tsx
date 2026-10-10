import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { experience } from "../content/experience";
import { hero } from "../content/site";
import { SixLogo } from "../components/brand/Logos";
import { AppButton } from "../components/ui/AppButton";
import { preloadStudioHdr } from "../components/phone3d/studioHdr";
import { Words } from "../components/ui/Words";
import type { LaptopId, PhoneId } from "./ExperienceScene";
import { DesktopGuide, PhoneGuide } from "./Guides";
import { useLocation } from "react-router";
import { GUIDE_STOP, SCAM_STOP, T, goToStop, layout, range, useStepScroll, useTimelineDriver, useTimelineEffect, window01 } from "./timeline";
import styles from "./Experience.module.css";

// La 3D (le plus gros fichier du site) commence à se télécharger dès l'ouverture de la page, en même
// temps que le reste, au lieu d'attendre que la page soit affichée : les appareils apparaissent plus tôt.
const sceneModule = import("./ExperienceScene");
const ExperienceScene = lazy(() => sceneModule);
preloadStudioHdr();

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
  // La visite est-elle à l'écran ? Sinon, la 3D se met en pause.
  const [onScreen, setOnScreen] = useState(true);
  // Loin de l'écran (à plus d'un écran et demi) : la 3D est retirée de la page, ce qui libère sa mémoire
  // (modèles, textures, contexte graphique). Elle revient avant qu'on ne remonte jusqu'à elle.
  const [near, setNear] = useState(true);
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    const far = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "150% 0px" });
    io.observe(el);
    far.observe(el);
    return () => {
      io.disconnect();
      far.disconnect();
    };
  }, []);
  useStepScroll(section);
  // Liens du menu « Comment ça marche » (#comment) et « Arnaques » (#securite) : la visite joue la
  // transition jusqu'à l'étape visée. Pas lors d'un rechargement : on reste à l'étape où l'on était.
  const { hash } = useLocation();
  const shownHash = useRef<string | null>(null);
  useEffect(() => {
    if (shownHash.current === hash) return; // même adresse (double passage en développement)
    const first = shownHash.current === null;
    shownHash.current = hash;
    if (first) {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav?.type === "reload" || nav?.type === "back_forward") return;
    }
    const stop = hash === `#${experience.anchor}` ? GUIDE_STOP : hash === `#${experience.scamAnchor}` ? SCAM_STOP : null;
    if (stop !== null) goToStop(stop);
  }, [hash]);

  const { phone: P, laptop: L } = experience;
  const captions: CaptionProps[] = [
    { from: T.phoneFront[0] + 0.4, to: T.phoneOpenSix + 0.05, ...P.arrive },
    { from: T.phoneOpenSix, to: T.phoneDive[0] + 0.45, ...P.open },
    { from: T.phoneExit[0] + 0.3, to: T.phoneExit[1] - 0.05, ...P.done },
    { from: T.laptopFront[0] + 0.45, to: T.laptopDive[0] + 0.4, ...L.arrive },
    { from: T.laptopExit[1] - 0.45, to: T.total + 0.6, place: "top", ...L.done },
  ];

  return (
    <section ref={section} className={styles.section} aria-label={experience.title} data-experience>
      {/* « Comment ça marche » mène directement au guide sur téléphone. */}
      <div id={experience.anchor} className={styles.anchor} />
      <div id={experience.scamAnchor} className={styles.anchor} />
      <div className={styles.stage}>
        <div className={styles.backdrop} aria-hidden="true" />
        {webgl && near && (
          <Suspense fallback={null}>
            <ExperienceScene phone={devices.phone} laptop={devices.laptop} active={onScreen} />
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

// Haut de page : logo, accroche, boutons et invitation à défiler, qui s'effacent dès qu'on avance.
function Intro() {
  const ref = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // Hauteur occupée par le texte (sans le décalage du défilement) : la scène 3D place le cercle en dessous.
  useEffect(() => {
    const el = ref.current;
    const c = content.current;
    if (!el || !c) return;
    const measure = () => {
      if (!el.clientHeight) return;
      layout.introBottom = (c.offsetTop + c.offsetHeight) / el.clientHeight;
      // Invitation masquée (écran peu haut) : le cercle peut descendre jusqu'en bas.
      const k = cue.current;
      layout.cueTop = k && k.offsetParent ? k.offsetTop / el.clientHeight : 0.98;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(c);
    if (cue.current) ro.observe(cue.current);
    measure();
    return () => ro.disconnect();
  }, []);
  useTimelineEffect((p) => {
    const el = ref.current;
    if (!el) return;
    const o = 1 - range(p, 0.25, 0.8);
    el.style.opacity = String(o);
    el.style.visibility = o > 0 ? "visible" : "hidden";
    el.inert = o < 0.5;
    // Fondu et léger glissement (sans flou : animer un flou sur un si grand bloc fait saccader).
    el.style.transform = `translateY(${-range(p, 0, 0.8) * 40}px) scale(${1 - range(p, 0.3, 0.8) * 0.04})`;
  });
  return (
    <div ref={ref} className={styles.intro} data-words={ready ? "on" : "off"}>
      <div ref={content} className={styles.introContent}>
      <SixLogo size={26} />
      <h1>
        {hero.title.split(/(?<=\.) /).map((line, k) => (
          <span key={line}>
            <Words delay={k * 2}>{line}</Words>
          </span>
        ))}
      </h1>
      <p>
        <Words delay={5}>{hero.lead}</Words>
      </p>
      <div className={styles.introActions}>
        <AppButton kind="download" />
      </div>
      <p className={styles.introMeta}>{hero.meta}</p>
      </div>
      <span ref={cue} className={styles.cue}>
        <b>{experience.intro.cue}</b>
        <span>{experience.intro.cueHint}</span>
        <ChevronDown size={18} />
      </span>
    </div>
  );
}

type CaptionProps = { from: number; to: number; title: string; text: string; place?: "side" | "top" };

// Légende de la scène 3D : ses mots se collent un à un à l'arrivée, puis elle s'efface en s'éloignant.
function Caption({ from, to, title, text, place = "side" }: CaptionProps) {
  const ref = useRef<HTMLDivElement>(null);
  useTimelineEffect((p) => {
    const el = ref.current;
    if (!el) return;
    const o = window01(p, from, to, 0.22);
    const leaving = p > (from + to) / 2;
    // Les mots se collent à l'arrivée ; au départ, la légende s'efface et s'éloigne.
    el.dataset.words = o > 0.05 ? "on" : "off";
    el.style.opacity = String(leaving ? o : Math.min(1, o * 4));
    el.style.visibility = o > 0.001 ? "visible" : "hidden";
    el.style.transform = leaving ? `translateY(${(1 - o) * -24}px) scale(${0.96 + o * 0.04})` : "none";
  });
  return (
    <div ref={ref} className={styles.caption} data-place={place}>
      <h2>
        <Words>{title}</Words>
      </h2>
      <p>
        <Words delay={title.split(" ").length + 2}>{text}</Words>
      </p>
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
