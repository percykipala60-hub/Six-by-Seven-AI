/**
 * Artefacts : un travail conséquent produit par Six (document, code, page HTML, tableau), montré dans un panneau à
 * côté de la discussion, avec copie, téléchargement et versions.
 *
 * Six les écrit dans sa réponse entre balises : <artefact id="plan" type="document" titre="Plan du rapport">…</artefact>
 * (consigne dans lib/prompt.ts). La réponse est gardée telle quelle dans la discussion ; l'écran la découpe
 * (decouper) et remplace chaque balise par une carte. Un artefact renvoyé avec le même id dans la même discussion
 * devient une nouvelle version.
 *
 * Gardés sur l'appareil avec la discussion, seulement quand la mémoire de Six est active (comme les discussions),
 * et copiés sur le compte si la personne l'a autorisé (lib/projets-sync.ts).
 */
import { memoireActive } from './memoire';
import { noterSuppression } from './projets';

export type TypeArtefact = 'document' | 'code' | 'html' | 'tableau';
export type VersionArtefact = { contenu: string; t: number };
export type Artefact = {
  id: string;
  /** Repère donné par Six (attribut id), unique dans une discussion. */
  cle: string;
  titre: string;
  type: TypeArtefact;
  langage?: string;
  versions: VersionArtefact[];
  chat: string;
  projet?: string;
  cree: number;
  maj: number;
};
/** Artefact tel qu'il apparaît dans une réponse, avant d'être gardé. */
export type ArtefactExtrait = {
  cle: string;
  titre: string;
  type: TypeArtefact;
  langage?: string;
  contenu: string;
  /** La balise n'était pas fermée (réponse coupée). */
  incomplet?: boolean;
};
export type Morceau =
  { genre: 'texte'; texte: string } | { genre: 'artefact'; artefact: ArtefactExtrait };

const CLE = 'six-artefacts';
export const SUPPRESSIONS_ARTEFACTS = 'six-artefacts-supprimes';
export const EVT_ARTEFACTS = 'six-artefacts';
export const CONTENU_MAX = 60_000;
export const VERSIONS_MAX = 20;
const MAX_ARTEFACTS = 100;
/** Un bloc de code sans balise devient un artefact à partir de ce nombre de lignes. */
export const LIGNES_CODE_ARTEFACT = 15;

const TYPES: TypeArtefact[] = ['document', 'code', 'html', 'tableau'];
export const LIBELLE_TYPE: Record<TypeArtefact, string> = {
  document: 'Document',
  code: 'Code',
  html: 'Page HTML',
  tableau: 'Tableau',
};

/* ---------- Lecture d'une réponse ---------- */

