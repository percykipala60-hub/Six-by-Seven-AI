/**
 * Artefacts : fichiers complets livrés par Six dans un bloc de code clôturé, avec un nom
 * (```html filename="page.html"). L'app les retire du texte de la réponse, les montre en cartes et les ouvre dans un
 * panneau à côté de la discussion (components/ArtefactPanneau.tsx) : aperçu, copie, téléchargement, versions.
 *
 * Les artefacts vivent dans les messages de la discussion : rien de plus à stocker. Un même nom de fichier renvoyé plus
 * tard dans la discussion est une nouvelle version (versionsDe).
 */
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
  presentation: 'pptx',
  js: 'js',
  ts: 'ts',
  py: 'py',
  bash: 'sh',
  sh: 'sh',
  powershell: 'ps1',
  sql: 'sql',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  go: 'go',
  rust: 'rs',
};

/** Récupère un fichier brut lorsque son début et sa fin ressemblent au même langage. */
function reconnaitreCodeBrut(texte: string): string | undefined {
  const lignes = texte.trimEnd().split(/\r?\n/);
  const debut = lignes[0]?.trim() ?? '';
  const fin = lignes.at(-1)?.trim() ?? '';
  if (
    /^(?:(?:async )?def\s+\w+\s*\(|from\s+[\w.]+\s+import\s|import\s+[\w.]+\s*$|print\s*\()/.test(
      debut,
    ) &&
    (/^\s+\S/.test(lignes.at(-1) ?? '') || /^(?:[\w.]+\([^\n]*\)|[)\]}])$/.test(fin))
  )
    return 'python';
  if (
    /^(?:SELECT\s|WITH\s+\w+\s+AS\s*\(|CREATE\s+TABLE\s|INSERT\s+INTO\s)/i.test(debut) &&
    /;$/.test(fin)
  )
    return 'sql';
  if (
    /^(?:import\s.+\sfrom\s|(?:export\s+)?(?:interface\s+\w+\s*\{|type\s+\w+\s*=|(?:async\s+)?function\s+\w+\s*\(|(?:const|let|var)\s+\w+\s*(?:=|:))|console\.(?:log|warn|error)\s*\()/.test(
      debut,
    ) &&
    /[;)}\]]$/.test(fin)
  )
    return /^(?:export\s+)?(?:interface\s|type\s|(?:const|let)\s+\w+\s*:)/.test(debut)
      ? 'typescript'
      : 'javascript';
  return undefined;
}

/** Extrait les blocs de code complets et récupère certains fichiers livrés sans bloc. */
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
  // Un bloc encore ouvert reste dans le message. Le HTML brut n’est repris que hors de ce bloc.
  const blocOuvert = restant.search(/^\x60{3}[^\r\n]*$/m);
  const avantBloc = blocOuvert < 0 ? restant : restant.slice(0, blocOuvert);
  const suite = blocOuvert < 0 ? '' : restant.slice(blocOuvert);
  const sansHtml = avantBloc.replace(
    /^[^\S\r\n]*((?:<!doctype\s+html\s*>\s*)?<html(?=[\s>])[\s\S]*?<\/html\s*>)[^\S\r\n]*(?=\r?$)/gim,
    (_, contenu: string) => {
      let numero = artefacts.length + 1;
      while (artefacts.some((a) => a.nom === `creation-${numero}.html`)) numero++;
      artefacts.push({ nom: `creation-${numero}.html`, langage: 'html', contenu });
      return '';
    },
  );
  if (!artefacts.length && blocOuvert < 0) {
    const propre = sansHtml.trim();
    const separateur = /\r?\n[ \t]*\r?\n/.exec(propre);
    const candidats = [{ contenu: propre, texte: '' }];
    if (separateur)
      candidats.push({
        contenu: propre.slice(separateur.index + separateur[0].length),
        texte: propre.slice(0, separateur.index).trim(),
      });
    for (const candidat of candidats) {
      const langage = reconnaitreCodeBrut(candidat.contenu);
      if (langage) {
        return {
          texte: candidat.texte,
          artefacts: [
            { nom: `creation-1.${extensions[langage]}`, langage, contenu: candidat.contenu },
          ],
        };
      }
    }
  }
  return { texte: (sansHtml + suite).trim(), artefacts };
}

/** Aucun script, accès réseau ou formulaire dans les aperçus générés. */
export function documentApercu(contenu: string): string {
  return (
    '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; form-action \'none\'; base-uri \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    contenu
  );
}

/* ---------- Genre d'artefact, versions, affichage ---------- */

export type GenreArtefact = 'page' | 'presentation' | 'tableau' | 'document' | 'code';

