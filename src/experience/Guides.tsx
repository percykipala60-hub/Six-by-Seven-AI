import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, Copy, Minus, Search, Square, TriangleAlert, X } from "lucide-react";
import { experience } from "../content/experience";
import { howScreens, scenes } from "../content/phoneScenes";
import { maskExample, security } from "../content/site";
import { SixAppIcon } from "../components/brand/Logos";
import { Words } from "../components/ui/Words";
import { MessagingAppIcon } from "../components/brand/MessagingAppIcon";
import { AppChat as AppChatScreen, SixScreen as SixScreenBase, StatusBar } from "../components/phone/Screens";
import { PHONE_SCREEN_PX } from "../components/phone/screenSize";
import type { LaptopId } from "./ExperienceScene";
import { phoneOverlayAt, laptopOverlayAt } from "./overlays";
import { T, stepAt, useTimeline, useTimelineEffect } from "./timeline";
import how from "../components/phone/HowScreens.module.css";
import desk from "../components/phone/DesktopScreen.module.css";
import styles from "./Experience.module.css";

// ---------- Outils communs ----------

// Écrans de l'appli mémorisés : pendant une étape, seul l'écran en cours est redessiné.
const SixScreen = memo(SixScreenBase);
const AppChat = memo(AppChatScreen);

// Avancement dans le guide, arrondi au vingtième d'étape : le guide ne se redessine qu'à chaque palier.
function useGuideStep(range: readonly [number, number], count: number) {
  const q = useTimeline((p) => {
    const { i, s } = stepAt(p, range, count);
    return i * 100 + Math.floor(s * 20);
  });
  return { i: Math.floor(q / 100), s: (q % 100) / 20 };
}

// Fondu du guide entier, lu à chaque image : il apparaît au bout de la plongée dans l'écran.
function useOverlay(ref: React.RefObject<HTMLDivElement | null>, opacity: (p: number) => number) {
  const [shown, setShown] = useState(false);
  useTimelineEffect((p) => {
    const el = ref.current;
    if (!el) return;
    const o = opacity(p);
    el.style.opacity = String(o);
    el.style.visibility = o > 0.001 ? "visible" : "hidden";
    // Léger recul à l'entrée : on a l'impression de traverser la vitre.
    el.style.setProperty("--enter", String(o));
    if (o > 0.5 !== shown) setShown(o > 0.5);
  });
  return shown;
}

