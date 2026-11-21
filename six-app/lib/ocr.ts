import { linesToConversation, type OcrLine } from "./ocr-layout";

export const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 12_000_000;
const MAX_WIDTH = 1400; // assez net pour lire, assez léger pour un téléphone d'entrée de gamme

export class OcrError extends Error {}

async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new OcrError("Cette image n'a pas pu être ouverte. Essaie une capture en PNG ou JPG.");
  }
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new OcrError("Ton navigateur ne peut pas lire les images.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/**
 * Lit une ou plusieurs captures d'écran de conversation, sur l'appareil.
 * Les images ne quittent jamais le téléphone : seul le texte lu continue le parcours.
 */
export async function readScreenshots(files: File[], onProgress: (pct: number) => void): Promise<string> {
  if (files.length > MAX_IMAGES) throw new OcrError(`Choisis ${MAX_IMAGES} captures au maximum.`);
  for (const f of files) {
    if (!f.type.startsWith("image/")) throw new OcrError("Choisis des images (PNG ou JPG).");
    if (f.size > MAX_IMAGE_BYTES) throw new OcrError("Une image est trop lourde. Utilise une capture d'écran normale.");
  }

  const { createWorker } = await import("tesseract.js");
  let current = 0;
  const worker = await createWorker("fra", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    gzip: true,
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(Math.round(((current + m.progress) / files.length) * 100));
    },
  });

  try {
    const parts: string[] = [];
    for (const file of files) {
      const canvas = await toCanvas(file);
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const lines: OcrLine[] = [];
      for (const block of data.blocks ?? []) {
        for (const p of block.paragraphs) {
          for (const l of p.lines) {
            lines.push({ text: l.text, x0: l.bbox.x0, x1: l.bbox.x1, y0: l.bbox.y0, y1: l.bbox.y1 });
          }
        }
      }
      const text = linesToConversation(lines, canvas.width);
      if (text) parts.push(text);
      current += 1;
    }
    if (!parts.length) throw new OcrError("Aucun texte lisible sur la capture. Essaie une capture plus nette.");
    return parts.join("\n");
  } catch (e) {
    if (e instanceof OcrError) throw e;
    throw new OcrError("La lecture de la capture a échoué. Colle le texte à la place.");
  } finally {
    await worker.terminate();
  }
}
