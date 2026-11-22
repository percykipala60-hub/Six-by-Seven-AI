export interface OcrLine {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

// Seules les heures écrites avec « : » sont retirées : « 16h30 » dans un message est du contenu, pas une heure d'envoi.
const ONLY_TIME = /^\d{1,2}:\d{2}(\s?[APap][Mm])?$/;
const TRAILING_TIME = /\s+\d{1,2}:\d{2}(\s?[APap][Mm])?(\s?[✓✔vV/]{1,3})?$/;
const DAY_SEPARATOR = /^(aujourd'?hui|hier|today|yesterday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/i;

/**
 * Transforme les lignes lues sur une capture en conversation « Moi: … / Autre: … ».
 * Les bulles de l'utilisateur sont décalées vers la droite, celles de l'autre personne collées à gauche.
 * C'est une estimation : l'utilisateur relit et corrige le texte avant de continuer.
 */
export function linesToConversation(lines: OcrLine[], width: number): string {
  const kept: OcrLine[] = [];
  for (const l of [...lines].sort((a, b) => a.y0 - b.y0)) {
    const text = l.text.trim().replace(TRAILING_TIME, "").trim();
    if (!text || ONLY_TIME.test(text) || DAY_SEPARATOR.test(text)) continue;
    kept.push({ ...l, text });
  }
  if (!kept.length) return "";

  const leftEdge = Math.min(...kept.map((l) => l.x0));
  const spread = Math.max(...kept.map((l) => l.x0)) - leftEdge;
  const twoSides = spread > width * 0.06;
  const isMine = (l: OcrLine): boolean =>
    twoSides ? l.x0 > leftEdge + width * 0.06 : (l.x0 + l.x1) / 2 > width * 0.55;

  const messages: { side: "Moi" | "Autre"; text: string; lastY1: number; h: number }[] = [];
  for (const l of kept) {
    const side = isMine(l) ? "Moi" : "Autre";
    const h = Math.max(1, l.y1 - l.y0);
    const prev = messages[messages.length - 1];
    if (prev && prev.side === side && l.y0 - prev.lastY1 < prev.h * 1.1) {
      prev.text += ` ${l.text}`;
      prev.lastY1 = l.y1;
    } else {
      messages.push({ side, text: l.text, lastY1: l.y1, h });
    }
  }
  return messages.map((m) => `${m.side}: ${m.text}`).join("\n");
}