// Met à l'échelle un contenu dessiné à taille fixe pour qu'il tienne dans son cadre.
function Fit({ w, h, children, className }: { w: number; h: number; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setK(Math.min(width / w, height / h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return (
    <div ref={box} className={[styles.fit, className].filter(Boolean).join(" ")}>
      <div style={{ width: w, height: h, transform: `scale(${k})`, flex: "none" }}>{children}</div>
    </div>
  );
}

// Toutes les étapes du guide, téléphone puis ordinateur, numérotées à la suite.
const ALL_STEPS = [...experience.phoneGuide, ...experience.desktopGuide];

// Colonne de texte : l'étape en cours apparaît en sortant du flou, la précédente s'efface.
// `i` est le numéro de l'étape dans le guide entier (0 à 6) ; seule une fine barre d'avancement l'indique.
const StepText = memo(function StepText({ i }: { i: number }) {
  const steps = ALL_STEPS;
  return (
    <div className={styles.stepText}>
      <div className={styles.stepCount} aria-hidden="true">
        {steps.map((_, k) => (
          <span key={k} data-on={k <= i || undefined} />
        ))}
      </div>
      <div className={styles.stepStack}>
        {steps.map((s, k) => (
          <div
            key={s.title}
            className={styles.stepItem}
            data-state={k === i ? "on" : k < i ? "past" : "next"}
            data-words={k === i ? "on" : "off"}
            aria-hidden={k !== i}
          >
            <h2>
              <Words>{s.title}</Words>
            </h2>
            <p>
              <Words delay={s.title.split(" ").length + 2}>{s.text}</Words>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
});

// ---------- Guide sur téléphone ----------

export function PhoneGuide() {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOverlay(ref, phoneOverlayAt);
  const { i, s } = useGuideStep(T.phoneGuide, experience.phoneGuide.length);
  const scene = scenes[0];

  const screens: ReactNode[] = [
    <ImportStep key="import" s={i === 0 ? s : 1} />,
    <VerifyStep key="verify" s={i === 1 ? s : i > 1 ? 1 : 0} />,
    <SixScreen key="six" scene={scene} step={i < 2 ? 0 : i > 2 ? 2 : s < 0.15 ? 0 : s < 0.45 ? 1 : 2} />,
    i === 3 && s >= 0.5 ? (
      <AppChat key="sent" scene={scene} showIncoming sent={scene.suggestions?.[scene.pick ?? 0]} />
    ) : (
      <SixScreen key="pick" scene={scene} step={i === 3 && s >= 0.12 ? 3 : 2} />
    ),
  ];

  return (
    <div ref={ref} className={styles.guide} data-kind="phone" aria-hidden={!shown} inert={!shown}>
      <div className={styles.guideInner}>
        <StepText i={i} />
        <Fit w={PHONE_SCREEN_PX.w} h={PHONE_SCREEN_PX.h} className={styles.phoneFit}>
          <div className={styles.phonePanel}>
            {screens.map((node, k) => (
              <div key={k} className={styles.screenLayer} data-state={k === i ? "on" : k < i ? "past" : "next"}>
                {node}
              </div>
            ))}
          </div>
        </Fit>
      </div>
    </div>
  );
}

function SixTop({ back }: { back?: boolean }) {
  return (
    <>
      <StatusBar />
      <div className={how.top}>
        {back ? <ChevronLeft size={24} className={how.back} /> : <SixAppIcon size={28} />}
        <b>Six</b>
      </div>
    </>
  );
}

// Étape 1 : la discussion se colle ligne par ligne, puis Six reconnaît WhatsApp.
const ImportStep = memo(function ImportStep({ s }: { s: number }) {
  const d = howScreens.import;
  const lines = d.transcript.filter((_, k) => s >= 0.1 + k * 0.18).length;
  return (
    <div className={how.screen}>
      <SixTop />
      <div className={how.body}>
        <h4 className={how.title}>{d.title}</h4>
        <div className={how.segmented}>
          {d.sources.map((src, k) => (
            <span key={src} data-on={k === 0 || undefined}>
              {src}
            </span>
          ))}
        </div>
        <div className={how.paste}>
          {d.transcript.slice(0, lines).map((line) => (
            <p key={line} className={styles.typed}>
              {line}
            </p>
          ))}
          <span className={how.caret} />
        </div>
        <p className={how.meta} style={{ opacity: s >= 0.66 ? 1 : 0, transition: "opacity .4s" }}>
          {d.meta}
        </p>
        <span className={how.primary} data-pressed={s >= 0.85 || undefined}>
          {d.action}
        </span>
      </div>
    </div>
  );
});

// Étape 2 : les informations sensibles sont masquées une à une.
const VerifyStep = memo(function VerifyStep({ s }: { s: number }) {
  const d = howScreens.verify;
  let k = 0;
  return (
    <div className={how.screen}>
      <SixTop back />
      <div className={how.body}>
        <h4 className={how.title}>{d.title}</h4>
        <p className={how.sub}>{d.sub}</p>
        <div className={how.paste}>
          <p>
            {maskExample.segments.map((seg, idx) => {
              if (typeof seg === "string") return seg;
              const masked = s >= 0.15 + k++ * 0.17;
              return (
                <span key={idx} className={masked ? `${how.token} ${how.masked}` : how.token}>
                  {masked ? seg.masked : seg.original}
                </span>
              );
            })}
          </p>
        </div>
        <p className={how.count} style={{ opacity: s >= 0.68 ? 1 : 0, transition: "opacity .4s" }}>
          {d.count}
        </p>
        <span className={how.primary} data-pressed={s >= 0.85 || undefined}>
          {d.action}
        </span>
      </div>
    </div>
  );
});

// ---------- Guide sur ordinateur ----------

function usePortrait() {
  const q = "(max-aspect-ratio: 9/10)";
  const [portrait, setPortrait] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPortrait(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return portrait;
}

export function DesktopGuide({ os }: { os: LaptopId }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useOverlay(ref, laptopOverlayAt);
  const portrait = usePortrait();
  const { i, s } = useGuideStep(T.laptopGuide, experience.desktopGuide.length);
  // Conversation ouverte : aucune, puis la cliente (Telegram), puis le SMS d'arnaque.
  const open = i === 0 ? -1 : i === 1 ? 2 : 4;
  const scene = open >= 0 ? scenes[open] : null;
  // Sur téléphone, la fenêtre est étroite : la liste, puis la conversation en plein écran.
  const pane = portrait ? (i === 0 ? "list" : "main") : "both";
  // Sur téléphone, une fenêtre étroite et haute : elle remplit l'écran sous le texte.
  const W = portrait ? 360 : 860;
  const H = portrait ? 600 : 560;

  return (
    <div ref={ref} className={styles.guide} data-kind="desktop" aria-hidden={!shown} inert={!shown}>
      <div className={styles.guideInner}>
        <StepText i={experience.phoneGuide.length + i} />
        <Fit w={W} h={H} className={styles.deskFit}>
          <div className={styles.window} data-os={os} style={{ width: W, height: H }}>
            <div className={styles.titleBar}>
              {os === "mac" ? (
                <span className={styles.lights}>
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <span className={styles.winTitle}>
                  <SixAppIcon size={16} />
                  Six
                </span>
              )}
              {os === "mac" && <b className={styles.macTitle}>Six</b>}
              {os === "windows" && (
                <span className={styles.winControls}>
                  <Minus size={14} />
                  <Square size={11} />
                  <X size={15} />
                </span>
              )}
            </div>
            <div className={styles.deskApp} data-pane={pane}>
              <aside className={desk.sidebar}>
                <div className={desk.search}>
                  <Search size={13} />
                  Rechercher
                </div>
                {scenes.map((sc, k) => (
                  <div
                    key={sc.app}
                    className={`${desk.conv} ${styles.conv}`}
                    data-on={k === open || undefined}
                    data-in={i > 0 || s >= 0.08 + k * 0.12 || undefined}
                  >
                    <span className={styles.convAvatar}>
                      <span className={desk.avatar} style={{ background: sc.contact.color }}>
                        {sc.contact.initials}
                      </span>
                      <span className={styles.convApp}>
                        <MessagingAppIcon app={sc.app} size={15} />
                      </span>
                    </span>
                    <span className={desk.convText}>
                      <b>{sc.contact.name}</b>
                      <small>{sc.incoming.text}</small>
                    </span>
                    <span className={desk.convMeta}>{sc.incoming.time}</span>
                  </div>
                ))}
              </aside>
              <main className={desk.main}>
                {scene ? (
                  <>
                    <header className={desk.mainHead}>
                      <b>{scene.contact.name}</b>
                      <span>via {scene.appName}</span>
                    </header>
                    <div className={`${desk.mainBody} ${styles.deskBody}`} key={open}>
                      <div className={desk.bubble}>{scene.incoming.text}</div>
                      <span className={desk.time}>Reçu à {scene.incoming.time}</span>
                      {scene.scam ? <ScamPane scene={scene} s={s} /> : <RepliesPane scene={scene} s={s} os={os} />}
                    </div>
                  </>
                ) : (
                  <div className={styles.empty}>
                    <SixAppIcon size={56} />
                    <p>{experience.labels.empty}</p>
                  </div>
                )}
              </main>
            </div>
          </div>
        </Fit>
      </div>
    </div>
  );
}

function RepliesPane({ scene, s, os }: { scene: (typeof scenes)[number]; s: number; os: LaptopId }) {
  const chosen = s >= 0.82;
  return (
    <>
      <p className={desk.context} data-show={s >= 0.18 ? "on" : "off"}>
        {scene.understood}
      </p>
      {scene.setting && (
        <div className={desk.group} data-show={s >= 0.32 ? "on" : "off"}>
          <div className={desk.row}>
            <span>{scene.setting.label}</span>
            <span className={desk.value}>{scene.setting.value}</span>
          </div>
        </div>
      )}
      <p className={desk.groupHeader} data-show={s >= 0.44 ? "on" : "off"}>
        Réponses proposées
      </p>
      <div className={desk.group}>
        {scene.suggestions?.map((t, k) => (
          <div key={t} className={desk.reply} data-show={s >= 0.5 + k * 0.1 ? "on" : "off"} data-on={(chosen && k === scene.pick) || undefined}>
            <span className={desk.radio}>{chosen && k === scene.pick && <Check size={10} strokeWidth={3.4} />}</span>
            {t}
          </div>
        ))}
      </div>
      <div className={desk.actions} data-show={s >= 0.82 ? "on" : "off"}>
        <span className={styles.keys} data-show={s >= 0.9 ? "on" : "off"}>
          <kbd>{os === "mac" ? "⌘" : "Ctrl"}</kbd>
          <kbd>V</kbd>
          {experience.labels.paste} {scene.appName}
        </span>
        <span className={desk.copy}>
          {s >= 0.9 ? <Check size={14} /> : <Copy size={14} />}
          {s >= 0.9 ? "Copié" : "Copier la réponse"}
        </span>
      </div>
    </>
  );
}

function ScamPane({ scene, s }: { scene: (typeof scenes)[number]; s: number }) {
  const scam = scene.scam!;
  return (
    <>
      <div className={styles.alert} data-show={s >= 0.22 ? "on" : "off"}>
        <TriangleAlert size={20} />
        <div>
          <b>{scam.title}</b>
          <p>{scam.text}</p>
        </div>
      </div>
      <p className={desk.groupHeader} data-show={s >= 0.48 ? "on" : "off"}>
        Que faire ?
      </p>
      <div className={desk.group}>
        {scam.actions.map((a, k) => (
          <div key={a} className={desk.row} data-show={s >= 0.55 + k * 0.1 ? "on" : "off"} style={{ color: "#2d5fe6" }}>
            {a}
          </div>
        ))}
      </div>
      <p className={desk.context} data-show={s >= 0.8 ? "on" : "off"}>
        {security.note}
      </p>
    </>
  );
}
