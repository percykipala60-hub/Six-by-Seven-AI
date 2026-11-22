import { describe, expect, it } from 'vitest';
import { unmask } from '@six/shared';
import {
  excerpt,
  prepare,
  previewMask,
  readConversation,
  segments,
  styleOf,
} from '@/lib/conversation';

const exportWa = [
  '01/10/2026 21:02 - Mariane Kabongo🤍: Coucou, tu viens samedi ?',
  '01/10/2026 21:03 - Vous: oui',
  '01/10/2026 21:04 - Mariane Kabongo🤍: Appelle-moi au 0812345678',
  'stp avant 18h',
].join('\n');

describe('sur le téléphone, avant tout envoi', () => {
  it('reconnaît « Vous » et la personne à qui répondre', () => {
    const read = readConversation(exportWa);
    expect(read.ok && read.conversation.me).toBe('Vous');
    expect(read.ok && read.conversation.other).toBe('Mariane Kabongo🤍');
  });

  it('dit clairement quand le texte n’est pas une conversation', () => {
    expect(readConversation('   \n  ')).toEqual({
      ok: false,
      reason: expect.stringMatching(/aucun message/),
    });
  });

  it('détecte une arnaque sans réseau', () => {
    const read = readConversation(
      '01/10/2026 09:41 - +243 81 234 5647: Votre compte M-Pesa sera bloqué. Envoyez votre code PIN.',
    );
    expect(read.ok && read.conversation.scam.niveau).toBe('eleve');
  });

  it('un message sur plusieurs lignes devient une seule ligne de l’extrait', () => {
    const read = readConversation(exportWa);
    if (!read.ok) throw new Error('lecture');
    expect(excerpt(read.conversation.messages).split('\n')).toHaveLength(3);
  });

  it('ce qui part est masqué ; les vrais noms reviennent sur le téléphone', () => {
    const read = readConversation(exportWa);
    if (!read.ok) throw new Error('lecture');
    const preview = previewMask(read.conversation);
    const { masked, table, moi } = prepare(read.conversation, preview, new Set());
    expect(masked).not.toMatch(/Mariane|Kabongo|0812345678/);
    expect(moi).toBe('Vous');
    const tag = masked.match(/\[NOM \d+\]/)?.[0] ?? '';
    expect(unmask(`Oui ${tag} !`, table)).toMatch(/Oui (Mariane|Kabongo) !/);
  });

  it('un élément décoché reste en clair', () => {
    const read = readConversation('Rachel: on se voit au marché\nVous: ok');
    if (!read.ok) throw new Error('lecture');
    const preview = previewMask(read.conversation);
    const index = preview.spans.findIndex((s) => s.value === 'Rachel');
    expect(prepare(read.conversation, preview, new Set([index])).masked).toContain('Rachel');
  });

  it('le nom de l’utilisateur masqué est envoyé sous son remplaçant', () => {
    const read = readConversation('Glodi: tu viens ?\nDamien: oui', 'Damien');
    if (!read.ok) throw new Error('lecture');
    const { masked, moi } = prepare(read.conversation, previewMask(read.conversation), new Set());
    expect(moi).toMatch(/^\[NOM \d+\]$/);
    expect(masked).toContain(`${moi}: oui`);
  });

  it('la fiche de style ne contient que des nombres', () => {
    const read = readConversation(exportWa);
    if (!read.ok) throw new Error('lecture');
    const style = styleOf(read.conversation, { directe: 2 });
    expect(style.messages).toBe(1);
    expect(JSON.stringify(style)).not.toMatch(/Mariane|samedi/);
  });

  it('découpe l’extrait en lignes avec les éléments à vérifier', () => {
    const lines = segments('A: Glodi\nB: rien', [
      { start: 3, end: 8, kind: 'nom', value: 'Glodi', source: 'dictionnaire' },
    ]);
    expect(lines[0]?.line).toEqual([{ text: 'A: ' }, { text: 'Glodi', span: 0 }]);
    expect(lines[1]?.line).toEqual([{ text: 'B: rien' }]);
  });
});
