import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { readChatFromZip } from "@/lib/zip";

// Construit un .zip minimal pour les tests (entrées stockées ou compressées).
function makeZip(files: { name: string; content: string; deflate?: boolean }[]): ArrayBuffer {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = enc.encode(f.content);
    const data = f.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, f.deflate ? 8 : 0, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, f.deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    all.set(part, p);
    p += part.length;
  }
  return all.buffer;
}

describe("readChatFromZip", () => {
  it("lit une discussion compressée parmi d'autres fichiers", async () => {
    const zip = makeZip([
      { name: "IMG-0001.jpg", content: "binaire" },
      { name: "Discussion WhatsApp avec Patrick.txt", content: "12/09/2026, 14:33 - Patrick: Salut é", deflate: true },
    ]);
    const r = await readChatFromZip(zip);
    expect(r.name).toBe("Discussion WhatsApp avec Patrick.txt");
    expect(r.text).toBe("12/09/2026, 14:33 - Patrick: Salut é");
  });

  it("lit une entrée stockée sans compression", async () => {
    const r = await readChatFromZip(makeZip([{ name: "_chat.txt", content: "bonjour" }]));
    expect(r.text).toBe("bonjour");
  });

  it("refuse un zip sans .txt et un fichier qui n'est pas un zip", async () => {
    await expect(readChatFromZip(makeZip([{ name: "photo.jpg", content: "x" }]))).rejects.toThrow(/Aucune discussion/);
    await expect(readChatFromZip(new TextEncoder().encode("pas un zip du tout, vraiment pas un zip").buffer)).rejects.toThrow(/zip valide/);
  });
});