function attributs(s: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const m of s.matchAll(/([a-zA-Z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    o[m[1].toLowerCase()] = (m[2] ?? m[3] ?? '').trim();
  return o;
}

/** Repère stable à partir d'un texte : minuscules, sans accents, mots reliés par des tirets. */
export function cleDe(texte: string): string {
  return (
    texte
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'artefact'
  );
}

function typeDe(v: string | undefined, langage: string): TypeArtefact {
  const t = (v ?? '').toLowerCase();
  if ((TYPES as string[]).includes(t)) return t as TypeArtefact;
  if (langage === 'html') return 'html';
  if (langage === 'csv') return 'tableau';
  if (langage) return 'code';
  return 'document';
}

/** Retire une clôture ``` qui entoure tout le contenu (Six en met parfois une dans la balise). */
function sansCloture(contenu: string): { contenu: string; langage: string } {
  const m = /^\s*```([\w+#.-]*)[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(contenu);
  return m ? { contenu: m[2], langage: m[1].toLowerCase() } : { contenu, langage: '' };
}

/**
 * Découpe une réponse en morceaux de texte et en artefacts. Sans balise, un long bloc de code (au moins
 * LIGNES_CODE_ARTEFACT lignes) devient aussi un artefact. Une balise non fermée (réponse coupée) garde ce qui suit.
 */
export function decouper(reponse: string): Morceau[] {
  const morceaux: Morceau[] = [];
  const pousserTexte = (t: string) => {
    if (t.trim()) morceaux.push({ genre: 'texte', texte: t.replace(/^\n+|\s+$/g, '') });
  };
  const balise = /<artefact\b([^>]*)>([\s\S]*?)(<\/artefact>|$)/gi;
  let fin = 0;
  let trouve = false;
  for (const m of reponse.matchAll(balise)) {
    trouve = true;
    pousserTexte(reponse.slice(fin, m.index));
    fin = (m.index ?? 0) + m[0].length;
    const a = attributs(m[1]);
    const { contenu, langage: langageCloture } = sansCloture(m[2].replace(/^\n|\s+$/g, ''));
    const langage = (a.langage || a.language || langageCloture).toLowerCase().slice(0, 20);
    const titre = (a.titre || a.title || '').slice(0, 120) || 'Sans titre';
    morceaux.push({
      genre: 'artefact',
      artefact: {
        cle: cleDe(a.id || titre),
        titre,
        type: typeDe(a.type, langage),
        ...(langage ? { langage } : {}),
        contenu: contenu.slice(0, CONTENU_MAX),
        ...(m[3] ? {} : { incomplet: true }),
      },
    });
  }
  if (trouve) {
    pousserTexte(reponse.slice(fin));
    return morceaux;
  }
  // Pas de balise : les longs blocs de code deviennent des artefacts, le reste reste du texte.
  const bloc = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)```/g;
  let n = 0;
  for (const m of reponse.matchAll(bloc)) {
    const lignes = m[2].split('\n').length;
    if (lignes < LIGNES_CODE_ARTEFACT) continue;
    pousserTexte(reponse.slice(fin, m.index));
    fin = (m.index ?? 0) + m[0].length;
    const langage = m[1].toLowerCase().slice(0, 20);
    const type = typeDe(undefined, langage || 'texte');
    n += 1;
    const titre =
      type === 'html' ? 'Page HTML' : type === 'tableau' ? 'Tableau' : `Code ${langage}`.trim();
    morceaux.push({
      genre: 'artefact',
      artefact: {
        cle: `bloc-${n}`,
        titre: n > 1 ? `${titre} (${n})` : titre,
        type,
        ...(langage ? { langage } : {}),
        contenu: m[2].replace(/\n$/, '').slice(0, CONTENU_MAX),
      },
    });
  }
  pousserTexte(reponse.slice(fin));
  return morceaux.length ? morceaux : [{ genre: 'texte', texte: reponse }];
}

export function extraireArtefacts(reponse: string): ArtefactExtrait[] {
  return decouper(reponse).flatMap((m) => (m.genre === 'artefact' ? [m.artefact] : []));
}

/* ---------- Stockage ---------- */

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const nombre = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function curerArtefact(o: unknown): Artefact | null {
  if (!o || typeof o !== 'object') return null;
  const a = o as Record<string, unknown>;
  const id = str(a.id, 60);
  const chat = str(a.chat, 40);
  const type = str(a.type, 10) as TypeArtefact;
  if (!/^[\w:-]+$/.test(id) || !chat || !TYPES.includes(type)) return null;
  const maj = nombre(a.maj, 0);
  const versions = (Array.isArray(a.versions) ? a.versions : [])
    .map((v) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {}))
    .filter((v) => typeof v.contenu === 'string')
    .map((v) => ({ contenu: str(v.contenu, CONTENU_MAX), t: nombre(v.t, maj) }))
    .slice(-VERSIONS_MAX);
  if (!versions.length) return null;
  const langage = str(a.langage, 20);
  const projet = str(a.projet, 40);
  return {
    id,
    cle: str(a.cle, 40) || 'artefact',
    titre: str(a.titre, 120) || 'Sans titre',
    type,
    ...(langage ? { langage } : {}),
    versions,
    chat,
    ...(projet ? { projet } : {}),
    cree: nombre(a.cree, maj),
    maj,
  };
}

export function lireArtefacts(): Artefact[] {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '[]') as unknown;
    if (!Array.isArray(brut)) return [];
    return brut
      .map(curerArtefact)
      .filter((a): a is Artefact => a !== null)
      .sort((a, b) => b.maj - a.maj)
      .slice(0, MAX_ARTEFACTS);
  } catch {
    return [];
  }
}

export function ecrireArtefacts(liste: Artefact[]): boolean {
  try {
    localStorage.setItem(CLE, JSON.stringify(liste.slice(0, MAX_ARTEFACTS)));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_ARTEFACTS));
    return true;
  } catch {
    return false;
  }
}

export const artefactsDuChat = (chat: string, liste = lireArtefacts()) =>
  liste.filter((a) => a.chat === chat);
export const artefactsDuProjet = (projet: string, liste = lireArtefacts()) =>
  liste.filter((a) => a.projet === projet);

/**
 * Fusionne les artefacts d'une réponse avec ceux déjà connus de la discussion : même repère, contenu différent →
 * nouvelle version ; même contenu → rien ne change. Fonction pure (testée), renvoie la nouvelle liste complète.
 */
export function fusionnerExtraits(
  liste: Artefact[],
  chat: string,
  projet: string | undefined,
  extraits: ArtefactExtrait[],
  maintenant = Date.now(),
): Artefact[] {
  let resultat = [...liste];
  for (const e of extraits) {
    if (!e.contenu.trim()) continue;
    const i = resultat.findIndex((a) => a.chat === chat && a.cle === e.cle);
    const existant = i >= 0 ? resultat[i] : undefined;
    if (existant && existant.versions.at(-1)?.contenu === e.contenu) continue;
    const a: Artefact = existant
      ? {
          ...existant,
          titre: e.titre,
          type: e.type,
          ...(e.langage ? { langage: e.langage } : {}),
          versions: [...existant.versions, { contenu: e.contenu, t: maintenant }].slice(
            -VERSIONS_MAX,
          ),
          ...(projet ? { projet } : {}),
          maj: maintenant,
        }
      : {
          id: `${chat}-${e.cle}`.slice(0, 60),
          cle: e.cle,
          titre: e.titre,
          type: e.type,
          ...(e.langage ? { langage: e.langage } : {}),
          versions: [{ contenu: e.contenu, t: maintenant }],
          chat,
          ...(projet ? { projet } : {}),
          cree: maintenant,
          maj: maintenant,
        };
    resultat = [a, ...resultat.filter((x) => x.id !== a.id)];
  }
  return resultat;
}

