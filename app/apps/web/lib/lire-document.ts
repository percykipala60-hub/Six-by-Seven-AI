/**
 * Lecture d'un document sur l'appareil (texte ou PDF), pour le Chat et les documents d'un projet.
 * pdfjs-dist n'est chargé qu'au premier PDF : l'app reste légère sur un petit réseau.
 */
const PAGES_PDF_MAX = 20;

/** Extrait le texte d'un PDF côté navigateur (pdfjs-dist, chargé à la demande). */
export async function extrairePdf(fichier: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const chargement = pdfjs.getDocument({ data: await fichier.arrayBuffer() });
  const morceaux: string[] = [];
  try {
    const pdf = await chargement.promise;
    const pages = Math.min(pdf.numPages, PAGES_PDF_MAX);
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n);
      const contenu = await page.getTextContent();
      morceaux.push(
        contenu.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .trim(),
      );
    }
    let texte = morceaux.filter(Boolean).join('\n\n');
    if (!texte)
      throw new Error(
        'Aucun texte extractible. Pour un PDF numérisé, utilise une version avec du texte sélectionnable.',
      );
    if (pdf.numPages > PAGES_PDF_MAX)
      texte += `\n\n[… ${pdf.numPages - PAGES_PDF_MAX} pages non importées]`;
    return texte.trim();
  } finally {
    await chargement.destroy();
  }
}

/** Texte d'un fichier (PDF ou texte brut). Lève une erreur lisible si rien n'est lisible. */
export async function lireTexteFichier(fichier: File): Promise<string> {
  const estPdf = fichier.type === 'application/pdf' || /\.pdf$/i.test(fichier.name);
  const texte = estPdf ? await extrairePdf(fichier) : await fichier.text();
  if (!estPdf && texte.includes(String.fromCharCode(0)))
    throw new Error('ce fichier n’est pas un texte lisible.');
  if (!texte.trim()) throw new Error('ce fichier ne contient pas de texte lisible.');
  return texte;
}