/** Genre d'un artefact, d'après l'extension de son nom (puis le langage du bloc). */
export function genreArtefact(a: Pick<Artefact, 'nom' | 'langage'>): GenreArtefact {
  const ext = a.nom.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pptx' || a.langage === 'presentation') return 'presentation';
  if (ext === 'html' || ext === 'htm' || ext === 'svg') return 'page';
  if (ext === 'csv' || ext === 'tsv') return 'tableau';
  if (ext === 'md' || ext === 'txt' || ext === 'markdown') return 'document';
  return 'code';
}

export const LIBELLE_GENRE: Record<GenreArtefact, string> = {
  page: 'Page',
  presentation: 'Présentation',
  tableau: 'Tableau',
  document: 'Document',
  code: 'Code',
};

/** Icône d'un artefact (components/Icon.tsx). */
export function iconeArtefact(genre: GenreArtefact): 'type' | 'file' | 'image' {
  return genre === 'code' || genre === 'page'
    ? 'type'
    : genre === 'presentation'
      ? 'image'
      : 'file';
}

/**
 * Versions de chaque fichier dans une discussion : toutes les apparitions d'un même nom dans les réponses de Six,
 * dans l'ordre, sans doublon quand le contenu ne change pas.
 */
export function versionsDe(reponses: string[]): Map<string, Artefact[]> {
  const versions = new Map<string, Artefact[]>();
  for (const r of reponses)
    for (const a of extraireArtefacts(r).artefacts) {
      const liste = versions.get(a.nom) ?? [];
      if (liste.at(-1)?.contenu !== a.contenu) liste.push(a);
      versions.set(a.nom, liste);
    }
  return versions;
}

export function typeMime(a: Pick<Artefact, 'nom' | 'langage'>): string {
  const genre = genreArtefact(a);
  if (genre === 'presentation')
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (genre === 'page')
    return a.nom.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'text/html;charset=utf-8';
  if (genre === 'tableau') return 'text/csv;charset=utf-8';
  if (genre === 'document') return 'text/markdown;charset=utf-8';
  return 'text/plain;charset=utf-8';
}

/** Lignes d'un tableau écrit en Markdown (| a | b |) ou en CSV (virgule ou point-virgule, guillemets). */
export function lireTableau(texte: string): string[][] {
  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lignes.length) return [];
  if (lignes[0].startsWith('|')) {
    return lignes
      .filter((l) => !/^\|?\s*:?-{2,}/.test(l))
      .map((l) =>
        l
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim()),
      );
  }
  const sep =
    (lignes[0].match(/;/g)?.length ?? 0) > (lignes[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  return lignes.map((l) => {
    const cellules: string[] = [];
    let cellule = '';
    let guillemets = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"' && guillemets && l[i + 1] === '"') {
        cellule += '"';
        i++;
      } else if (c === '"') guillemets = !guillemets;
      else if (c === sep && !guillemets) {
        cellules.push(cellule.trim());
        cellule = '';
      } else cellule += c;
    }
    cellules.push(cellule.trim());
    return cellules;
  });
}

export type BlocDocument =
  | { genre: 'titre'; niveau: 1 | 2 | 3; texte: string }
  | { genre: 'liste'; ordonnee: boolean; elements: string[] }
  | { genre: 'paragraphe'; texte: string }
  | { genre: 'code'; texte: string };

/** Mise en page légère d'un document (titres, listes, paragraphes, code), sans bibliothèque Markdown. */
export function blocsDocument(texte: string): BlocDocument[] {
  const blocs: BlocDocument[] = [];
  const lignes = texte.split(/\r?\n/);
  let paragraphe: string[] = [];
  const finParagraphe = () => {
    if (paragraphe.length) blocs.push({ genre: 'paragraphe', texte: paragraphe.join('\n') });
    paragraphe = [];
  };
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (/^\s*```/.test(l)) {
      finParagraphe();
      const code: string[] = [];
      for (i++; i < lignes.length && !/^\s*```/.test(lignes[i]); i++) code.push(lignes[i]);
      blocs.push({ genre: 'code', texte: code.join('\n') });
      continue;
    }
    const titre = /^(#{1,3})\s+(.+)$/.exec(l);
    if (titre) {
      finParagraphe();
      blocs.push({
        genre: 'titre',
        niveau: titre[1].length as 1 | 2 | 3,
        texte: titre[2].replace(/\*\*/g, '').trim(),
      });
      continue;
    }
    const puce = /^\s*(?:[-*•]|(\d+)[.)])\s+(.+)$/.exec(l);
    if (puce) {
      finParagraphe();
      const ordonnee = Boolean(puce[1]);
      const dernier = blocs.at(-1);
      const element = puce[2].replace(/\*\*/g, '');
      if (dernier?.genre === 'liste' && dernier.ordonnee === ordonnee)
        dernier.elements.push(element);
      else blocs.push({ genre: 'liste', ordonnee, elements: [element] });
      continue;
    }
    if (!l.trim()) finParagraphe();
    else paragraphe.push(l.replace(/\*\*/g, ''));
  }
  finParagraphe();
  return blocs;
}
