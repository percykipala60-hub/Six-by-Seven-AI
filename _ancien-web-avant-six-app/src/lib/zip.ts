/**
 * Lecture d'un export WhatsApp .zip (iPhone) dans le navigateur, sans bibliothèque :
 * on lit le répertoire central, puis on décompresse le .txt avec DecompressionStream.
 * Rien ne quitte le téléphone.
 */
export interface ZipText {
  name: string;
  text: string;
}

const MAX_TEXT = 20_000_000;

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}
function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Renvoie les fichiers .txt du zip (le chat s'appelle souvent « _chat.txt »). */
export async function readZipTexts(buffer: ArrayBuffer): Promise<ZipText[]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(view, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Ce fichier n’est pas un zip lisible.');
  const count = u16(view, end + 10);
  let offset = u32(view, end + 16);
  const decoder = new TextDecoder('utf-8');
  const out: ZipText[] = [];
  for (let n = 0; n < count; n++) {
    if (u32(view, offset) !== 0x02014b50) break;
    const method = u16(view, offset + 10);
    const compressed = u32(view, offset + 20);
    const size = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const local = u32(view, offset + 42);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!name.toLowerCase().endsWith('.txt') || size > MAX_TEXT) continue;
    const start = local + 30 + u16(view, local + 26) + u16(view, local + 28);
    const data = bytes.subarray(start, start + compressed);
    const raw = method === 0 ? data : method === 8 ? await inflate(data) : undefined;
    if (raw) out.push({ name: name.split('/').pop() ?? name, text: decoder.decode(raw) });
  }
  return out;
}

/** Fichier choisi par l'utilisateur (.txt ou .zip) → texte de la discussion. */
export async function readExportFile(file: File): Promise<string> {
  if (file.size > 30_000_000) throw new Error('Ce fichier est trop gros. Exporte « sans médias ».');
  const isZip = /\.zip$/i.test(file.name) || file.type.includes('zip');
  if (!isZip) return file.text();
  const texts = await readZipTexts(await file.arrayBuffer());
  const chat = texts.find((t) => /chat/i.test(t.name)) ?? texts[0];
  if (!chat) throw new Error('Aucune discussion (.txt) dans ce zip.');
  return chat.text;
}
