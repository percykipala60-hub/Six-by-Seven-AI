// Génère les icônes PNG de la PWA à partir du symbole vectoriel de Six.
// Lancer : pnpm --filter @six/web icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const GROUND = '#0a0f1c';
const WHITE = '#f2f5fa';
const BLUE = '#4d7cfe';

/** `scale` = part de l'icône occupée par le symbole (0.56 pour une icône maskable). */
function iconSvg({ size, scale, radius = 0, stroke = 10 }) {
  const box = 120 / scale;
  const offset = (box - 120) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-3 - offset} ${2 - offset} ${box} ${box}">
  <rect x="${-3 - offset}" y="${2 - offset}" width="${box}" height="${box}" rx="${(radius / size) * box}" fill="${GROUND}"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${stroke}">
    <path d="M20 24Q54 36 92 18C72 42 50 62 46 86A20 20 0 0 0 86 86A20 20 0 0 0 51.9 71.9" stroke="${WHITE}"/>
    <path d="M43 50C36 64 27 84 23 104" stroke="${BLUE}"/>
  </g>
</svg>`;
}

function png(name, options) {
  const data = new Resvg(iconSvg(options), { fitTo: { mode: 'width', value: options.size } })
    .render()
    .asPng();
  writeFileSync(new URL(name, OUT), data);
  console.log(`✔ ${name}`);
}

png('icon-192.png', { size: 192, scale: 0.72 });
png('icon-512.png', { size: 512, scale: 0.72 });
png('maskable-512.png', { size: 512, scale: 0.56 });
png('apple-touch-icon.png', { size: 180, scale: 0.7 });
writeFileSync(
  new URL('favicon.svg', OUT),
  iconSvg({ size: 32, scale: 0.8, radius: 7, stroke: 13 }) + '\n',
);
console.log('✔ favicon.svg');
