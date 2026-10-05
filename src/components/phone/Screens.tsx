import { Check, ChevronLeft, Copy, Mic, Phone as PhoneIcon, Plus, ShieldAlert, Sparkles, Video } from "lucide-react";
import type { Scene } from "../../content/phoneScenes";
import { SixAppIcon } from "../brand/Logos";
import styles from "./Screens.module.css";

export function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div className={styles.status} data-dark={dark || undefined}>
      <span>9:41</span>
      <span className={styles.statusIcons}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.5" y="5" width="3" height="6" rx="1" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="13.5" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <path d="M7.5 2.2c2 0 3.9.8 5.3 2.1l1.1-1.1A9 9 0 0 0 7.5.6 9 9 0 0 0 1.1 3.2l1.1 1.1A7.5 7.5 0 0 1 7.5 2.2Zm0 3.1c1.2 0 2.3.5 3.1 1.2l1.1-1.1a6 6 0 0 0-8.4 0l1.1 1.1c.8-.7 1.9-1.2 3.1-1.2Zm0 3.1c.4 0 .8.2 1 .4L7.5 10 6.5 8.8c.2-.2.6-.4 1-.4Z" />
        </svg>
        <span className={styles.battery}>
          <i />
        </span>
      </span>
    </div>
  );
}

type ChatProps = { scene: Scene; showIncoming: boolean; sent?: string };

// Conversation dans l'appli de messagerie, aux couleurs de cette appli.
export function AppChat({ scene, showIncoming, sent }: ChatProps) {
  const { contact } = scene;
  const darkHeader = scene.app === "whatsapp" || scene.app === "telegram";
  return (
    <div className={styles.app} data-app={scene.app}>
      <div className={styles.appTop}>
        <StatusBar dark={darkHeader} />
        <div className={styles.appHeader}>
          <ChevronLeft size={24} strokeWidth={2.2} className={styles.back} />
          <span className={styles.avatar} style={{ background: contact.color }}>
            {contact.initials}
          </span>
          <span className={styles.who}>
            <b>{contact.name}</b>
            <small>{contact.status}</small>
          </span>
          <span className={styles.headerIcons}>
            <Video size={21} />
            <PhoneIcon size={19} />
          </span>
        </div>
      </div>

      <div className={styles.thread}>
        {scene.history.map((m, i) => (
          <Bubble key={i} {...m} />
        ))}
        {showIncoming && <Bubble {...scene.incoming} fresh />}
        {sent && <Bubble from="me" text={sent} time={nextMinute(scene.incoming.time)} fresh read />}
      </div>

      <div className={styles.composer}>
        <Plus size={22} className={styles.composerIcon} />
        <span className={styles.input}>Message</span>
        <span className={styles.mic}>
          <Mic size={18} />
        </span>
      </div>
    </div>
  );
}

function Bubble({ from, text, time, fresh, read }: { from: "me" | "them"; text: string; time: string; fresh?: boolean; read?: boolean }) {
  return (
    <div className={[styles.bubble, styles[from], fresh && styles.fresh].filter(Boolean).join(" ")}>
      <span>{text}</span>
      <time>
        {time}
        {from === "me" && <span className={styles.ticks} data-read={read || undefined}>✓✓</span>}
      </time>
    </div>
  );
}

const nextMinute = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + 1;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

type SixProps = { scene: Scene; step: number };

// L'écran de Six : le message collé, ce que Six a compris, puis les réponses (ou l'alerte).
export function SixScreen({ scene, step }: SixProps) {
  const picked = step >= 3;
  return (
    <div className={styles.six}>
      <StatusBar />
      <div className={styles.sixHeader}>
        <SixAppIcon size={28} />
        <b>Six</b>
        <span className={styles.source} data-app={scene.app}>
          <i />
          Depuis {scene.appName}
        </span>
      </div>

      <div className={styles.sixBody}>
        <p className={styles.sixLabel}>Message reçu</p>
        <div className={styles.quote}>{scene.incoming.text}</div>

        {scene.scam ? (
          <>
            <div className={styles.alert} data-on={step >= 1 || undefined}>
              <ShieldAlert size={20} />
              <div>
                <b>{scene.scam.title}</b>
                <p>{scene.scam.text}</p>
              </div>
            </div>
            <div className={styles.scamActions} data-on={step >= 2 || undefined}>
              {scene.scam.actions.map((a, i) => (
                <span key={a} data-pressed={(picked && i === 0) || undefined}>
                  {a}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className={styles.understood} data-on={step >= 1 || undefined}>
              <Sparkles size={13} />
              {scene.understood}
            </p>
            <span className={styles.chip} data-on={step >= 1 || undefined}>
              {scene.chip}
            </span>
            <div className={styles.suggestions}>
              {scene.suggestions?.map((s, i) => (
                <div
                  key={s}
                  className={styles.suggestion}
                  data-on={step >= 2 || undefined}
                  data-picked={(picked && i === scene.pick) || undefined}
                  data-dim={(picked && i !== scene.pick) || undefined}
                  style={{ transitionDelay: step === 2 ? `${i * 160}ms` : "0ms" }}
                >
                  {s}
                  {picked && i === scene.pick && (
                    <span className={styles.check}>
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.copyBtn} data-done={picked || undefined}>
              {picked ? <Check size={16} /> : <Copy size={16} />}
              {picked ? "Copié" : "Copier"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
