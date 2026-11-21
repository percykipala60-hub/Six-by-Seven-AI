/** Icônes simples (traits), décoratives : toujours avec un texte à côté. */
const paths = {
  whatsapp: 'M20 12a8 8 0 01-11.9 7L4 20l1.1-4A8 8 0 1120 12z',
  texte: 'M8 4h8a2 2 0 012 2v14H6V6a2 2 0 012-2zm1 5h6m-6 4h6m-6 4h3',
  ton: 'M4 12c2-4 4-4 6 0s4 4 6 0 4-4 4-4M4 18h16',
  idee: 'M9 18h6m-5 3h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0012 3z',
  bouclier: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zm-3 9l2 2 4-4',
  cadenas: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z',
  signal: 'M3 12a9 9 0 0118 0M12 3a15 15 0 010 18M7 21h10',
  plus: 'M12 5v14M5 12h14',
} as const;

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
