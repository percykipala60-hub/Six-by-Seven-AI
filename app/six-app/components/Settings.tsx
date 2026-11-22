"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DEFAULT_STYLE, clearStyle, loadStyle, saveStyle } from "@/lib/style";
import { activerMemoire, ecrireNote, effacerMemoire, habitudes, lireMemoire, memoireActive, type Memoire } from "@/lib/memoire";
import { applyThemeIcon } from "@/lib/theme-icon";
import type { UserStyle } from "@/lib/types";
import { CONNEXION_DISPONIBLE, ecouterCompte, ecrirePrenom, initiale, lireCompte, type Compte } from "@/lib/compte";
import { AppBar } from "./AppBar";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";

type Theme = "auto" | "light" | "dark";
// Chaque thème est montré comme le logo qu'il donne : fond, « 6 » et trait (mêmes valeurs que app/globals.css).
type Tuile = { id: string; label: string; icon: [string, string, string]; grad?: string; ring?: boolean };
const ACCENTS: Tuile[] = [
  { id: "bleu", label: "Bleu", icon: ["#090f1b", "#f2f5fa", "#4d7cfe"] },
  { id: "rose", label: "Rose", icon: ["#2a0f1d", "#fff5f9", "#ff6fae"] },
  { id: "violet", label: "Violet", icon: ["#1c1033", "#f5f0ff", "#a78bfa"] },
  { id: "neon", label: "Néon", icon: ["#000000", "#e8fbff", "#00e5ff"], ring: true },
  { id: "jaune", label: "Jaune", icon: ["#1f1a00", "#fffbe6", "#ffd60a"] },
  { id: "vert", label: "Vert", icon: ["#0b2a1f", "#f0fbf6", "#34d399"] },
  { id: "ambre", label: "Ambre", icon: ["#2b1e0b", "#fdf7ec", "#f0b95a"] },
  { id: "gris", label: "Gris", icon: ["#23262e", "#f4f5f7", "#aab2c5"] },
];
// Thèmes retenus par la matrice design (docs/Matrice_design_Six.xlsx : score ≥ 3,5), dans l'ordre du classement,
// plus Instagram, TikTok, Google, Claude, Kimi et Pinterest, ajoutés à la demande de l'équipe (docs/decisions.md). Couleurs seulement, rendues lisibles : aucun logo.
const RESEAUX: Tuile[] = [
  { id: "facebook", label: "Facebook", icon: ["#0866ff", "#ffffff", "#cfe1ff"] },
  { id: "sms", label: "SMS", icon: ["#0b57d0", "#ffffff", "#a8c7fa"] },
  { id: "whatsapp", label: "WhatsApp", icon: ["#075e54", "#ffffff", "#25d366"] },
  { id: "linkedin", label: "LinkedIn", icon: ["#0a66c2", "#ffffff", "#9dcbf7"] },
  { id: "telegram", label: "Telegram", icon: ["#007ab8", "#ffffff", "#c8ecff"] },
  { id: "instagram", label: "Instagram", icon: ["#d62976", "#ffffff", "#ffe08a"], grad: "linear-gradient(45deg, #feda75 0%, #fa7e1e 12%, #d62976 40%, #962fbf 72%, #4f5bd5 100%)" },
  { id: "tiktok", label: "TikTok", icon: ["#000000", "#ffffff", "#25f4ee"], ring: true },
  { id: "google", label: "Google", icon: ["#ffffff", "#4285f4", "#ea4335"], ring: true },
  { id: "claude", label: "Claude", icon: ["#d97757", "#ffffff", "#141413"] },
  { id: "kimi", label: "Kimi", icon: ["#002f5b", "#ffffff", "#00f6ff"] },
  { id: "pinterest", label: "Pinterest", icon: ["#e60023", "#ffffff", "#ffe1e5"] },
];

/** Tuile de thème : le logo Six aux couleurs du thème, recoloré comme components/Logo.tsx. */
function Tile({ t, on, onPick }: { t: Tuile; on: boolean; onPick: () => void }) {
  const vars = {
    "--icon-bg": t.icon[0],
    "--icon-ink": t.icon[1],
    "--icon-accent": t.icon[2],
    "--icon-grad": t.grad ?? t.icon[0],
    "--icon-ring": t.ring ? "var(--line)" : "transparent",
  } as CSSProperties;
  return (
    <button className="tile" data-id={t.id} aria-pressed={on} onClick={onPick}>
      <span className="logo six-logo" style={vars} aria-hidden="true">
        <i className="six-logo-glyphe" />
        <i className="six-logo-trait" />
      </span>
      {t.label}
    </button>
  );
}

