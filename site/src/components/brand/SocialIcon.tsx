import type { SocialId } from "../../content/site";

// Icônes des réseaux, dessinées au trait pour rester cohérentes avec le reste de l'interface.
const paths: Record<SocialId, React.ReactNode> = {
  whatsapp: (
    <>
      <path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z" />
      <path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 1a5 5 0 0 1-2.9-2.9l1-1-1-2z" />
    </>
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
    </>
  ),
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10.5V16M8 7.6v.01M11.5 16v-5.5M11.5 13a2.5 2.5 0 0 1 5 0v3" />
    </>
  ),
  tiktok: <path d="M13 3v11.5a3.5 3.5 0 1 1-3.5-3.5M13 3c.4 2.6 2.4 4.6 5 5" />,
  facebook: <path d="M15 3.5h-1.8A3.7 3.7 0 0 0 9.5 7.2V10H7v3.5h2.5V21H13v-7.5h2.4L16 10h-3V7.6c0-.6.4-1 1-1h1z" />,
};

export function SocialIcon({ id, size = 20 }: { id: SocialId; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[id]}
    </svg>
  );
}
