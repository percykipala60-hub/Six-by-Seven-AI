import { describe, expect, it } from 'vitest';
import {
  mettreEnFile,
  prochainMessage,
  rendreALaSaisie,
  retirerDeFile,
  type MessageEnFile,
} from '@/lib/file-messages';

describe('file des messages envoyés pendant que Six travaille', () => {
  it('garde les messages dans l’ordre d’envoi et les rend un par un', () => {
    let file: MessageEnFile<string>[] = [];
    file = mettreEnFile(file, ' premier ', []);
    file = mettreEnFile(file, 'deuxième', ['doc.pdf']);
    expect(file.map((m) => m.texte)).toEqual(['premier', 'deuxième']);
    const { message, reste } = prochainMessage(file);
    expect(message?.texte).toBe('premier');
    expect(reste.map((m) => m.texte)).toEqual(['deuxième']);
    expect(prochainMessage(reste).message?.pieces).toEqual(['doc.pdf']);
    expect(prochainMessage([]).message).toBeUndefined();
  });

  it('ignore un message vide mais accepte une pièce seule', () => {
    expect(mettreEnFile([], '   ', [])).toEqual([]);
    expect(mettreEnFile([], '', ['image.png'])).toHaveLength(1);
  });

  it('retire un message annulé', () => {
    const file = mettreEnFile(mettreEnFile([], 'a', []), 'b', []);
    expect(retirerDeFile(file, file[0].id).map((m) => m.texte)).toEqual(['b']);
  });

  it('remet la file dans la barre après un échec, sans rien perdre', () => {
    const file = mettreEnFile(mettreEnFile([], 'a', ['p1']), 'b', ['p2']);
    expect(rendreALaSaisie(file, 'c', ['p3'])).toEqual({
      texte: 'a b c',
      pieces: ['p1', 'p2', 'p3'],
    });
    expect(rendreALaSaisie([], '', [])).toEqual({ texte: '', pieces: [] });
  });
});
