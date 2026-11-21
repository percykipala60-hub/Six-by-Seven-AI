import { describe, expect, it } from 'vitest';
import { looksLikeWhatsApp, parseWhatsApp, speakerLabels, toConversation } from '@/lib/whatsapp';

const ANDROID = `12/09/2026, 14:32 - Les messages sont chiffrés de bout en bout.
12/09/2026, 14:33 - Patrick: Salut, tu peux m'envoyer le dossier ?
12/09/2026, 14:35 - Deborah: Je suis en cours
jusqu'à 16h30
12/09/2026, 14:36 - Patrick: <Médias omis>
12/09/2026, 14:40 - Patrick: Ok mais j'en ai besoin avant 17h`;

const IOS = `[12/09/2026 14:33:10] Patrick: Salut
[12/09/2026 14:34:01] Deborah: Coucou`;

describe('whatsapp', () => {
  it('lit le format Android, les suites de lignes et ignore système et médias', () => {
    expect(looksLikeWhatsApp(ANDROID)).toBe(true);
    const p = parseWhatsApp(ANDROID);
    expect(p.authors).toEqual(['Patrick', 'Deborah']);
    expect(p.messages).toHaveLength(3);
    expect(p.messages[1].text).toBe("Je suis en cours\njusqu'à 16h30");
  });

  it('lit le format iPhone', () => {
    const p = parseWhatsApp(IOS);
    expect(p.messages.map((m) => m.author)).toEqual(['Patrick', 'Deborah']);
  });

  it('garde les derniers messages dans la limite', () => {
    const p = parseWhatsApp(ANDROID);
    const r = toConversation(p.messages, 60);
    expect(r.text.length).toBeLessThanOrEqual(60);
    expect(r.text.endsWith('avant 17h')).toBe(true);
    expect(r.total).toBe(3);
  });

  it("repère les noms d'interlocuteurs d'un texte collé à la main", () => {
    expect(speakerLabels('Patrick: salut\nDeborah: coucou\nOk: oui')).toEqual([
      'Patrick',
      'Deborah',
    ]);
    expect(speakerLabels('Moi: salut\nAutre: coucou')).toEqual([]);
    expect(speakerLabels('Rendez-vous demain : 17h')).toEqual([]);
  });

  it('lit les variantes françaises et récentes (« à », tiret long, « Nom : », marques invisibles, date ISO)', () => {
    const variantes = [
      '03/10/2026 à 14:32 - Patrick: Salut',
      '03/10/2026, 14:33 – Deborah : Coucou',
      '‎[03/10/2026 14:34:10] Patrick: Tu viens ?',
      '2026-10-03, 14:35 - Deborah: Oui',
      '03/10/26, 2:36 PM - Patrick: Super',
    ].join('\n');
    expect(looksLikeWhatsApp(variantes)).toBe(true);
    const p = parseWhatsApp(variantes);
    expect(p.messages.map((m) => m.text)).toEqual([
      'Salut',
      'Coucou',
      'Tu viens ?',
      'Oui',
      'Super',
    ]);
    expect(p.authors).toEqual(['Patrick', 'Deborah']);
  });

  it('ne renvoie jamais une conversation vide quand le dernier message est très long', () => {
    const long = '12/09/2026, 14:33 - Patrick: ' + 'bla '.repeat(1000);
    const r = toConversation(parseWhatsApp(long).messages, 1700);
    expect(r.text.length).toBeGreaterThan(100);
    expect(r.text.length).toBeLessThanOrEqual(1700);
    expect(r.text.startsWith('Patrick: …')).toBe(true);
  });

  it('garde les vrais messages et ignore les messages système sans auteur', () => {
    const p = parseWhatsApp(
      '12/09/2026, 14:32 - Les messages sont chiffrés de bout en bout.\n12/09/2026, 14:33 - Patrick a créé ce groupe',
    );
    expect(p.messages).toHaveLength(0);
  });

  it('ne prend pas un texte libre pour un export', () => {
    expect(looksLikeWhatsApp("Salut, tu peux m'envoyer le dossier ?")).toBe(false);
  });
});