// Polices : celles du système. Un téléphone qui ne les a pas (Android) affiche une police proche.
const POLICES = [
  { id: "systeme", label: "Police du téléphone", court: "Téléphone", family: "var(--font-systeme)" },
  { id: "times", label: "Times New Roman", court: "Times", family: '"Times New Roman", Times, Tinos, "Liberation Serif", "Noto Serif", serif' },
  { id: "georgia", label: "Georgia", court: "Georgia", family: 'Georgia, Gelasio, "Noto Serif", serif' },
  { id: "calibri", label: "Calibri", court: "Calibri", family: 'Calibri, Carlito, "Segoe UI", Roboto, system-ui, sans-serif' },
];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* stockage bloqué : le réglage vaut pour cette visite seulement */
  }
}

/** Mémoire de Six : ce qu'il a appris, ce que tu lui as dit de tes contacts, tes suivis. Visible, modifiable, effaçable. */
function MemoireSix() {
  const [on, setOn] = useState(false);
  const [m, setM] = useState<Memoire>({ choix: [], contacts: [], suivis: [] });

  useEffect(() => {
    const lire = () => {
      setOn(memoireActive());
      setM(lireMemoire());
    };
    lire();
    window.addEventListener("six-memoire", lire);
    return () => window.removeEventListener("six-memoire", lire);
  }, []);

  const appris = habitudes(m);
  return (
    <section className="stack" aria-label="Mémoire de Six">
      <p className="muted small">
        Six apprend de tes choix pour écrire comme toi et se souvenir de tes contacts. Tout reste sur ce téléphone, rien de tes conversations n&apos;est gardé, et tout est oublié après 90 jours.
      </p>
      <label className="toggle">
        <span className="grow">
          <b>Mémoire activée</b>
          <span className="muted small">{on ? "Six se souvient d'une fois sur l'autre" : "Six oublie tout à chaque fois"}</span>
        </span>
        <input type="checkbox" className="sw" checked={on} onChange={(e) => activerMemoire(e.target.checked)} />
      </label>
      {on && (
        <>
          <div className="card stack">
            <div className="lbl">Ce que Six a appris</div>
            {appris.length ? (
              <div className="tags">
                {appris.map((a) => (
                  <span className="tag" key={a}>
                    {a}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted small">Rien encore : Six apprend à partir de 3 réponses choisies ({m.choix.length}/3).</p>
            )}
          </div>
          <div className="card stack">
            <div className="lbl">Tes contacts</div>
            {m.contacts.length ? (
              m.contacts.map((c) => (
                <div className="row sp contact" key={c.nom}>
                  <span className="grow">
                    <b>{c.nom}</b>
                    <span className="muted small"> · {c.note}</span>
                  </span>
                  <button className="btn ghost small" aria-label={`Oublier ${c.nom}`} onClick={() => ecrireNote(c.nom, "")}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))
            ) : (
              <p className="muted small">Sur l&apos;écran « Protéger », dis à Six qui est la personne : il s&apos;en souviendra.</p>
            )}
          </div>
          {m.suivis.length > 0 && <p className="muted small">{m.suivis.length} suivi{m.suivis.length > 1 ? "s" : ""} en attente sur l&apos;accueil.</p>}
          <button className="btn ghost" onClick={effacerMemoire}>
            <Icon name="trash" /> Effacer la mémoire de Six
          </button>
        </>
      )}
    </section>
  );
}

type Vue = "" | "theme" | "police" | "style" | "memoire" | "compte";
const TITRES: Record<Exclude<Vue, "">, string> = {
  theme: "Thème et couleurs",
  police: "Police",
  style: "Mon style d'écriture",
  memoire: "Mémoire de Six",
  compte: "Compte",
};
const MODES: Record<Theme, string> = { auto: "Auto", light: "Clair", dark: "Sombre" };

/** Rangée d'une liste de réglages : icône, libellé, valeur actuelle, chevron. */
function Rangee({ icon, label, valeur, onClick }: { icon: IconName; label: string; valeur?: string; onClick: () => void }) {
  return (
    <button className="set-row" onClick={onClick}>
      <span className="set-ico" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="grow">{label}</span>
      {valeur && <span className="set-val">{valeur}</span>}
      <Icon name="chevron" size={18} />
    </button>
  );
}

function LienRangee({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link className="set-row" href={href}>
      <span className="set-ico" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="grow">{label}</span>
      <Icon name="chevron" size={18} />
    </Link>
  );
}

/** Compte : mode invité pour l'instant (décision du 2026-10-10). Le prénom reste sur le téléphone. */
function CompteVue() {
  const [c, setC] = useState<Compte>({ statut: "invite", prenom: "" });
  const [prenom, setPrenom] = useState("");
  useEffect(() => {
    const lire = () => {
      const x = lireCompte();
      setC(x);
      setPrenom(x.prenom);
    };
    lire();
    return ecouterCompte(lire);
  }, []);
  return (
    <>
      <div className="compte-head">
        <span className="avatar avatar-lg" aria-hidden="true">
          {initiale(c) || <Icon name="user" size={34} />}
          <span className={`avatar-dot${c.statut === "connecte" ? " on" : ""}`} />
        </span>
        <b className="compte-nom">{c.prenom || "Invité"}</b>
        <span className="badge">{c.statut === "connecte" ? "Connecté" : "Non connecté"}</span>
      </div>
      <div className="group-list pad">
        <label htmlFor="prenom" className="set-label">
          Ton prénom
        </label>
        <input
          id="prenom"
          type="text"
          autoComplete="given-name"
          maxLength={30}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          onBlur={() => ecrirePrenom(prenom)}
          placeholder="Pour que Six te salue"
        />
        <p className="muted small">Gardé sur ce téléphone seulement.</p>
      </div>
      <div className="group-list pad">
        <b>Connexion</b>
        <p className="muted small">
          Bientôt : un compte pour retrouver ta mémoire, ton style et tes suivis sur tous tes appareils. En attendant, tu utilises Six en invité et tout reste sur ce téléphone.
        </p>
        <button className="btn primary" disabled={!CONNEXION_DISPONIBLE}>
          <Icon name="user" /> Se connecter{CONNEXION_DISPONIBLE ? "" : " (bientôt)"}
        </button>
      </div>
    </>
  );
}

export function Settings() {
  const params = useSearchParams();
  const router = useRouter();
  const dedans = useRef(false); // vrai quand la sous-page a été ouverte depuis la liste : Retour revient en arrière
  const v = params.get("v") ?? "";
  const vue: Vue = v in TITRES ? (v as Vue) : "";
  const [theme, setTheme] = useState<Theme>("auto");
  const [accent, setAccent] = useState("bleu");
  const [police, setPolice] = useState("systeme");
  const [style, setStyle] = useState<UserStyle>(DEFAULT_STYLE);
  const [expr, setExpr] = useState("");
  const [express, setExpress] = useState(false);
  const [memOn, setMemOn] = useState(false);
  const [compte, setCompte] = useState<Compte>({ statut: "invite", prenom: "" });

  useEffect(() => {
    const t = read("six-theme");
    setTheme(t === "light" || t === "dark" ? t : "auto");
    setAccent(read("six-accent") ?? "bleu");
    const f = read("six-font");
    setPolice(POLICES.some((p) => p.id === f) ? (f as string) : "systeme");
    setStyle(loadStyle() ?? DEFAULT_STYLE);
    setExpress(read("six-express") === "1");
    const lire = () => {
      setMemOn(memoireActive());
      setCompte(lireCompte());
    };
    lire();
    window.addEventListener("six-memoire", lire);
    const stop = ecouterCompte(lire);
    return () => {
      window.removeEventListener("six-memoire", lire);
      stop();
    };
  }, []);

  function ouvrir(x: Vue) {
    dedans.current = true;
    router.push(`/reglages?v=${x}`);
  }

  function retour() {
    if (dedans.current) router.back();
    else router.replace("/reglages");
  }

  function updateStyle(next: UserStyle) {
    setStyle(next);
    saveStyle(next);
  }

  function applyTheme(t: Theme) {
    setTheme(t);
    const root = document.documentElement;
    if (t === "auto") {
      delete root.dataset.theme;
      write("six-theme", null);
    } else {
      root.dataset.theme = t;
      write("six-theme", t);
    }
    applyThemeIcon();
  }

  function applyAccent(a: string) {
    setAccent(a);
    const root = document.documentElement;
    if (a === "bleu") {
      delete root.dataset.accent;
      write("six-accent", null);
    } else {
      root.dataset.accent = a;
      write("six-accent", a);
    }
    applyThemeIcon(); // toute l'app change : barre du téléphone et icône de l'onglet aussi
  }

  function applyPolice(p: string) {
    setPolice(p);
    const root = document.documentElement;
    if (p === "systeme") {
      delete root.dataset.font;
      write("six-font", null);
    } else {
      root.dataset.font = p;
      write("six-font", p);
    }
  }

  if (vue) {
    return (
      <main className="screen sub">
        <div className="top">
          <button className="back" onClick={retour} aria-label="Retour aux réglages">
            <Icon name="back" />
          </button>
          <h1 className="top-title">{TITRES[vue]}</h1>
        </div>
        {vue === "theme" && (
          <>
            <section className="card preview" aria-label="Aperçu du thème">
              <div className="row sp">
                <span className="muted small">Aperçu</span>
                <Logo small label="" />
              </div>
              <p className="pv-in">On dit quoi pour samedi ?</p>
              <p className="pv-out">Je serai là samedi chez Maman !</p>
              <span className="btn primary small" aria-hidden="true">
                <Icon name="copy" size={16} /> Copier la réponse
              </span>
            </section>
            <h2 className="group-title" id="mode">
              Mode
            </h2>
            <div className="seg" role="group" aria-labelledby="mode">
              <button aria-pressed={theme === "dark"} onClick={() => applyTheme("dark")}>
                <Icon name="moon" size={16} /> Sombre
              </button>
              <button aria-pressed={theme === "light"} onClick={() => applyTheme("light")}>
                <Icon name="sun" size={16} /> Clair
              </button>
              <button aria-pressed={theme === "auto"} onClick={() => applyTheme("auto")}>
                <Icon name="phone" size={16} /> Auto
              </button>
            </div>
            <h2 className="group-title" id="couleurs">
              Couleurs de Six
            </h2>
            <div className="tiles" role="group" aria-labelledby="couleurs">
              {ACCENTS.map((a) => (
                <Tile key={a.id} t={a} on={accent === a.id} onPick={() => applyAccent(a.id)} />
              ))}
            </div>
            <h2 className="group-title" id="apps">
              Inspirées de tes apps
            </h2>
            <div className="tiles scroll-x" role="group" aria-labelledby="apps">
              {RESEAUX.map((a) => (
                <Tile key={a.id} t={a} on={accent === a.id} onPick={() => applyAccent(a.id)} />
              ))}
            </div>
            <p className="muted small">
              Le thème change toute l&apos;app : fonds, textes, boutons et icône. Couleurs inspirées des apps que tu utilises, rendues lisibles : Six n&apos;est affilié à aucune d&apos;elles. Ces réglages restent sur ton téléphone.
            </p>
          </>
        )}
        {vue === "police" && (
          <>
            <div className="fonts" role="group" aria-label="Police">
              {POLICES.map((p) => (
                <button key={p.id} className="font" aria-label={p.label} title={p.label} aria-pressed={police === p.id} onClick={() => applyPolice(p.id)}>
                  <b style={{ fontFamily: p.family }}>Aa</b>
                  {p.court}
                </button>
              ))}
            </div>
            <p className="muted small">Toute l&apos;app change de police. Si ton téléphone ne l&apos;a pas, Six affiche la police la plus proche.</p>
          </>
        )}
        {vue === "style" && (
          <>
            <p className="muted small">Six s&apos;en sert pour écrire comme toi. Ce réglage reste sur ton téléphone.</p>
            <div className="group-list pad">
              <label htmlFor="deco" className="set-label">
                Registre
              </label>
              <input id="deco" type="range" min={0} max={100} value={style.decontracte} onChange={(e) => updateStyle({ ...style, decontracte: Number(e.target.value) })} />
              <div className="ends" aria-hidden="true">
                <span>Formel</span>
                <span>Décontracté</span>
              </div>
              <label htmlFor="det" className="set-label">
                Longueur
              </label>
              <input id="det" type="range" min={0} max={100} value={style.detaille} onChange={(e) => updateStyle({ ...style, detaille: Number(e.target.value) })} />
              <div className="ends" aria-hidden="true">
                <span>Bref</span>
                <span>Détaillé</span>
              </div>
              <label className="row sp">
                <span>Emojis</span>
                <input type="checkbox" className="sw" checked={style.emojis} onChange={(e) => updateStyle({ ...style, emojis: e.target.checked })} />
              </label>
            </div>
            <div className="group-list pad">
              <span className="set-label">Tes expressions (5 maximum)</span>
              {style.expressions.length > 0 && (
                <div className="chips">
                  {style.expressions.map((x) => (
                    <button key={x} className="chip" aria-label={`Retirer ${x}`} onClick={() => updateStyle({ ...style, expressions: style.expressions.filter((e) => e !== x) })}>
                      « {x} » ✕
                    </button>
                  ))}
                </div>
              )}
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = expr.trim().slice(0, 40);
                  if (val && style.expressions.length < 5 && !style.expressions.includes(val)) updateStyle({ ...style, expressions: [...style.expressions, val] });
                  setExpr("");
                }}
              >
                <label className="sr" htmlFor="expr">
                  Ajouter une expression
                </label>
                <input id="expr" type="text" value={expr} maxLength={40} onChange={(e) => setExpr(e.target.value)} placeholder="Ex : Pas de souci" />
                <button className="btn ghost small" type="submit" disabled={style.expressions.length >= 5}>
                  Ajouter
                </button>
              </form>
            </div>
            <button
              className="btn ghost"
              onClick={() => {
                clearStyle();
                setStyle(DEFAULT_STYLE);
              }}
            >
              <Icon name="trash" /> Effacer mon style
            </button>
          </>
        )}
        {vue === "memoire" && <MemoireSix />}
        {vue === "compte" && <CompteVue />}
      </main>
    );
  }

  const couleur = [...ACCENTS, ...RESEAUX].find((a) => a.id === accent)?.label ?? "Bleu";
  const registre = style.decontracte >= 66 ? "Décontracté" : style.decontracte <= 33 ? "Formel" : "Équilibré";
  return (
    <>
      <AppBar page="reglages" titre="Réglages" />
      <main className="screen settings">
        <button className="profile-card" onClick={() => ouvrir("compte")}>
          <span className="avatar avatar-md" aria-hidden="true">
            {initiale(compte) || <Icon name="user" size={22} />}
            <span className={`avatar-dot${compte.statut === "connecte" ? " on" : ""}`} />
          </span>
          <span className="grow">
            <b>{compte.prenom || "Invité"}</b>
            <span className="muted small">{compte.statut === "connecte" ? "Connecté" : "Non connecté, tout reste ici"}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        <section aria-labelledby="g-apparence">
          <h2 className="group-title" id="g-apparence">
            Apparence
          </h2>
          <div className="group-list">
            <Rangee icon="sun" label="Thème et couleurs" valeur={`${couleur}, ${MODES[theme].toLowerCase()}`} onClick={() => ouvrir("theme")} />
            <Rangee icon="type" label="Police" valeur={POLICES.find((p) => p.id === police)?.court} onClick={() => ouvrir("police")} />
          </div>
        </section>
        <section aria-labelledby="g-six">
          <h2 className="group-title" id="g-six">
            Six
          </h2>
          <div className="group-list">
            <Rangee icon="pencil" label="Mon style d'écriture" valeur={registre} onClick={() => ouvrir("style")} />
            <Rangee icon="bulb" label="Mémoire de Six" valeur={memOn ? "Activée" : "Désactivée"} onClick={() => ouvrir("memoire")} />
            <label className="set-row">
              <span className="set-ico" aria-hidden="true">
                <Icon name="up" size={18} />
              </span>
              <span className="grow">
                Réponses directes
                <span className="muted small set-sub">Six choisit l&apos;objectif, tu le changes après</span>
              </span>
              <input
                type="checkbox"
                className="sw"
                checked={express}
                onChange={(e) => {
                  setExpress(e.target.checked);
                  write("six-express", e.target.checked ? "1" : "0");
                }}
              />
            </label>
          </div>
        </section>
        <section aria-labelledby="g-infos">
          <h2 className="group-title" id="g-infos">
            Confidentialité et informations
          </h2>
          <div className="group-list">
            <LienRangee href="/confidentialite" icon="lock" label="Confidentialité" />
            <LienRangee href="/conditions" icon="file" label="Conditions d'utilisation" />
            <LienRangee href="/mentions" icon="file" label="Mentions légales" />
          </div>
        </section>
        <p className="muted small set-foot">Six par Seven.AI, version de démonstration</p>
      </main>
    </>
  );
}
