import { describe, expect, it } from "vitest";
import { linesToConversation, type OcrLine } from "@/lib/ocr-layout";

const W = 1000;
const line = (text: string, x0: number, x1: number, y0: number): OcrLine => ({ text, x0, x1, y0, y1: y0 + 30 });

describe("linesToConversation", () => {
  it("sépare les bulles de gauche (autre) et de droite (moi)", () => {
    const out = linesToConversation(
      [line("Salut, tu peux m'envoyer", 60, 420, 100), line("le dossier ?", 60, 220, 134), line("Je suis en cours", 600, 900, 260)],
      W,
    );
    expect(out).toBe("Autre: Salut, tu peux m'envoyer le dossier ?\nMoi: Je suis en cours");
  });

  it("ignore les heures, les séparateurs de jour et retire l'heure en fin de bulle", () => {
    const out = linesToConversation(
      [line("Aujourd'hui", 400, 600, 20), line("Ok je regarde 14:32 ✓✓", 620, 940, 100), line("14:33", 100, 160, 200)],
      W,
    );
    expect(out).toBe("Moi: Ok je regarde");
  });

  it("place une courte bulle de droite du bon côté et garde « 16h30 » dans le message", () => {
    const out = linesToConversation(
      [line("Salut, tu peux envoyer le dossier ?", 40, 560, 80), line("Je suis là jusqu'à 16h30 14:32", 200, 480, 180)],
      720,
    );
    expect(out).toBe("Autre: Salut, tu peux envoyer le dossier ?\nMoi: Je suis là jusqu'à 16h30");
  });

  it("garde l'ordre vertical même si la lecture est désordonnée", () => {
    const out = linesToConversation([line("Deuxième", 70, 300, 300), line("Première", 70, 300, 100)], W);
    expect(out).toBe("Autre: Première\nAutre: Deuxième");
  });

  it("renvoie vide quand rien n'est lisible", () => {
    expect(linesToConversation([line("  ", 0, 10, 0)], W)).toBe("");
  });
});
