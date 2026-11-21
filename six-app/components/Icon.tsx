const PATHS = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  sliders: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  plus: "M12 5v14M5 12h14",
  clip: "M8 4h8v3H8zM16 5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  alert: "M12 3l10 18H2zM12 10v4M12 17.5v.01",
  back: "M15 5l-7 7 7 7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  refresh: "M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5",
  pencil: "M4 20l1-4L16 5l3 3L8 19zM14 7l3 3",
  file: "M6 2h8l5 5v15H6zM14 2v5h5M9 13h6M9 17h6",
  copy: "M9 9h11v11H9zM5 15V4h11",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5v.01",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z",
  phone: "M7 2h10v20H7zM11 18h2",
  up: "M12 19V5M5 12l7-7 7 7",
  chevron: "M9 6l6 6-6 6",
  menu: "M4 7h16M4 12h16M4 17h10",
  x: "M6 6l12 12M18 6L6 18",
  type: "M5 6V4h14v2M12 4v16M9 20h6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  bell:"M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
