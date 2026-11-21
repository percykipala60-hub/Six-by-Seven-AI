// Copie les fichiers de lecture de captures (OCR) dans public/ocr pour les servir depuis notre propre site.
// Rien n'est téléchargé depuis un site tiers : la capture est lue sur le téléphone, jamais envoyée.
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });

const copy = (from, to) => {
  if (!existsSync(from)) throw new Error(`Fichier OCR introuvable : ${from} (lance npm install)`);
  copyFileSync(from, join(out, to));
};

copy(join(root, 'node_modules/tesseract.js/dist/worker.min.js'), 'worker.min.js');
copy(
  join(root, 'node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz'),
  'fra.traineddata.gz',
);

const core = join(root, 'node_modules/tesseract.js-core');
for (const f of readdirSync(core)) {
  if (f.includes('lstm') && /\.(js|wasm)$/.test(f)) copy(join(core, f), f);
}
console.log('OCR : fichiers copiés dans public/ocr');
