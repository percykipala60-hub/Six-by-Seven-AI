import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readZipTexts } from '@/lib/zip';
import { lastMessages, readConversation, recapOf } from '@/lib/conversation';

/** Fabrique un vrai zip (méthode 8, deflate) en mémoire, comme l'export iPhone. */
function makeZip(name: string, text: string): ArrayBuffer {
  const data = Buffer.from(text, 'utf8');
  const deflated = deflateRawSync(data);
  const nameBytes = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(deflated.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + deflated.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  const all = Buffer.concat([local, nameBytes, deflated, central, nameBytes, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

describe('import .zip (iPhone)', () => {
  it('lit _chat.txt dans le zip, sur le téléphone', async () => {
    const chat = '[01/10/2026 21:02:11] Mariane: Coucou 🤍\n[01/10/2026 21:03:40] Vous: hey';
    const [file] = await readZipTexts(makeZip('_chat.txt', chat));
    expect(file?.name).toBe('_chat.txt');
    expect(file?.text).toBe(chat);
  });

  it('refuse proprement un fichier qui n’est pas un zip', async () => {
    await expect(readZipTexts(new TextEncoder().encode('pas un zip').buffer)).rejects.toThrow(
      /zip/,
    );
  });
});

describe('limite d’envoi', () => {
  it('garde les derniers messages dans 2000 caractères', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      author: 'A',
      text: `${i} ${'x'.repeat(190)}`,
    }));
    const kept = lastMessages(many);
    expect(kept.length).toBeLessThan(12);
    expect(kept.at(-1)?.text.startsWith('39 ')).toBe(true);
    expect(kept.map((m) => m.text.length + 4).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2000);
  });

  it('un seul message très long est coupé, pas perdu', () => {
    const kept = lastMessages([{ author: 'A', text: 'y'.repeat(5000) }]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.text.length).toBeLessThan(2000);
  });
});

describe('carte récap (sans aucun mot du texte)', () => {
  it('calcule part des messages, temps de réponse et évolution du ton', () => {
    const read = readConversation(
      [
        '01/10/2026 21:00 - Mariane: tu viens ?',
        '01/10/2026 21:04 - Vous: oui',
        '01/10/2026 21:10 - Mariane: tu réponds ??',
        '01/10/2026 21:20 - Vous: pardon',
        '02/10/2026 08:00 - Mariane: sérieux ???',
      ].join('\n'),
    );
    if (!read.ok) throw new Error('lecture');
    const recap = recapOf(read.conversation);
    expect(recap.partMoi).toBe(40);
    expect(recap.reponseMoi).toBe(7); // (4 + 10) / 2
    expect(recap.tension.at(-1)).toBe(2);
    expect(JSON.stringify(recap)).not.toMatch(/viens|pardon|Mariane/);
  });
});
