export interface OcrLine {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Confiance de la lecture (0-100), si l'OCR la donne. */
  confiance?: number;
  /** Couleur du fond de la bulle autour de la ligne (« r,g,b » arrondi), absente si c'est le fond de l'écran. */
  fond?: string;
}

// Seules les heures écrites avec « : » sont retirées : « 16h30 » dans un message est du contenu, pas une heure d'envoi.
const ONLY_TIME = /^\d{1,2}:\d{2}(\s?[APap][Mm])?$/;
const TRAILING_TIME = /\s+\d{1,2}:\d{2}(\s?[APap][Mm])?(\s?[✓✔vV/]{1,3})?$/;
// L'OCR perd parfois les « : » de l'heure d'envoi (« 21:10 » lu « 2110 ») : retirée seulement si c'est une heure valide.
const TRAILING_TIME_SANS_POINTS = /\s+([01]\d|2[0-3])[0-5]\d(\s?[✓✔vV/]{1,3})?$/;
const DAY_SEPARATOR =
  /^(aujourd'?hui|hier|today|yesterday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/i;
// Morceaux d'interface des messageries, pas des messages : état du contact, accusés de lecture, barre de saisie.
const INTERFACE = new RegExp(
  "^(en ligne|online|en train d'écrire.*|écrit\\.*|typing.*|vu( à .*)?|lu|seen.*|distribué|delivered|envoyé|sent|" +
    'message|tapez un message|écrire un message|écris un message|aa|imessage|sms|chiffré.*|les messages .* chiffrés.*|' +
    '\\d{1,2}[:h]\\d{2}.*(lte|4g|5g|%).*)$',
  'i',
);

/** Une ligne garde-t-elle du vrai texte ? Assez de lettres, et une lecture assez sûre. */
function lisible(l: OcrLine, text: string): boolean {
  if (l.confiance !== undefined && l.confiance < 45) return false;
  const lettres = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return lettres >= 2 || /^[\p{L}\p{N}]$/u.test(text);
}

/**
 * Transforme les lignes lues sur une capture en conversation « Moi: … / Autre: … ».
 * Qui parle : d'abord la couleur des bulles (les bulles de l'utilisateur ont leur couleur à elles), sinon le bord dont
 * la bulle est le plus proche (droite = l'utilisateur). Sans hauteur d'image, l'en-tête et la barre de saisie ne sont
 * pas retirés. C'est une estimation : la conversation masquée reste affichée dans le fil.
 */
export function linesToConversation(lines: OcrLine[], width: number, height?: number): string {
  const kept: OcrLine[] = [];
  for (const l of [...lines].sort((a, b) => a.y0 - b.y0)) {
    // En-tête (heure, batterie, nom du contact) et barre de saisie du bas.
    if (height && (l.y1 < height * 0.09 || l.y0 > height * 0.93)) continue;
    const text = l.text
      .trim()
      .replace(TRAILING_TIME, '')
      .replace(TRAILING_TIME_SANS_POINTS, '')
      .trim();
    if (
      !text ||
      ONLY_TIME.test(text) ||
      DAY_SEPARATOR.test(text) ||
      INTERFACE.test(text) ||
      !lisible(l, text)
    )
      continue;
    kept.push({ ...l, text });
  }
  if (!kept.length) return '';

  const gauche = Math.min(...kept.map((l) => l.x0));
  const droite = Math.max(...kept.map((l) => l.x1));
  const etroit = droite - gauche < width * 0.5; // tout tient d'un côté : on regarde où est le centre
  const aDroite = (l: OcrLine): number =>
    etroit ? (l.x0 + l.x1) / 2 - width * 0.55 : l.x0 - gauche - (droite - l.x1);

  // Couleurs de bulles : la couleur la plus « à droite » en moyenne est celle de l'utilisateur.
  const parCouleur = new Map<string, number[]>();
  for (const l of kept)
    if (l.fond) parCouleur.set(l.fond, [...(parCouleur.get(l.fond) ?? []), aDroite(l)]);
  const couleurs = [...parCouleur.entries()].filter(([, v]) => v.length >= 1);
  let couleurMoi = '';
  if (couleurs.length >= 2) {
    const moyenne = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    couleurs.sort((a, b) => moyenne(b[1]) - moyenne(a[1]));
    if (moyenne(couleurs[0][1]) > moyenne(couleurs[couleurs.length - 1][1]) + width * 0.05)
      couleurMoi = couleurs[0][0];
  }
  const isMine = (l: OcrLine): boolean =>
    couleurMoi && l.fond ? l.fond === couleurMoi : aDroite(l) > width * 0.02;

  const messages: { side: 'Moi' | 'Autre'; text: string; lastY1: number; h: number }[] = [];
  for (const l of kept) {
    const side = isMine(l) ? 'Moi' : 'Autre';
    const h = Math.max(1, l.y1 - l.y0);
    const prev = messages[messages.length - 1];
    if (prev && prev.side === side && l.y0 - prev.lastY1 < prev.h * 1.1) {
      prev.text += ` ${l.text}`;
      prev.lastY1 = l.y1;
    } else {
      messages.push({ side, text: l.text, lastY1: l.y1, h });
    }
  }
  return messages.map((m) => `${m.side}: ${m.text}`).join('\n');
}
