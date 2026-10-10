// Thème caméléon : le site ne garde jamais longtemps la même couleur. Il passe d'une ambiance à l'autre
// en faisant le tour des couleurs (sable, bleu étoilé, indigo, violet, cyan, lagon, vert boréal, émeraude,
// puis de nouveau sable). Pas de rouge ni de rose : on reste dans les bleus, verts et violets. L'ordre compte :
// le sable ne passe jamais directement au violet (le mélange des deux tirerait sur le rose).
// Chaque nouvelle couleur traverse l'écran de gauche à droite comme une vague (front ondulé, crête de
// lumière), sans dépendre de la souris, et les vagues changent de teinte à son passage. Une seule horloge pour tout le site : le fond, les vagues et
// les couleurs de l'interface (barre de navigation, bordures…) restent toujours d'accord.
// Les fonds sont franchement colorés, pour qu'on remarque le changement, et des lueurs d'aurore boréale
// dérivent par-dessus. Ils restent assez clairs pour le texte : contraste d'au moins 11 pour le texte
// principal et de 5 pour le texte gris (--mut), dans toutes les ambiances. Les vagues prennent à chaque
// fois une teinte qui contraste avec le fond (bleu sur sable, cyan sur indigo, violet sur vert boréal…).

export type Rgb = [number, number, number];

export type Mood = {
  name: string;
  bg: Rgb;
  bgSoft: Rgb;
  surface: Rgb;
  line: Rgb;
  lineStrong: Rgb;
  // Rubans sur le fond clair (5) et sur le panneau bleu nuit (4).
  light: Rgb[];
  dark: Rgb[];
  // Lueurs d'aurore qui dérivent dans le haut de l'écran (3), et couleur des points lumineux (étoiles).
  aurora: Rgb[];
  star: Rgb;
};

