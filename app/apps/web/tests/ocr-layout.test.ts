import { describe, expect, it } from 'vitest';
import { linesToConversation, type OcrLine } from '@/lib/ocr-layout';

const W = 1000;
const line = (text: string, x0: number, x1: number, y0: number): OcrLine => ({
  text,
  x0,
  x1,
  y0,
  y1: y0 + 30,
});

describe('linesToConversation', () => {
  it('sépare les bulles de gauche (autre) et de droite (moi)', () => {
    const out = linesToConversation(
      [
        line("Salut, tu peux m'envoyer", 60, 420, 100),
        line('le dossier ?', 60, 220, 134),
        line('Je suis en cours', 600, 900, 260),
      ],
      W,
    );
    expect(out).toBe("Autre: Salut, tu peux m'envoyer le dossier ?\nMoi: Je suis en cours");
  });

  it("ignore les heures, les séparateurs de jour et retire l'heure en fin de bulle", () => {
    const out = linesToConversation(
      [
        line("Aujourd'hui", 400, 600, 20),
        line('Ok je regarde 14:32 ✓✓', 620, 940, 100),
        line('14:33', 100, 160, 200),
      ],
      W,
    );
    expect(out).toBe('Moi: Ok je regarde');
  });

  it('place une courte bulle de droite du bon côté et garde « 16h30 » dans le message', () => {
    const out = linesToConversation(
      [
        line('Salut, tu peux envoyer le dossier ?', 40, 560, 80),
        line("Je suis là jusqu'à 16h30 14:32", 200, 480, 180),
      ],
      720,
    );
    expect(out).toBe("Autre: Salut, tu peux envoyer le dossier ?\nMoi: Je suis là jusqu'à 16h30");
  });

  it("garde l'ordre vertical même si la lecture est désordonnée", () => {
    const out = linesToConversation(
      [line('Deuxième', 70, 300, 300), line('Première', 70, 300, 100)],
      W,
    );
    expect(out).toBe('Autre: Première\nAutre: Deuxième');
  });

  it("renvoie vide quand rien n'est lisible", () => {
    expect(linesToConversation([line('  ', 0, 10, 0)], W)).toBe('');
  });
});

describe('linesToConversation : captures réelles', () => {
  const H = 2000;
  const ligne = (
    text: string,
    x0: number,
    x1: number,
    y0: number,
    extra: Partial<OcrLine> = {},
  ): OcrLine => ({ text, x0, x1, y0, y1: y0 + 30, ...extra });

  it("retire l'en-tête, la barre de saisie et l'état du contact", () => {
    const out = linesToConversation(
      [
        ligne('22:33 LTE 45', 40, 400, 20),
        ligne('Junior', 120, 260, 110),
        ligne('en ligne', 120, 240, 150),
        ligne('On se voit samedi ?', 60, 500, 600),
        ligne('Message', 80, 260, 1900),
      ],
      W,
      H,
    );
    expect(out).toBe('Autre: On se voit samedi ?');
  });

  it('ignore les lignes mal lues (faible confiance ou sans lettres)', () => {
    const out = linesToConversation(
      [
        ligne('Salut', 60, 300, 500),
        ligne('~|/', 60, 120, 600),
        ligne('hjkq zxw', 60, 300, 700, { confiance: 20 }),
      ],
      W,
      H,
    );
    expect(out).toBe('Autre: Salut');
  });

  it("sépare par couleur de bulle, même pour une longue bulle de l'utilisateur", () => {
    const out = linesToConversation(
      [
        ligne('Tu viens à la fête ?', 50, 500, 500, { fond: '32,44,51' }),
        ligne('Oui je viens, mais je serai un peu en retard à cause du travail', 120, 960, 600, {
          fond: '0,92,75',
        }),
        ligne('Ok', 900, 960, 700, { fond: '0,92,75' }),
      ],
      W,
      H,
    );
    expect(out).toBe(
      'Autre: Tu viens à la fête ?\nMoi: Oui je viens, mais je serai un peu en retard à cause du travail\nMoi: Ok',
    );
  });
});

describe('linesToConversation : heure sans deux-points', () => {
  it("retire « 2110 » en fin de bulle, garde un nombre qui n'est pas une heure", () => {
    const l = (text: string, y0: number): OcrLine => ({ text, x0: 600, x1: 900, y0, y1: y0 + 30 });
    expect(linesToConversation([l('Je viendrai samedi 2110', 100)], 1000)).toBe(
      'Moi: Je viendrai samedi',
    );
    expect(linesToConversation([l('Il coûte 9500', 100)], 1000)).toBe('Moi: Il coûte 9500');
  });
});
