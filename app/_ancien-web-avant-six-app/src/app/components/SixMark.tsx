interface SixMarkProps {
  size?: number;
  title?: string;
}

/** Symbole de Six : la barre du 7 s'enroule en 6, le trait bleu (l'IA) marche à côté. */
export function SixMark({ size = 64, title }: SixMarkProps) {
  return (
    <svg
      viewBox="-3 2 120 120"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M20 24Q54 36 92 18C72 42 50 62 46 86A20 20 0 0 0 86 86A20 20 0 0 0 51.9 71.9"
        stroke="var(--color-text)"
        strokeWidth={10}
      />
      <path d="M43 50C36 64 27 84 23 104" stroke="var(--color-accent)" strokeWidth={10} />
    </svg>
  );
}
