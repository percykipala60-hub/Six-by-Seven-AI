import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { everywhere, features, maskExample } from "../content/site";
import { scenes } from "../content/phoneScenes";
import { Reveal } from "../components/ui/Reveal";
import { MessagingAppIcon } from "../components/brand/MessagingAppIcon";
import { SixAppIcon } from "../components/brand/Logos";
import styles from "./Features.module.css";

// Fait avancer un compteur à intervalle régulier, en pause hors de l'écran et si l'animation est réduite.
function useTicker(count: number, ms: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => !document.hidden && setI((n) => (n + 1) % count), ms);
    return () => window.clearInterval(id);
  }, [count, ms]);
  return i;
}

const replyScenes = scenes.filter((s) => !s.scam && s.suggestions);

// Ce que fait Six, montré par de petites interfaces réelles plutôt que par des icônes.
export function Features() {
  return (
    <section id={features.id} className={styles.section} aria-labelledby="features-title">
      <div className="container">
        <Reveal className={styles.head}>
          <h2 id="features-title">{features.title}</h2>
          <p>{features.intro}</p>
        </Reveal>

        <div className={styles.grid}>
          <Reveal className={`${styles.tile} ${styles.wide}`}>
            <TileText title={features.replies.title} text={features.replies.text} />
            <RepliesDemo />
          </Reveal>
          <Reveal delay={80} className={styles.tile}>
            <TileText title={features.mask.title} text={features.mask.text} />
            <MaskDemo />
          </Reveal>
          <Reveal className={styles.tile}>
            <TileText title={features.apps.title} text={features.apps.text} />
            <ul className={styles.apps}>
              {everywhere.apps.map((a) => (
                <li key={a.id}>
                  <MessagingAppIcon app={a.id} size={52} />
                  <span>{a.name}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={80} className={styles.tile}>
            <TileText title={features.send.title} text={features.send.text} />
            <SendDemo />
          </Reveal>
          <Reveal delay={160} className={styles.tile}>
            <TileText title={features.light.title} text={features.light.text} />
            <OfflineDemo />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function TileText({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.text}>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

// Une conversation, le réglage choisi et les trois réponses proposées, d'une appli à l'autre.
function RepliesDemo() {
  const i = useTicker(replyScenes.length, 4200);
  const scene = replyScenes[i];
  return (
    <div className={styles.replies} aria-hidden="true">
      <div key={scene.app} className={styles.repliesInner}>
        <div className={styles.thread}>
          <p className={styles.from}>
            {scene.contact.name} · {scene.appName}
          </p>
          <p className={styles.bubble}>{scene.incoming.text}</p>
        </div>
        <div className={styles.suggestions}>
          {scene.setting && (
            <p className={styles.setting}>
              {scene.setting.label} <b>{scene.setting.value}</b>
            </p>
          )}
          {scene.suggestions!.map((t, n) => (
            <p key={t} className={styles.suggestion} data-on={n === scene.pick || undefined}>
              <span className={styles.radio}>{n === scene.pick && <Check size={11} strokeWidth={3.4} />}</span>
              {t}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// Le même message tel que tu l'as reçu, puis tel que l'IA le lit.
function MaskDemo() {
  const masked = useTicker(2, 2600) === 1;
  return (
    <div className={styles.mask} aria-hidden="true">
      <div className={styles.segmented}>
        <span data-on={!masked || undefined}>{maskExample.toggle.original}</span>
        <span data-on={masked || undefined}>{maskExample.toggle.masked}</span>
      </div>
      <p className={styles.maskText}>
        {maskExample.segments.map((seg, n) =>
          typeof seg === "string" ? (
            <span key={n}>{seg}</span>
          ) : (
            <mark key={n} data-masked={masked || undefined}>
              {masked ? seg.masked : seg.original}
            </mark>
          ),
        )}
      </p>
    </div>
  );
}

// Six ne publie rien : la réponse choisie est copiée, tu l'envoies depuis ton appli.
function SendDemo() {
  const copied = useTicker(2, 2200) === 1;
  return (
    <div className={styles.send} aria-hidden="true">
      <p className={styles.chosen}>{replyScenes[0].suggestions![0]}</p>
      <span className={styles.copy} data-done={copied || undefined}>
        {copied ? <Check size={15} strokeWidth={3} /> : <Copy size={15} />}
        {copied ? "Copié" : "Copier la réponse"}
      </span>
    </div>
  );
}

// Pas de réseau, et Six s'ouvre quand même.
function OfflineDemo() {
  return (
    <div className={styles.offline} aria-hidden="true">
      <div className={styles.statusRow}>
        <span className={styles.bars}>
          <i />
          <i />
          <i />
          <i />
        </span>
        Pas de réseau
      </div>
      <div className={styles.appRow}>
        <SixAppIcon size={40} />
        <span>
          <b>Six</b>
          <small>S'ouvre hors connexion</small>
        </span>
        <span className={styles.ready} />
      </div>
    </div>
  );
}
