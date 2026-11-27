import { linesToConversation, type OcrLine } from './ocr-layout';
import type { Worker } from 'tesseract.js';

export const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 12_000_000;
const MAX_WIDTH = 1400; // assez net pour lire, assez léger pour un téléphone d'entrée de gamme
const MIN_WIDTH = 1000; // une petite capture est agrandie : l'OCR lit mal les lettres trop petites
const REPOS_MS = 90_000; // le lecteur reste prêt 90 s après une lecture, puis libère la mémoire

export class OcrError extends Error {}

let lecteur: Promise<Worker> | null = null;
let arret: ReturnType<typeof setTimeout> | undefined;
let suivi: (p: number) => void = () => {};

/** Charge le lecteur (moteur et français, environ 4 Mo) une seule fois, et le garde prêt entre deux lectures. */
function obtenirLecteur(): Promise<Worker> {
  clearTimeout(arret);
  if (!lecteur) {
    lecteur = import('tesseract.js')
      .then(({ createWorker }) =>
        createWorker('fra', 1, {
          workerPath: '/ocr/worker.min.js',
          corePath: '/ocr',
          langPath: '/ocr',
          gzip: true,
          logger: (m) => {
            if (m.status === 'recognizing text') suivi(m.progress);
          },
        }),
      )
      .catch((e) => {
        lecteur = null;
        throw e;
      });
  }
  return lecteur;
}

function mettreEnRepos() {
  clearTimeout(arret);
  arret = setTimeout(() => {
    const l = lecteur;
    lecteur = null;
    void l?.then((w) => w.terminate()).catch(() => {});
  }, REPOS_MS);
}

/** À appeler quand l'utilisateur ouvre l'import : le lecteur se charge pendant qu'il choisit ses captures. */
export function prechaufferLecteur() {
  void obtenirLecteur()
    .then(mettreEnRepos)
    .catch(() => {
      /* hors-ligne ou mémoire faible : on réessaiera à la lecture */
    });
}

async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new OcrError("Cette image n'a pas pu être ouverte. Essayez une capture en PNG ou JPG.");
  }
  const scale =
    bitmap.width > MAX_WIDTH
      ? MAX_WIDTH / bitmap.width
      : bitmap.width < MIN_WIDTH
        ? MIN_WIDTH / bitmap.width
        : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new OcrError('Ton navigateur ne peut pas lire les images.');
  }
  ctx.imageSmoothingQuality = 'high';
  try {
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
  return canvas;
}

/**
 * Image pour la lecture : niveaux de gris, contraste étiré, et inversée si la capture est en mode sombre
 * (le lecteur lit mieux du texte foncé sur fond clair). Les couleurs d'origine restent pour reconnaître les bulles.
 */
function preparerPourLecture(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new OcrError('Ton navigateur ne peut pas lire cette image.');
  const img = sourceContext.getImageData(0, 0, width, height);
  const d = img.data;
  let somme = 0;
  for (let i = 0; i < d.length; i += 4) somme += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const sombre = somme / (d.length / 4) < 110;
  for (let i = 0; i < d.length; i += 4) {
    let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (sombre) y = 255 - y;
    y = Math.max(0, Math.min(255, (y - 128) * 1.35 + 128));
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outputContext = out.getContext('2d');
  if (!outputContext) throw new OcrError('Ton navigateur ne peut pas lire cette image.');
  outputContext.putImageData(img, 0, 0);
  return out;
}

const arrondi = (v: number) => Math.round(v / 24) * 24;

/** Couleur autour d'une ligne (juste avant et après le texte), comparée au fond de l'écran sur la même hauteur. */
function couleurBulle(
  img: ImageData,
  l: { x0: number; x1: number; y0: number; y1: number },
): string | undefined {
  const { width, height, data } = img;
  const y = Math.min(height - 1, Math.max(0, Math.round((l.y0 + l.y1) / 2)));
  const px = (x: number) => {
    const i = (y * width + Math.min(width - 1, Math.max(0, Math.round(x)))) * 4;
    return `${arrondi(data[i])},${arrondi(data[i + 1])},${arrondi(data[i + 2])}`;
  };
  const avant = px(l.x0 - 8);
  const apres = px(l.x1 + 8);
  const ecran = px(3);
  const fond = avant === apres ? avant : avant !== ecran ? avant : apres;
  return fond === ecran ? undefined : fond;
}

/**
 * Lit une ou plusieurs captures d'écran de conversation, sur l'appareil.
 * Les images ne quittent jamais le téléphone : seul le texte lu continue le parcours.
 */
export async function readScreenshots(
  files: File[],
  onProgress: (pct: number) => void,
): Promise<string> {
  if (!files.length) throw new OcrError("Choisissez au moins une capture d'écran.");
  if (files.length > MAX_IMAGES)
    throw new OcrError(`Choisissez ${MAX_IMAGES} captures au maximum.`);
  for (const f of files) {
    if (!f.type.startsWith('image/')) throw new OcrError('Choisissez des images (PNG ou JPG).');
    if (f.size > MAX_IMAGE_BYTES)
      throw new OcrError("Une image est trop lourde. Utilisez une capture d'écran normale.");
  }

  let current = 0;
  suivi = (p) => onProgress(Math.round(((current + p) / files.length) * 100));
  try {
    const worker = await obtenirLecteur();
    const parts: string[] = [];
    for (const file of files) {
      const canvas = await toCanvas(file);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new OcrError('Ton navigateur ne peut pas lire cette image.');
      const couleurs = context.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = await worker.recognize(preparerPourLecture(canvas), {}, { blocks: true });
      const lines: OcrLine[] = [];
      for (const block of data.blocks ?? []) {
        for (const p of block.paragraphs) {
          for (const l of p.lines) {
            const b = { x0: l.bbox.x0, x1: l.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1 };
            lines.push({
              text: l.text,
              ...b,
              confiance: l.confidence,
              fond: couleurBulle(couleurs, b),
            });
          }
        }
      }
      const text = linesToConversation(lines, canvas.width, canvas.height);
      if (text) parts.push(text);
      current += 1;
    }
    if (!parts.length)
      throw new OcrError('Aucun texte lisible sur la capture. Essayez une capture plus nette.');
    return parts.join('\n');
  } catch (e) {
    if (e instanceof OcrError) throw e;
    throw new OcrError('La lecture de la capture a échoué. Collez le texte à la place.');
  } finally {
    suivi = () => {};
    mettreEnRepos();
  }
}
