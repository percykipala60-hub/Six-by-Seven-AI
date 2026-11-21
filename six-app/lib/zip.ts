// Lecture minimale d'un .zip (export WhatsApp avec ou sans médias), sans dépendance.
// Gère les entrées stockées et compressées (deflate). Pas de Zip64, pas de chiffrement.

export class ZipError extends Error {}

const MAX_TEXT_BYTES = 20_000_000;

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

function findEnd(view: DataView): number {
  const min = Math.max(0, view.byteLength - 22 - 65535);
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new ZipError("Ce fichier n'est pas un .zip valide.");
}

function listEntries(view: DataView): Entry[] {
  const end = findEnd(view);
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new ZipError("Ce .zip est trop gros. Exporte la discussion sans médias.");
  const entries: Entry[] = [];
  const decoder = new TextDecoder("utf-8");
  for (let i = 0; i < count; i++) {
    if (p + 46 > view.byteLength || view.getUint32(p, true) !== 0x02014b50) throw new ZipError("Ce .zip est abîmé.");
    const flags = view.getUint16(p + 8, true);
    if (flags & 1) throw new ZipError("Ce .zip est protégé par un mot de passe.");
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    entries.push({
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      localOffset: view.getUint32(p + 42, true),
      name: decoder.decode(new Uint8Array(view.buffer, view.byteOffset + p + 46, nameLen)),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function extract(view: DataView, e: Entry): Promise<string> {
  const lh = e.localOffset;
  if (view.getUint32(lh, true) !== 0x04034b50) throw new ZipError("Ce .zip est abîmé.");
  const start = lh + 30 + view.getUint16(lh + 26, true) + view.getUint16(lh + 28, true);
  const data = new Uint8Array(view.buffer, view.byteOffset + start, e.compressedSize);
  let bytes: Uint8Array;
  if (e.method === 0) {
    bytes = data;
  } else if (e.method === 8) {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    throw new ZipError("Ce .zip utilise un format de compression non pris en charge.");
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Renvoie le texte de la discussion contenue dans le .zip :
 * le fichier .txt dont le nom évoque une discussion, sinon le plus gros .txt.
 */
export async function readChatFromZip(buffer: ArrayBuffer): Promise<{ name: string; text: string }> {
  const view = new DataView(buffer);
  const txt = listEntries(view).filter(
    (e) => /\.txt$/i.test(e.name) && !e.name.startsWith("__MACOSX") && !e.name.endsWith("/") && e.size <= MAX_TEXT_BYTES,
  );
  if (!txt.length) throw new ZipError("Aucune discussion (.txt) dans ce .zip.");
  const named = txt.find((e) => /chat|discussion|whatsapp/i.test(e.name));
  const chosen = named ?? txt.reduce((a, b) => (b.size > a.size ? b : a));
  return { name: chosen.name, text: await extract(view, chosen) };
}