/** Garde les artefacts d'une réponse (mémoire active seulement). Renvoie ceux de la discussion. */
export function garderArtefacts(
  chat: string,
  projet: string | undefined,
  extraits: ArtefactExtrait[],
): Artefact[] {
  if (!extraits.length || !memoireActive()) return [];
  const liste = fusionnerExtraits(lireArtefacts(), chat, projet, extraits);
  ecrireArtefacts(liste);
  return artefactsDuChat(chat, liste);
}

/** Retrouve l'artefact gardé qui correspond à un extrait, et la version qui a ce contenu. */
export function retrouver(
  liste: Artefact[],
  chat: string,
  e: ArtefactExtrait,
): { artefact: Artefact; version: number } {
  const a = liste.find((x) => x.chat === chat && x.cle === e.cle);
  if (!a)
    return {
      artefact: {
        id: `${chat}-${e.cle}`,
        cle: e.cle,
        titre: e.titre,
        type: e.type,
        ...(e.langage ? { langage: e.langage } : {}),
        versions: [{ contenu: e.contenu, t: 0 }],
        chat,
        cree: 0,
        maj: 0,
      },
      version: 0,
    };
  const v = a.versions.findIndex((x) => x.contenu === e.contenu);
  return { artefact: a, version: v >= 0 ? v : a.versions.length - 1 };
}

/** Range les artefacts d'une discussion dans un projet (ou les en sort). */
export function rangerArtefacts(chat: string, projet: string | undefined): void {
  const liste = lireArtefacts();
  if (!liste.some((a) => a.chat === chat)) return;
  const maintenant = Date.now();
  ecrireArtefacts(
    liste.map((a) => {
      if (a.chat !== chat) return a;
      const reste = { ...a };
      delete reste.projet;
      return { ...reste, ...(projet ? { projet } : {}), maj: maintenant };
    }),
  );
}

/** Le projet disparaît : ses artefacts restent avec leur discussion, hors projet. */
export function detacherDuProjet(projet: string): void {
  const liste = lireArtefacts();
  if (!liste.some((a) => a.projet === projet)) return;
  const maintenant = Date.now();
  ecrireArtefacts(
    liste.map((a) => {
      if (a.projet !== projet) return a;
      const reste = { ...a };
      delete reste.projet;
      return { ...reste, maj: maintenant };
    }),
  );
}

export function effacerArtefactsDuChat(chat: string): void {
  const liste = lireArtefacts();
  const partis = liste.filter((a) => a.chat === chat);
  if (!partis.length) return;
  ecrireArtefacts(liste.filter((a) => a.chat !== chat));
  for (const a of partis) noterSuppression(SUPPRESSIONS_ARTEFACTS, a.id);
}

export function effacerTousLesArtefacts(): void {
  for (const a of lireArtefacts()) noterSuppression(SUPPRESSIONS_ARTEFACTS, a.id);
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à effacer */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_ARTEFACTS));
}

export function ecouterArtefacts(fn: () => void): () => void {
  const surStockage = (e: StorageEvent) => e.key === CLE && fn();
  window.addEventListener(EVT_ARTEFACTS, fn);
  window.addEventListener('storage', surStockage);
  return () => {
    window.removeEventListener(EVT_ARTEFACTS, fn);
    window.removeEventListener('storage', surStockage);
  };
}

/* ---------- Affichage et téléchargement ---------- */

const EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  java: 'java',
  kotlin: 'kt',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'cs',
  'c#': 'cs',
  go: 'go',
  rust: 'rs',
  php: 'php',
  ruby: 'rb',
  sql: 'sql',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  powershell: 'ps1',
  css: 'css',
  json: 'json',
  yaml: 'yml',
  yml: 'yml',
  xml: 'xml',
  markdown: 'md',
  md: 'md',
  dart: 'dart',
};

/** Nom du fichier téléchargé : le titre (sans caractères interdits) et l'extension du type ou du langage. */
export function nomFichier(a: Pick<Artefact, 'titre' | 'type' | 'langage'>): string {
  const base =
    a.titre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w .-]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 60) || 'artefact';
  const ext =
    a.type === 'html'
      ? 'html'
      : a.type === 'tableau'
        ? a.langage === 'markdown' || a.langage === 'md'
          ? 'md'
          : 'csv'
        : a.type === 'document'
          ? 'md'
          : (EXTENSIONS[a.langage ?? ''] ?? 'txt');
  return `${base}.${ext}`;
}

export function typeMime(a: Pick<Artefact, 'type'>): string {
  if (a.type === 'html') return 'text/html;charset=utf-8';
  if (a.type === 'tableau') return 'text/csv;charset=utf-8';
  if (a.type === 'document') return 'text/markdown;charset=utf-8';
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
