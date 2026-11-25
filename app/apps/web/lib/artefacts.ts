export type Artefact = { nom: string; langage: string; contenu: string };
const extensions: Record<string, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  markdown: 'md',
  text: 'txt',
  html: 'html',
  css: 'css',
  json: 'json',
  svg: 'svg',
  csv: 'csv',
  jsx: 'jsx',
  tsx: 'tsx',
};

/** Les blocs complets seulement : aucun fichier tronqué pendant la génération. */
export function extraireArtefacts(texte: string): { texte: string; artefacts: Artefact[] } {
  const artefacts: Artefact[] = [];
  const restant = texte.replace(
    /^```([\w+-]*)[^\S\r\n]*(?:filename="([^"\r\n]+)")?[^\S\r\n]*\r?\n([\s\S]*?)^```[^\S\r\n]*(?=\r?$)/gm,
    (_, langue: string, nom: string | undefined, contenu: string) => {
      const langage = langue.toLowerCase();
      const propre = nom
        ?.split(/[\\/]/)
        .pop()
        ?.replace(/[<>:"|?*]/g, '_')
        .split('')
        .map((caractere) => (caractere.charCodeAt(0) < 32 ? '_' : caractere))
        .join('');
      artefacts.push({
        nom: propre || `creation-${artefacts.length + 1}.${extensions[langage] || 'txt'}`,
        langage,
        contenu,
      });
      return '';
    },
  );
  return { texte: restant.trim(), artefacts };
}

/** Aucun script, accès réseau ou formulaire dans les aperçus générés. */
export function documentApercu(contenu: string): string {
  return (
    '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; form-action \'none\'; base-uri \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    contenu
  );
}
