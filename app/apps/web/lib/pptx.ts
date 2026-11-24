/**
 * Export d'une présentation en .pptx (PowerPoint, Keynote, Google Slides, LibreOffice). pptxgenjs n'est chargé
 * qu'au moment du téléchargement : rien ne pèse sur l'ouverture de l'app.
 * Les diapositives sont dessinées à partir de la même mise en page que l'aperçu (lib/presentation-mise-en-page.ts).
 */
import { poserDiapositive, type Element } from './presentation-mise-en-page';
import { theme as themeDe, type Presentation } from './presentation';

const LARGEUR = 13.333; // pouces (format 16:9 « LAYOUT_WIDE »)
const HAUTEUR = 7.5;

const couleur = (c: string) => c.replace('#', '').toUpperCase();
const px = (x: number) => (x / 100) * LARGEUR;
const py = (y: number) => (y / 100) * HAUTEUR;

type Diapo = {
  background: { color: string };
  addShape: (type: string, options: Record<string, unknown>) => void;
  addText: (texte: unknown, options: Record<string, unknown>) => void;
};

function dessiner(diapo: Diapo, e: Element) {
  if (e.genre === 'forme') {
    const type =
      e.forme === 'arrondi'
        ? 'roundRect'
        : e.forme === 'ellipse'
          ? 'ellipse'
          : e.forme === 'losange'
            ? 'diamond'
            : e.forme === 'ligne'
              ? 'line'
              : 'rect';
    diapo.addShape(type, {
      x: px(e.x),
      y: py(e.y),
      w: Math.max(px(e.w), 0.001),
      h: e.forme === 'ligne' ? py(e.h) : Math.max(py(e.h), 0.001),
      ...(e.fond
        ? { fill: { color: couleur(e.fond), transparency: e.transparence ?? 0 } }
        : { fill: { type: 'none' } }),
      line: e.contour ? { color: couleur(e.contour), width: e.epaisseur ?? 1 } : { type: 'none' },
      ...(e.forme === 'arrondi' ? { rectRadius: 0.15 } : {}),
    });
    return;
  }
  const options = {
    x: px(e.x),
    y: py(e.y),
    w: px(e.w),
    h: py(e.h),
    fontFace: e.police,
    fontSize: e.taille,
    color: couleur(e.couleur),
    bold: e.gras ?? false,
    italic: e.italique ?? false,
    align: e.align ?? 'left',
    valign: e.valign ?? 'top',
    margin: 0,
    fit: 'shrink',
    paraSpaceAfter: e.puces ? 6 : 0,
  };
  const maj = (s: string) => (e.majuscules ? s.toLocaleUpperCase('fr-FR') : s);
  if (e.puces)
    diapo.addText(
      e.puces.map((p) => ({ text: maj(p), options: { bullet: true, breakLine: true } })),
      options,
    );
  else diapo.addText(maj(e.texte ?? ''), options);
}

/** Construit le fichier ; `theme` remplace celui choisi par Six (sélecteur du panneau). */
async function construire(p: Presentation, theme?: string) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const t = themeDe(theme ?? p.theme);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = p.titre;
  pptx.company = 'Six';
  p.diapositives.forEach((d, i) => {
    const posee = poserDiapositive(t, d, i);
    const diapo = pptx.addSlide() as unknown as Diapo;
    diapo.background = { color: couleur(posee.fond) };
    for (const e of posee.elements) dessiner(diapo, e);
  });
  return pptx;
}

/** Télécharge la présentation (navigateur). */
export async function telechargerPptx(p: Presentation, nomFichier: string, theme?: string) {
  const pptx = await construire(p, theme);
  await pptx.writeFile({ fileName: nomFichier });
}

/** Contenu binaire du .pptx (tests, ou envoi ailleurs). */
export async function pptxEnOctets(p: Presentation, theme?: string): Promise<Uint8Array> {
  const pptx = await construire(p, theme);
  const sortie = await pptx.write({ outputType: 'uint8array' });
  return sortie as Uint8Array;
}
