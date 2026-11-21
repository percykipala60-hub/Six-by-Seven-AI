import { describe, expect, it } from 'vitest';
import {
  applyMask,
  detectScam,
  findSensitive,
  looksLikePhoneNumber,
  maskConversation,
  parseThread,
  unmask,
} from '../src/index.js';

const exportWa = [
  '01/10/2026 21:02 - Mariane Kabongo🤍: Coucou, tu viens chez Glodi samedi ?',
  '01/10/2026 21:03 - Vous: oui, envoie-moi son numéro',
  '01/10/2026 21:04 - Mariane Kabongo🤍: +243 81 234 5678 ou glodi.mbuyi@gmail.com',
  '01/10/2026 21:05 - Mariane Kabongo🤍: Ramène 10 000 FC pour le cadeau, c’est à 17h30',
].join('\n');

describe('masquage sur le téléphone', () => {
  it('masque numéros, e-mails, participants et prénoms connus', () => {
    const { masked } = maskConversation(exportWa);
    for (const secret of ['Mariane', 'Kabongo', 'Glodi', 'glodi.mbuyi@gmail.com', '234 5678']) {
      expect(masked).not.toContain(secret);
    }
    expect(masked).toContain('[TEL 1]');
    expect(masked).toContain('[EMAIL 1]');
  });

  it('garde ce dont l’agent a besoin : montants, heures, emoji du contact, « Vous »', () => {
    const { masked } = maskConversation(exportWa);
    expect(masked).toContain('10 000 FC');
    expect(masked).toContain('17h30');
    expect(masked).toMatch(/\[NOM \d\] \[NOM \d\]🤍: Coucou/);
    expect(masked).toContain(' - Vous: ');
    // Le fil masqué reste un export WhatsApp lisible.
    expect(parseThread(masked).map((m) => m.author)).toContain('Vous');
  });

  it('donne toujours le même remplaçant au même nom', () => {
    const { masked } = maskConversation('Glodi: salut\nMoi: Glodi tu es où ?');
    const tags = masked.match(/\[NOM \d+\]/g) ?? [];
    expect(new Set(tags).size).toBe(1);
  });

  it('remet les vrais noms dans les brouillons, sur le téléphone seulement', () => {
    const { masked, table } = maskConversation(exportWa);
    const nom = masked.match(/\[NOM \d+\]/)?.[0] ?? '';
    expect(unmask(`Ok ${nom}, j’arrive à 17h30`, table)).toMatch(
      /^Ok (Mariane|Kabongo|Glodi), j’arrive/,
    );
  });

  it('laisse l’utilisateur décocher une fausse détection', () => {
    const text = 'Rachel: Grâce à toi on a fini';
    const spans = findSensitive(text);
    const rachel = spans.findIndex((s) => s.value === 'Rachel');
    expect(rachel).toBeGreaterThanOrEqual(0);
    expect(spans.some((s) => s.value === 'Grâce')).toBe(false); // mot courant, pas un prénom
    const { masked } = applyMask(text, spans, new Set([rachel]));
    expect(masked).toContain('Rachel');
  });

  it('ajoute les noms que l’utilisateur signale lui-même', () => {
    const { masked } = maskConversation('Moi: je vois Bobo demain', { extraNames: ['Bobo'] });
    expect(masked).not.toContain('Bobo');
  });

  it('reconnaît les numéros congolais sous toutes leurs formes', () => {
    for (const tel of [
      '+243812345678',
      '+243 81 234 5678',
      '0812345678',
      '081 234 56 78',
      '00243 99 876 5432',
    ]) {
      expect(maskConversation(`Moi: appelle ${tel} stp`).masked).not.toMatch(/\d{3}/);
    }
  });

  it('un expéditeur inconnu masqué reste « inconnu » pour l’anti-arnaque', () => {
    const scam =
      '01/10/2026 09:41 - +243 81 234 5647: Votre compte M-Pesa sera bloqué. Envoyez votre code PIN.';
    const { masked } = maskConversation(scam);
    const [msg] = parseThread(masked);
    expect(msg?.author).toBe('[TEL 1]');
    expect(looksLikePhoneNumber(msg?.author)).toBe(true);
    expect(detectScam([msg?.text ?? ''], true).niveau).toBe('eleve');
  });
});

describe('remasquage d’un brouillon modifié', () => {
  it('remet les remplaçants avant toute retouche demandée au serveur', async () => {
    const { remask } = await import('../src/index.js');
    const table = { '[NOM 1]': 'Mariane', '[TEL 1]': '0812345678' };
    expect(remask('Ok Mariane, je t’appelle au 0812345678', table)).toBe(
      'Ok [NOM 1], je t’appelle au [TEL 1]',
    );
    expect(remask('Marianel est là', table)).toBe('Marianel est là');
  });
});
