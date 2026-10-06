import { useId } from "react";
import { APP_PATHS } from "../phone3d/brandLogos";

export type MessagingApp = "whatsapp" | "messenger" | "telegram" | "instagram" | "sms" | "email";

// Icône d'application telle qu'elle apparaît sur un écran d'accueil : carré arrondi aux couleurs de l'appli.
const LOOK: Record<MessagingApp, { bg: string[]; glyph: string | "gradient" }> = {
  whatsapp: { bg: ["#2fe16e", "#1fb855"], glyph: "#ffffff" },
  messenger: { bg: ["#ffffff", "#ffffff"], glyph: "gradient" },
  telegram: { bg: ["#3db8f0", "#1d93d2"], glyph: "#ffffff" },
  instagram: { bg: ["#feda75", "#fa7e1e", "#d62976", "#962fbf", "#4f5bd5"], glyph: "#ffffff" },
  sms: { bg: ["#6af07f", "#13bf31"], glyph: "#ffffff" },
  email: { bg: ["#4aa8ff", "#1673e6"], glyph: "#ffffff" },
};

export function MessagingAppIcon({ app, size = 56 }: { app: MessagingApp; size?: number }) {
  const id = useId();
  const look = LOOK[app];
  const bgId = `${id}-bg`;
  const glyphId = `${id}-glyph`;
  // Instagram : dégradé en diagonale depuis le coin bas gauche ; les autres : du haut vers le bas.
  const diagonal = app === "instagram";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={bgId} x1="0" y1={diagonal ? "1" : "0"} x2={diagonal ? "1" : "0"} y2={diagonal ? "0" : "1"}>
          {look.bg.map((c, i) => (
            <stop key={c + i} offset={look.bg.length === 1 ? 0 : i / (look.bg.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={glyphId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0099ff" />
          <stop offset="0.6" stopColor="#a033ff" />
          <stop offset="1" stopColor="#ff5280" />
        </linearGradient>
      </defs>
      {/* Forme d'icône d'écran d'accueil (coins très arrondis), avec un liseré pour l'icône blanche. */}
      <rect x="1" y="1" width="62" height="62" rx="14.5" fill={`url(#${bgId})`} stroke={app === "messenger" ? "#e3e6ec" : "none"} />
      {app === "email" ? (
        // Enveloppe simple : l'e-mail n'appartient à aucune marque.
        <g fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
          <rect x="13" y="19" width="38" height="27" rx="4" />
          <path d="M14.5 21.5 32 34.5l17.5-13" />
        </g>
      ) : (
        <g transform="translate(14 14) scale(1.5)">
          <path d={APP_PATHS[app]} fill={look.glyph === "gradient" ? `url(#${glyphId})` : look.glyph} />
        </g>
      )}
    </svg>
  );
}