export const mix = (a: Rgb, b: Rgb, k: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const VIVID: Mood[] = [
  // Beige de la marque, vagues bleues, lueurs bleu, cyan et ambre.
  {
    name: "sable",
    bg: hex("#f1e5d0"),
    bgSoft: hex("#e3d7c4"),
    surface: hex("#fbf8f2"),
    line: hex("#d9cebb"),
    lineStrong: hex("#c1b7a6"),
    light: [[45, 95, 230], [79, 179, 236], [107, 147, 255], [79, 179, 236], [14, 21, 38]],
    dark: [[77, 124, 254], [124, 200, 242], [143, 168, 255], [124, 200, 242]],
    aurora: [[77, 124, 254], [130, 110, 255], [60, 200, 240]],
    star: [45, 95, 230],
  },
  // Bleu étoilé, vagues indigo, lueurs bleues et violettes, étoiles blanches.
  {
    name: "etoile",
    bg: hex("#c3d1f5"),
    bgSoft: hex("#b7c4e6"),
    surface: hex("#eef2fc"),
    line: hex("#b0bcdc"),
    lineStrong: hex("#9ca7c4"),
    light: [[40, 40, 160], [90, 70, 220], [30, 90, 210], [130, 100, 240], [10, 14, 50]],
    dark: [[90, 120, 255], [170, 140, 255], [80, 180, 255], [200, 170, 255]],
    aurora: [[60, 100, 255], [150, 100, 255], [60, 200, 255]],
    star: [255, 255, 255],
  },
  // Indigo, vagues cyan, lueurs indigo, cyan et violette.
  {
    name: "indigo",
    bg: hex("#c8ccf6"),
    bgSoft: hex("#bcc0e7"),
    surface: hex("#f0f1fc"),
    line: hex("#b4b8dd"),
    lineStrong: hex("#a0a3c5"),
    light: [[10, 140, 180], [30, 170, 200], [60, 50, 190], [20, 160, 210], [14, 12, 50]],
    dark: [[50, 210, 255], [100, 230, 255], [130, 120, 255], [80, 200, 255]],
    aurora: [[80, 80, 255], [40, 200, 255], [140, 90, 255]],
    star: [255, 255, 255],
  },
  // Violet, vagues vertes et cyan, lueurs violette, cyan et menthe.
  {
    name: "violet",
    bg: hex("#d9c9f5"),
    bgSoft: hex("#ccbde6"),
    surface: hex("#f4f0fc"),
    line: hex("#c3b5dc"),
    lineStrong: hex("#aea1c4"),
    light: [[20, 140, 100], [20, 150, 190], [100, 50, 200], [40, 180, 170], [26, 12, 46]],
    dark: [[60, 230, 170], [70, 220, 255], [190, 130, 255], [90, 230, 200]],
    aurora: [[150, 90, 255], [50, 210, 255], [70, 220, 170]],
    star: [255, 255, 255],
  },
  // Cyan, vagues indigo et violettes, lueurs cyan, bleue et menthe.
  {
    name: "cyan",
    bg: hex("#bfeaf5"),
    bgSoft: hex("#b4dce6"),
    surface: hex("#edf9fc"),
    line: hex("#acd3dc"),
    lineStrong: hex("#99bbc4"),
    light: [[60, 50, 190], [110, 60, 210], [30, 80, 200], [130, 90, 230], [12, 14, 48]],
    dark: [[110, 120, 255], [170, 130, 255], [60, 200, 255], [190, 160, 255]],
    aurora: [[20, 210, 240], [60, 120, 255], [60, 230, 180]],
    star: [255, 255, 255],
  },
  // Turquoise, vagues bleu roi et violettes, lueurs turquoise et vert.
  {
    name: "lagon",
    bg: hex("#b8e8e8"),
    bgSoft: hex("#addada"),
    surface: hex("#ebf9f9"),
    line: hex("#a6d1d1"),
    lineStrong: hex("#93baba"),
    light: [[40, 70, 200], [110, 60, 210], [30, 110, 220], [90, 80, 230], [10, 20, 46]],
    dark: [[80, 140, 255], [160, 120, 255], [60, 190, 255], [140, 150, 255]],
    aurora: [[20, 200, 190], [90, 230, 160], [60, 140, 255]],
    star: [255, 255, 255],
  },
  // Vert boréal, vagues bleu nuit et violettes, lueurs d'aurore verte et violette.
  {
    name: "boreal",
    bg: hex("#bdebd2"),
    bgSoft: hex("#b2ddc5"),
    surface: hex("#edf9f2"),
    line: hex("#aad4bd"),
    lineStrong: hex("#97bca8"),
    light: [[30, 70, 200], [100, 60, 210], [20, 120, 190], [130, 90, 230], [10, 20, 40]],
    dark: [[40, 230, 140], [100, 255, 190], [150, 110, 255], [60, 220, 220]],
    aurora: [[30, 220, 130], [150, 100, 255], [40, 190, 230]],
    star: [255, 255, 255],
  },
  // Vert tendre, vagues bleues, lueurs vert pomme et bleu canard.
  {
    name: "emeraude",
    bg: hex("#cde9bd"),
    bgSoft: hex("#c1dbb2"),
    surface: hex("#f1f9ed"),
    line: hex("#b8d2aa"),
    lineStrong: hex("#a4ba97"),
    light: [[30, 100, 210], [20, 150, 190], [70, 120, 240], [40, 170, 200], [12, 24, 40]],
    dark: [[60, 140, 255], [80, 210, 230], [120, 200, 255], [90, 230, 160]],
    aurora: [[80, 210, 90], [170, 220, 60], [20, 170, 170]],
    star: [255, 255, 255],
  },
];

// Intensité des couleurs de fond : 0 donnerait des ambiances franches, 1 un blanc cassé uniforme.
// Chaque fond (et ses bordures) est rapproché d'un blanc doux de cette proportion : on remarque bien le
// changement, sans que la couleur n'accapare l'attention.
const SOFTEN = 0.4;
const SOFT_BASE: Rgb = [248, 246, 242];

export const MOODS: Mood[] = VIVID.map((m) => {
  const soft = (c: Rgb) => mix(c, SOFT_BASE, SOFTEN);
  return { ...m, bg: soft(m.bg), bgSoft: soft(m.bgSoft), surface: soft(m.surface), line: soft(m.line), lineStrong: soft(m.lineStrong) };
});

// Durées (secondes) : chaque ambiance reste un moment, puis la suivante se propage lentement.
export const HOLD = 5;
export const SPREAD = 12;
const STEP = HOLD + SPREAD;

export const css = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
export const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a.toFixed(3)})`;

// Horloge qui ne tourne que lorsque la page est visible : en revenant sur l'onglet, la couleur reprend
// où elle en était au lieu de sauter plusieurs ambiances d'un coup.
let hiddenAt = typeof document !== "undefined" && document.hidden ? performance.now() : -1;
let hiddenTotal = 0;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = performance.now();
    else if (hiddenAt >= 0) {
      hiddenTotal += performance.now() - hiddenAt;
      hiddenAt = -1;
    }
  });
}
// ?chameleon=10 : tout va dix fois plus vite, pour voir les passages sans attendre.
const SPEED = (typeof location !== "undefined" && Number(new URLSearchParams(location.search).get("chameleon"))) || 1;
const elapsed = () => (((hiddenAt >= 0 ? hiddenAt : performance.now()) - hiddenTotal) / 1000) * SPEED;

export type ChameleonState = {
  from: Mood;
  to: Mood;
  // Avancée de la vague (0 : rien n'a encore changé, 1 : la nouvelle ambiance couvre tout).
  p: number;
};

const ease = (x: number) => x * x * (3 - 2 * x);

export function chameleonAt(): ChameleonState {
  const t = elapsed();
  const step = Math.floor(t / STEP);
  const local = t - step * STEP;
  const from = MOODS[step % MOODS.length];
  const to = MOODS[(step + 1) % MOODS.length];
  const p = local < HOLD ? 0 : ease((local - HOLD) / SPREAD);
  return { from, to, p };
}

// Couleurs de l'interface : la vague ne peut pas être dessinée sur chaque élément de la page, ils
// prennent donc la couleur moyenne du passage. Mises à jour quatre fois par seconde seulement, et
// uniquement pendant un passage : changer ces variables oblige le navigateur à recalculer les styles.
export function startChameleonTheme() {
  const root = document.documentElement;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  let lastKey = "";
  let lastMeta = 0;
  const apply = () => {
    if (root.dataset.theme === "dark") return;
    const { from, to, p } = chameleonAt();
    // Pas de 1/200 : à cette lenteur, un pas plus fin serait invisible.
    const k = Math.round(p * 200) / 200;
    const key = `${from.name}:${to.name}:${k}`;
    if (key === lastKey) return;
    lastKey = key;
    const s = root.style;
    const bg = mix(from.bg, to.bg, k);
    s.setProperty("--bg", css(bg));
    s.setProperty("--bg-soft", css(mix(from.bgSoft, to.bgSoft, k)));
    s.setProperty("--surface", css(mix(from.surface, to.surface, k)));
    s.setProperty("--line", css(mix(from.line, to.line, k)));
    s.setProperty("--line-strong", css(mix(from.lineStrong, to.lineStrong, k)));
    // Barre du navigateur sur téléphone : rafraîchie plus rarement.
    const now = performance.now();
    if (meta && now - lastMeta > 2000) {
      meta.content = css(bg);
      lastMeta = now;
    }
  };
  apply();
  const id = window.setInterval(apply, 250);
  return () => window.clearInterval(id);
}
