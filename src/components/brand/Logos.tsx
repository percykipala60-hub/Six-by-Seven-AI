// Logos redessinés en vectoriel d'après les planches officielles.
// Le trait "humain" suit la couleur du texte (blanc sur fond sombre, bleu nuit sur fond clair) ;
// le trait "IA" reste toujours bleu.

type MarkProps = { size?: number; className?: string; title?: string };

export function SixMark({ size = 32, className, title }: MarkProps) {
  return (
    <svg
      viewBox="150 120 345 395"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M272 278Q225 378 194 486" stroke="var(--brand-blue)" strokeWidth="38" />
      <path
        d="M178 175Q318 228 465 148L302.4 361.4A80 80 0 1 0 429.6 458.6A80 80 0 1 0 302.4 361.4"
        stroke="currentColor"
        strokeWidth="38"
      />
    </svg>
  );
}

export function SevenMark({ size = 32, className, title, withAI = true }: MarkProps & { withAI?: boolean }) {
  return (
    <svg
      viewBox={withAI ? "130 175 450 305" : "130 175 325 305"}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="32">
        <path d="M148 193H362Q262 310 240 462" stroke="currentColor" />
        <path d="M437 193Q337 310 315 462" stroke="var(--brand-blue)" />
      </g>
      {withAI && (
        <path
          fill="var(--brand-blue)"
          fillRule="evenodd"
          transform="translate(505 420)"
          d="M0 55L20 0H32L52 55H40L36 43H16L12 55ZM19.5 33H32.5L26 14.5ZM60 0H72V55H60Z"
        />
      )}
    </svg>
  );
}

// Icône d'application : le 6 sur un carré arrondi bleu nuit.
export function SixAppIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: "var(--navy-950)",
        color: "var(--brand-white)",
        flex: "none",
      }}
      aria-hidden="true"
    >
      <SixMark size={size * 0.62} />
    </span>
  );
}

// Logo complet « Six by Seven.AI » : icône, nom, puis la signature Seven.AI sur la même ligne.
export function SixLogo({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.3 }}
      role="img"
      aria-label="Six by Seven.AI"
    >
      <SixMark size={size} />
      <span style={{ font: `800 ${size * 0.82}px/1 var(--font-wordmark)`, letterSpacing: "-0.03em" }}>Six</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: size * 0.16,
          marginLeft: size * 0.05,
          paddingLeft: size * 0.3,
          borderLeft: "1px solid currentColor",
          borderColor: "color-mix(in srgb, currentColor 25%, transparent)",
          font: `500 ${size * 0.42}px/1 var(--font-body)`,
        }}
      >
        <span style={{ opacity: 0.65 }}>by</span>
        <SevenMark size={size * 0.5} withAI={false} />
        <span style={{ fontWeight: 600 }}>Seven.AI</span>
      </span>
    </span>
  );
}
