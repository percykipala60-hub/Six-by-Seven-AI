// Icônes simplifiées des vraies applications, pour la barre des tâches Windows 11 et le Dock de macOS
// affichés sur l'écran de l'ordinateur. Dessinées en vectoriel (grille 64 × 64), sans image externe.
import type { ReactNode } from "react";

type IconProps = { size: number };
const svg = (size: number, body: ReactNode, id: string) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" data-app={id}>
    {body}
  </svg>
);

// ---------- Windows 11 ----------

export function TaskView({ size }: IconProps) {
  return svg(
    size,
    <>
      <rect x="7" y="13" width="32" height="28" rx="5" fill="#b9bec7" />
      <rect x="22" y="22" width="35" height="30" rx="5" fill="#fff" stroke="#6f7480" strokeWidth="3" />
    </>,
    "taskview",
  );
}

export function FileExplorer({ size }: IconProps) {
  return svg(
    size,
    <>
      <path d="M6 16a4 4 0 0 1 4-4h14l6 6h24a4 4 0 0 1 4 4v4H6z" fill="#e8a000" />
      <path d="M6 24h52v24a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#ffc83d" />
      <rect x="6" y="40" width="52" height="12" rx="4" fill="#ffd96a" />
      <rect x="22" y="44" width="20" height="5" rx="2.5" fill="#0f6cbd" />
    </>,
    "explorer",
  );
}

export function Edge({ size }: IconProps) {
  return svg(
    size,
    <>
      <defs>
        <linearGradient id="edgeA" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0c59a4" />
          <stop offset="1" stopColor="#114a8b" />
        </linearGradient>
        <linearGradient id="edgeB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#35c1f1" />
          <stop offset="0.6" stopColor="#1b9de2" />
          <stop offset="1" stopColor="#36d085" />
        </linearGradient>
      </defs>
      {/* Grande vague bleu-vert qui s'enroule, et sa partie sombre à l'intérieur */}
      <path d="M57 39c-1.6 9.6-11.5 17-23.6 17C18.5 56 7 45.4 7 31.5 7 17.4 18.7 7 33 7c13 0 24 9.4 24 21.4 0 6.6-5.4 10.6-11.6 10.6-5 0-8.4-2.6-8.4-6 0-1.4.7-2.5 1.4-3.6C34 32 30 30.5 26.4 32.6 22.6 34.8 21 39.6 22.6 44c2.6 7 11 10.6 19.8 8.6 6.4-1.4 11.4-6.2 14.6-13.6z" fill="url(#edgeB)" />
      <path d="M26.4 32.6c3.6-2.1 7.6-.6 11 .2-.7 1.1-1.4 2.2-1.4 3.6 0 3.4 3.4 6 8.4 6 3.5 0 6.8-1.3 9-3.6-4.2 9.2-12.6 13.4-22 11.6-8-1.6-12.6-8.6-11.8-14.6.5-1.4 1.8-2.4 6.8-3.2z" fill="url(#edgeA)" opacity="0.85" />
    </>,
    "edge",
  );
}

export function MicrosoftStore({ size }: IconProps) {
  return svg(
    size,
    <>
      <path d="M22 18v-2a10 10 0 0 1 20 0v2" fill="none" stroke="#9aa0a8" strokeWidth="3" />
      <path d="M7 19h50l-3 34a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill="#eef0f3" stroke="#a9aeb6" strokeWidth="2" />
      <rect x="19" y="26" width="12" height="12" fill="#f25022" />
      <rect x="33" y="26" width="12" height="12" fill="#7fba00" />
      <rect x="19" y="40" width="12" height="12" fill="#00a4ef" />
      <rect x="33" y="40" width="12" height="12" fill="#ffb900" />
    </>,
    "store",
  );
}

// ---------- macOS ----------

export function Finder({ size }: IconProps) {
  return svg(
    size,
    <>
      <defs>
        <clipPath id="finderClip">
          <rect x="4" y="4" width="56" height="56" rx="13" />
        </clipPath>
      </defs>
      <g clipPath="url(#finderClip)">
        <rect x="4" y="4" width="56" height="56" fill="#9fdcff" />
        {/* Profil du visage : la moitié droite est d'un bleu plus soutenu */}
        <path d="M34 4c-5 14 4 20-2 34-1.5 4 1 8 2 22h26V4z" fill="#1e7cf2" />
        <rect x="20" y="20" width="3.2" height="10" rx="1.6" fill="#0b2a55" />
        <rect x="41" y="20" width="3.2" height="10" rx="1.6" fill="#fff" />
        <path d="M17 44q15 9 30 0" fill="none" stroke="#0b2a55" strokeWidth="3" strokeLinecap="round" />
      </g>
    </>,
    "finder",
  );
}

export function Safari({ size }: IconProps) {
  const ticks = Array.from({ length: 24 }, (_, i) => i * 15);
  return svg(
    size,
    <>
      <defs>
        <radialGradient id="safariBlue" cx="50%" cy="35%" r="65%">
          <stop offset="0" stopColor="#58d0ff" />
          <stop offset="1" stopColor="#1468e2" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="13" fill="#f4f6f9" />
      <circle cx="32" cy="32" r="22" fill="url(#safariBlue)" />
      {ticks.map((a) => (
        <line key={a} x1="32" y1="12.5" x2="32" y2={a % 45 === 0 ? 16.5 : 14.5} stroke="#fff" strokeWidth="1" transform={`rotate(${a} 32 32)`} />
      ))}
      <g transform="rotate(45 32 32)">
        <path d="M32 15l4 17h-8z" fill="#ff3b30" />
        <path d="M32 49l4-17h-8z" fill="#fff" />
      </g>
    </>,
    "safari",
  );
}

export function Messages({ size }: IconProps) {
  return svg(
    size,
    <>
      <defs>
        <linearGradient id="msgGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#62f37a" />
          <stop offset="1" stopColor="#0cbd2a" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="13" fill="url(#msgGreen)" />
      <path d="M32 15c-11 0-19.5 7.2-19.5 16 0 5 2.7 9.4 7 12.4-.4 2.5-1.8 4.7-3.8 6.3 4 .2 7.6-1 10.4-3.3 1.9.4 3.9.6 5.9.6 11 0 19.5-7.2 19.5-16S43 15 32 15z" fill="#fff" />
    </>,
    "messages",
  );
}

export function Mail({ size }: IconProps) {
  return svg(
    size,
    <>
      <defs>
        <linearGradient id="mailBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fb6ff" />
          <stop offset="1" stopColor="#1366e4" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="13" fill="url(#mailBlue)" />
      <rect x="13" y="20" width="38" height="25" rx="3" fill="#fff" />
      <path d="M14 22l18 13 18-13" fill="none" stroke="#9cc9f5" strokeWidth="2.5" strokeLinejoin="round" />
    </>,
    "mail",
  );
}

export function Photos({ size }: IconProps) {
  const petals = ["#ffb800", "#ff8a00", "#ff3b5c", "#d943ab", "#8a4bff", "#3a87ff", "#34c3e0", "#5bd160"];
  return svg(
    size,
    <>
      <rect x="4" y="4" width="56" height="56" rx="13" fill="#fff" />
      {petals.map((c, i) => (
        <ellipse key={c} cx="32" cy="21" rx="6" ry="11" fill={c} opacity="0.85" transform={`rotate(${i * 45} 32 32)`} style={{ mixBlendMode: "multiply" }} />
      ))}
    </>,
    "photos",
  );
}
