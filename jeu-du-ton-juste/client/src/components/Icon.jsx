// Icônes du jeu : traits sur une grille 24 × 24, bouts arrondis, couleur du texte (même style que l'app Six).
const PATHS = {
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.01',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11.5v1',
  lightbulb:
    'M9 18h6M10 22h4M8.2 14.5A7 7 0 1 1 15.8 14.5c-.9.7-1.3 1.5-1.5 2.5h-4.6c-.2-1-.6-1.8-1.5-2.5z',
  medal:
    'M8 3l3 6M16 3l-3 6M12 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 12.5l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  gem: 'M6 3h12l4 6-10 12L2 9zM2 9h20M12 3l-3 6 3 12 3-12-3-6',
  trophy:
    'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4v4h-4z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  checkCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l3 3 5-6',
  xCircle: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  tool: 'M14.5 4.5a4.5 4.5 0 0 0-5.6 5.9L3.5 15.8V20h4.2l5.4-5.4a4.5 4.5 0 0 0 5.9-5.6l-2.8 2.8-3.2-.8-.8-3.2z',
  refresh: 'M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  book: 'M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h14v-4',
  pen: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  send: 'M4 12l16-8-6 16-3-7z',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  loader: 'M12 3a9 9 0 1 0 9 9',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
};

/** Icône décorative (aria-hidden) : le texte voisin porte le sens. `fill` remplit la forme (étoile gagnée). */
export default function Icon({ name, size = 18, fill = false, className = '' }) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
