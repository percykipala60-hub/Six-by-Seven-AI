import { Check, Copy, Minus, Search, Square, X } from "lucide-react";
import { scenes } from "../../content/phoneScenes";
import { SixAppIcon } from "../brand/Logos";
import { Edge, FileExplorer, Finder, Mail, Messages, MicrosoftStore, Photos, Safari, TaskView } from "./AppIcons";
import type { LaptopKind } from "../phone3d/LaptopModel";
import { APPLE_PATH, WINDOWS_PATH } from "../phone3d/brandLogos";
import styles from "./DesktopScreen.module.css";

// Écran d'ordinateur : l'appli de bureau Six ouverte, sur un bureau macOS ou Windows.

function Glyph({ path, size, className }: { path: string; size: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}
export function DesktopScreen({ os, width, height }: { os: LaptopKind; width: number; height: number }) {
  const scene = scenes[0];
  return (
    <div className={styles.desktop} data-os={os} style={{ width, height }}>
      {os === "mac" && (
        <div className={styles.menuBar}>
          <Glyph path={APPLE_PATH} size={13} />
          <b>Six</b>
          <span>Fichier</span>
          <span>Édition</span>
          <span>Présentation</span>
          <span>Fenêtre</span>
          <span className={styles.clock}>lun. 9:41</span>
          <i className={styles.notch} aria-hidden="true" />
        </div>
      )}

      <div className={styles.window}>
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
          {os === "mac" && <span className={styles.macTitle}>Six</span>}
          {os === "windows" && (
            <span className={styles.winControls}>
              <Minus size={14} />
              <Square size={11} />
              <X size={15} />
            </span>
          )}
        </div>

        <div className={styles.app}>
          <aside className={styles.sidebar}>
            <div className={styles.search}>
              <Search size={13} />
              Rechercher
            </div>
            {scenes.map((s, i) => (
              <div key={s.app} className={styles.conv} data-on={i === 0 || undefined}>
                <span className={styles.avatar} style={{ background: s.contact.color }}>
                  {s.contact.initials}
                </span>
                <span className={styles.convText}>
                  <b>{s.contact.name}</b>
                  <small>{s.incoming.text}</small>
                </span>
                <span className={styles.convMeta}>{s.appName}</span>
              </div>
            ))}
          </aside>

          <main className={styles.main}>
            <header className={styles.mainHead}>
              <b>{scene.contact.name}</b>
              <span>via {scene.appName}</span>
            </header>
            <div className={styles.mainBody}>
              <div className={styles.bubble}>{scene.incoming.text}</div>
              <span className={styles.time}>Reçu à {scene.incoming.time}</span>
              <p className={styles.context}>{scene.understood}</p>
              {scene.setting && (
                <div className={styles.group}>
                  <div className={styles.row}>
                    <span>{scene.setting.label}</span>
                    <span className={styles.value}>{scene.setting.value}</span>
                  </div>
                </div>
              )}
              <p className={styles.groupHeader}>Réponses proposées</p>
              <div className={styles.group}>
                {scene.suggestions?.map((t, i) => (
                  <div key={t} className={styles.reply} data-on={i === scene.pick || undefined}>
                    <span className={styles.radio}>{i === scene.pick && <Check size={10} strokeWidth={3.4} />}</span>
                    {t}
                  </div>
                ))}
              </div>
              <div className={styles.actions}>
                <span className={styles.copy}>
                  <Copy size={14} />
                  Copier la réponse
                </span>
              </div>
            </div>
          </main>
        </div>
      </div>

      {os === "mac" ? (
        // Dock de macOS : Finder, Safari, Messages, Mail, Photos, puis Six ; un point sous les apps ouvertes.
        <div className={styles.dock} aria-hidden="true">
          {[Finder, Safari, Messages, Mail, Photos].map((Icon, i) => (
            <span key={i} className={styles.dockApp} data-open={i === 0 || undefined}>
              <Icon size={36} />
            </span>
          ))}
          <span className={styles.dockSep} />
          <span className={styles.dockApp} data-open>
            <SixAppIcon size={30} />
          </span>
        </div>
      ) : (
        <div className={styles.taskbar} aria-hidden="true">
          <Glyph path={WINDOWS_PATH} size={20} className={styles.start} />
          <span className={styles.taskSearch}>
            <Search size={12} /> Rechercher
          </span>
          {/* Barre des tâches de Windows 11 : Vue des tâches, Explorateur, Edge, Microsoft Store, puis Six (ouverte). */}
          {[TaskView, FileExplorer, Edge, MicrosoftStore].map((Icon, i) => (
            <span key={i} className={styles.taskApp}>
              <Icon size={30} />
            </span>
          ))}
          <span className={styles.taskApp} data-open>
            <SixAppIcon size={22} />
          </span>
          <span className={styles.trayClock}>
            9:41
            <small>07/10/2026</small>
          </span>
        </div>
      )}
    </div>
  );
}
