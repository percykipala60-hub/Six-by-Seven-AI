import { describe, expect, it } from 'vitest';
import { lienPartage, messagesAPartager } from '@/lib/cloud';
import type { ChatMessage } from '@/lib/types';

describe('Cloud : partage d’une discussion', () => {
  it('ne garde que le texte des questions et réponses, borné', () => {
    const messages = [
      {
        role: 'user',
        content: 'Bonjour',
        pieces: [{ nom: 'cni.jpg', apercu: 'data:image/jpeg;base64,AAA' }],
      },
      { role: 'assistant', content: 'x'.repeat(30_000) },
      { role: 'user', content: '   ' },
    ] as unknown as ChatMessage[];
    const r = messagesAPartager(messages);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ role: 'user', content: 'Bonjour' }); // pas de pièce jointe
    expect(r[1].content).toHaveLength(20_000);
  });

  it('pointe toujours vers l’app en ligne', () => {
    expect(lienPartage('abc')).toBe('https://app.sixbysevenai.com/partage/abc');
  });
});
