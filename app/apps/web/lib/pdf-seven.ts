import type { jsPDF as JsPdfDoc } from 'jspdf';
import type { ChatMessage } from '@/lib/types';
import { PRODUIT, SIGNATURE } from '@/lib/marque';

/**
 * Export PDF des réponses de Six (espace Chat) (généré sur l'appareil, aucun serveur).
 * Mise en page professionnelle : bandeau de marque, bulles de conversation,
 * pagination A4 avec pied de page (source + numérotation).
 */

// Palette alignée sur la marque de Six (globals.css : --brand #1f3864).
const MARQUE = { r: 31, g: 56, b: 100 };
const ENCRE = { r: 20, g: 24, b: 34 };
const GRIS = { r: 96, g: 103, b: 116 };
const LIGNE = { r: 222, g: 226, b: 234 };
const FOND_USER = { r: 245, g: 246, b: 250 };
const FOND_SEVEN = { r: 238, g: 242, b: 250 };

const PAGE_L = 210; // A4 mm
const PAGE_H = 297;
const MARGE = 18;
const CORPS = 10.5;
// Hauteur réelle d'une ligne rendue : CORPS (pt) × lineHeightFactor (1.45) ÷ 2.8346 (pt → mm).
const LIGNAGE = (CORPS * 1.45) / 2.8346; // ≈ 5,37 mm — doit correspondre exactement au rendu doc.text ci-dessous.
const FAMILLE = 'helvetica';

/**
 * Les polices standard de jsPDF encodent en WinAnsi : les accents français passent,
 * mais pas œ/Œ ni les emoji. On adapte pour éviter les « ? » dans le PDF.
 */
export function nettoyerTextePdf(texte: string): string {
  return texte
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'Oe')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, ' - ')
    .replace(/\u{FE0F}/gu, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/gu, '')
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

function dateFr(): string {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type DocPdf = JsPdfDoc;

/** Bandeau de marque en haut de la première page. */
function bandeau(doc: DocPdf, titre: string) {
  doc.setFillColor(MARQUE.r, MARQUE.g, MARQUE.b);
  doc.rect(0, 0, PAGE_L, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(FAMILLE, 'bold');
  doc.setFontSize(17);
  doc.text('Six', MARGE, 11.5);
  doc.setFont(FAMILLE, 'normal');
  doc.setFontSize(8.5);
  doc.text(`Assistant de l’app ${PRODUIT}`, MARGE, 17.5);
  doc.text(dateFr(), PAGE_L - MARGE, 11.5, { align: 'right' });
  doc.setFont(FAMILLE, 'bold');
  doc.setFontSize(13);
  doc.setTextColor(MARQUE.r, MARQUE.g, MARQUE.b);
  doc.text(nettoyerTextePdf(titre), MARGE, 34);
  doc.setDrawColor(LIGNE.r, LIGNE.g, LIGNE.b);
  doc.setLineWidth(0.4);
  doc.line(MARGE, 38, PAGE_L - MARGE, 38);
}

/** Pied de page identique sur toutes les pages (source + pagination). */
function piedsDePage(doc: DocPdf) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(LIGNE.r, LIGNE.g, LIGNE.b);
    doc.setLineWidth(0.3);
    doc.line(MARGE, PAGE_H - 15, PAGE_L - MARGE, PAGE_H - 15);
    doc.setFont(FAMILLE, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(GRIS.r, GRIS.g, GRIS.b);
    doc.text(`Document généré par ${SIGNATURE}`, MARGE, PAGE_H - 10.5);
    doc.text(`Page ${i} / ${total}`, PAGE_L - MARGE, PAGE_H - 10.5, { align: 'right' });
  }
}

/** Largeur intérieure de la bulle : même valeur que le rendu doc.text plus bas (sinon la hauteur
 *  calculée ne correspond pas au nombre de lignes réellement rendues et le texte déborde). */
const RETRAIT_BULLE = 4;
const LARGEUR_TEXTE = PAGE_L - 2 * MARGE - RETRAIT_BULLE;

/** Hauteur d'un bloc message (étiquette + bulle), pour la pagination.
 *  IMPORTANT : splitTextToSize enveloppe selon la police ET la taille courantes. On impose
 *  le corps du texte ici, sinon le calcul est fait avec la taille laissée par le bandeau
 *  (13 pt) et le nombre de lignes (donc la hauteur de bulle) est sous-estimé → débordement. */
function hauteurBloc(doc: DocPdf, contenu: string): number {
  doc.setFont(FAMILLE, 'normal');
  doc.setFontSize(CORPS);
  const lignes = doc.splitTextToSize(contenu, LARGEUR_TEXTE);
  return 5 + 2.5 + lignes.length * LIGNAGE + 4;
}

/** Construit le PDF et renvoie le document (jsPDF est chargé à la demande). */
export async function construirePdfSeven(
  messages: ChatMessage[],
  titre = 'Conversation avec Six',
): Promise<DocPdf> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  bandeau(doc, titre);

  const largeur = PAGE_L - 2 * MARGE;
  let y = 44;
  for (const m of messages) {
    const estSeven = m.role === 'assistant';
    const contenu = nettoyerTextePdf(m.content);
    if (!contenu) continue;
    const h = hauteurBloc(doc, contenu);
    if (y + h > PAGE_H - 22) {
      doc.addPage();
      y = MARGE;
    }
    doc.setFont(FAMILLE, 'bold');
    doc.setFontSize(8.5);
    if (estSeven) doc.setTextColor(MARQUE.r, MARQUE.g, MARQUE.b);
    else doc.setTextColor(GRIS.r, GRIS.g, GRIS.b);
    doc.text(estSeven ? 'SIX' : 'TOI', MARGE, y);
    const hBulle = h - 5;
    const haut = estSeven ? FOND_SEVEN : FOND_USER;
    doc.setFillColor(haut.r, haut.g, haut.b);
    doc.roundedRect(MARGE - 1.5, y + 1.5, largeur + 3, hBulle - 3, 1.8, 1.8, 'F');
    doc.setFont(FAMILLE, 'normal');
    doc.setFontSize(CORPS);
    doc.setTextColor(ENCRE.r, ENCRE.g, ENCRE.b);
    const lignes = doc.splitTextToSize(contenu, largeur - 4);
    doc.text(lignes, MARGE + 0.5, y + 7.5, { lineHeightFactor: 1.45 });
    y += h + 2;
  }
  piedsDePage(doc);
  return doc;
}

/** Construit le PDF et déclenche le téléchargement dans le navigateur. */
export async function telechargerPdfSeven(
  messages: ChatMessage[],
  titre = 'Conversation avec Six',
): Promise<void> {
  const doc = await construirePdfSeven(messages, titre);
  doc.save(`seven-ai-${new Date().toISOString().slice(0, 10)}.pdf`);
}
