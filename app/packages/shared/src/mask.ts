/**
 * Masquage AVANT tout envoi, sur le téléphone (2e passe identique côté serveur).
 *
 * - Numéros congolais (+243, 00243, 0XX…), e-mails, longues suites de chiffres.
 * - Noms des participants du fil (sauf « Vous »), où qu'ils apparaissent.
 * - Prénoms et noms congolais courants (dictionnaire), seulement s'ils commencent par une majuscule.
 * - Noms ajoutés à la main par l'utilisateur.
 *
 * Le même nom reçoit toujours le même remplaçant (« [NOM 1] »), pour que l'IA suive qui parle.
 * La table de correspondance reste sur le téléphone : elle sert à remettre les vrais noms dans
 * les brouillons. Elle n'est jamais envoyée.
 *
 * Ce masquage n'est jamais présenté comme complet : l'utilisateur voit chaque élément détecté,
 * peut en décocher un, ou ajouter un nom oublié.
 */
import { isSelfAlias, parseThread } from './thread.js';

export type SensitiveKind = 'nom' | 'tel' | 'email' | 'num';

export interface SensitiveSpan {
  start: number;
  end: number;
  kind: SensitiveKind;
  value: string;
  /** D'où vient la détection, pour l'expliquer à l'utilisateur. */
  source: 'participant' | 'dictionnaire' | 'ajout' | 'motif';
}

export interface MaskResult {
  masked: string;
  /** « [NOM 1] » → « Mariane ». Reste sur le téléphone. */
  table: Record<string, string>;
}

const TAG_LABEL: Record<SensitiveKind, string> = {
  nom: 'NOM',
  tel: 'TEL',
  email: 'EMAIL',
  num: 'NUM',
};
const TAG = /\[(NOM|TEL|EMAIL|NUM) (\d+)\]/g;

/**
 * Prénoms et noms fréquents à Kinshasa et en RDC. Les prénoms qui sont aussi des mots courants
 * (Grâce, Divine, Prince, Patient, Gloire, Trésor, Merveille, Espoir…) sont volontairement
 * absents : les masquer casserait des phrases comme « Grâce à toi ».
 */
export const CONGOLESE_NAMES: readonly string[] = [
  // Noms
  'Bakajika',
  'Banza',
  'Bokeli',
  'Bompeta',
  'Diantete',
  'Ilunga',
  'Kabamba',
  'Kabasele',
  'Kabeya',
  'Kabongo',
  'Kabuya',
  'Kalala',
  'Kalambay',
  'Kalonji',
  'Kalombo',
  'Kanku',
  'Kanyinda',
  'Kapinga',
  'Kasongo',
  'Kayembe',
  'Kazadi',
  'Kiala',
  'Kibambe',
  'Kitenge',
  'Kongolo',
  'Lokonda',
  'Lukusa',
  'Lusamba',
  'Lutete',
  'Makengo',
  'Makiese',
  'Masengo',
  'Matondo',
  'Mavungu',
  'Mayala',
  'Mbala',
  'Mbemba',
  'Mbiya',
  'Mbuyi',
  'Mpiana',
  'Mpoyi',
  'Mujinga',
  'Mukendi',
  'Mukuna',
  'Mulumba',
  'Mumbere',
  'Mutombo',
  'Mvita',
  'Mwamba',
  'Mwanza',
  'Ngalula',
  'Ngandu',
  'Ngoie',
  'Ngoy',
  'Nkulu',
  'Nlandu',
  'Nsimba',
  'Ntumba',
  'Nzuzi',
  'Tshiala',
  'Tshibangu',
  'Tshilombo',
  'Tshimanga',
  'Tshisekedi',
  'Wembi',
  // Prénoms
  'Ange',
  'Arsène',
  'Benedicte',
  'Bénédicte',
  'Blaise',
  'Cedrick',
  'Christelle',
  'Christian',
  'Daniella',
  'Dieudonné',
  'Dorcas',
  'Elysée',
  'Emmanuel',
  'Exaucé',
  'Fiston',
  'Gaëlle',
  'Glodi',
  'Grâcia',
  'Héritier',
  'Jonathan',
  'Josué',
  'Junior',
  'Kevin',
  'Lydia',
  'Mariane',
  'Marianne',
  'Mardochée',
  'Nathan',
  'Naomie',
  'Orphée',
  'Plamedi',
  'Prisca',
  'Rachel',
  'Rebecca',
  'Rodrigue',
  'Ruth',
  'Sarah',
  'Sephora',
  'Séphora',
  'Tresor',
  'Yannick',
];
const DICTIONARY = new Set(CONGOLESE_NAMES);

const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/gu;
// +243 / 00243 suivi de 9 chiffres, ou 0 suivi de 9 chiffres ; séparateurs espace, point, tiret.
// Séparateurs sur une seule ligne : un numéro ne déborde jamais sur le message suivant.
const PHONE = /(?:(?:\+|00) ?243[ .-]?|(?<![\d\p{L}])0)(?:\d[ .-]?){8}\d(?!\d)/gu;
const LONG_NUMBER = /(?<![\d\p{L}])\d{9,}(?![\d\p{L}])/gu;
const LETTERS = /[\p{L}\p{M}'’-]{2,}/gu;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mots d'un nom affiché (« Mariane Kabongo🤍 » → Mariane, Kabongo), sans les remplaçants. */
function nameTokens(name: string): string[] {
  const clean = name.replace(TAG, ' ');
  return (clean.match(LETTERS) ?? []).filter((token) => token.length >= 2);
}

export interface FindOptions {
  /** Noms que l'utilisateur ajoute lui-même. */
  extraNames?: string[];
  /**
   * 2e passe serveur : seulement les motifs objectifs (numéros, e-mails). Les noms ont déjà été
   * vérifiés par l'utilisateur sur son téléphone ; on ne revient pas sur ses choix.
   */
  patternsOnly?: boolean;
}

/** Tout ce qui semble sensible, dans l'ordre du texte, sans chevauchement. */
export function findSensitive(text: string, options: FindOptions = {}): SensitiveSpan[] {
  const found: SensitiveSpan[] = [];
  // Les remplaçants déjà posés (2e passe serveur) sont protégés.
  const protectedRanges = [...text.matchAll(TAG)].map((m) => [m.index, m.index + m[0].length]);

  const push = (
    start: number,
    value: string,
    kind: SensitiveKind,
    source: SensitiveSpan['source'],
  ) => found.push({ start, end: start + value.length, kind, value, source });

  for (const m of text.matchAll(EMAIL)) push(m.index, m[0], 'email', 'motif');
  for (const m of text.matchAll(PHONE)) push(m.index, m[0].trimEnd(), 'tel', 'motif');
  for (const m of text.matchAll(LONG_NUMBER)) push(m.index, m[0], 'num', 'motif');

  if (options.patternsOnly) return dedupe(found, protectedRanges);

  const participants = new Set<string>();
  for (const message of parseThread(text)) {
    const author = message.author;
    if (!author || isSelfAlias(author) || /^\+?[\d\s().-]{8,}$/.test(author)) continue;
    for (const token of nameTokens(author)) participants.add(token);
  }
  const named: [string, SensitiveSpan['source'], string][] = [
    ...[...participants].map((n): [string, SensitiveSpan['source'], string] => [
      n,
      'participant',
      'giu',
    ]),
    ...(options.extraNames ?? [])
      .flatMap(nameTokens)
      .map((n): [string, SensitiveSpan['source'], string] => [n, 'ajout', 'giu']),
  ];
  for (const [name, source, flags] of named) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(name)}(?![\\p{L}\\p{M}])`, flags);
    for (const m of text.matchAll(pattern)) push(m.index, m[0], 'nom', source);
  }
  for (const m of text.matchAll(LETTERS)) {
    if (DICTIONARY.has(m[0])) push(m.index, m[0], 'nom', 'dictionnaire');
  }

  return dedupe(found, protectedRanges);
}

/** Ordre du texte ; à départ égal, le plus long gagne ; jamais de chevauchement. */
function dedupe(found: SensitiveSpan[], protectedRanges: number[][]): SensitiveSpan[] {
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const spans: SensitiveSpan[] = [];
  for (const span of found) {
    const last = spans.at(-1);
    if (last && span.start < last.end) continue;
    if (protectedRanges.some(([s = 0, e = 0]) => span.start < e && span.end > s)) continue;
    spans.push(span);
  }
  return spans;
}

/** Clé d'identité : « +243 81 234 5678 » et « 0812345678 » sont le même numéro. */
function identity(span: SensitiveSpan): string {
  if (span.kind === 'tel') return `tel:${span.value.replace(/\D/g, '').slice(-9)}`;
  return `${span.kind}:${span.value.toLowerCase()}`;
}

/**
 * Remplace les éléments retenus. `ignored` : index des éléments que l'utilisateur a décochés.
 * La numérotation continue après les remplaçants déjà présents (2e passe sans collision).
 */
export function applyMask(
  text: string,
  spans: SensitiveSpan[],
  ignored: ReadonlySet<number> = new Set(),
): MaskResult {
  const next: Record<SensitiveKind, number> = { nom: 0, tel: 0, email: 0, num: 0 };
  for (const m of text.matchAll(TAG)) {
    const kind = (Object.keys(TAG_LABEL) as SensitiveKind[]).find((k) => TAG_LABEL[k] === m[1]);
    if (kind) next[kind] = Math.max(next[kind], Number(m[2]));
  }
  const tags = new Map<string, string>();
  const table: Record<string, string> = {};
  let masked = '';
  let cursor = 0;
  spans.forEach((span, index) => {
    if (ignored.has(index)) return;
    const key = identity(span);
    let tag = tags.get(key);
    if (!tag) {
      next[span.kind] += 1;
      tag = `[${TAG_LABEL[span.kind]} ${next[span.kind]}]`;
      tags.set(key, tag);
      table[tag] = span.value;
    }
    masked += text.slice(cursor, span.start) + tag;
    cursor = span.end;
  });
  masked += text.slice(cursor);
  return { masked, table };
}

export function maskConversation(text: string, options: FindOptions = {}): MaskResult {
  return applyMask(text, findSensitive(text, options));
}

/** Sur le téléphone : remet les vrais noms dans un brouillon. */
export function unmask(text: string, table: Readonly<Record<string, string>>): string {
  return text.replace(TAG, (tag) => table[tag] ?? tag);
}

/** Vrai si le texte est un remplaçant posé par le masquage (« [TEL 1] »). */
export function isMaskTag(text: string | undefined): boolean {
  return Boolean(text && /^\[(NOM|TEL|EMAIL|NUM) \d+\]$/.test(text.trim()));
}

/**
 * Sur le téléphone : l'utilisateur a modifié un brouillon (avec les vrais noms) et demande une
 * retouche. On remet les remplaçants avant l'envoi : le serveur ne voit toujours pas les noms.
 */
export function remask(text: string, table: Readonly<Record<string, string>>): string {
  // Les valeurs les plus longues d'abord : « Mariane Kabongo » avant « Mariane ».
  const entries = Object.entries(table).sort((a, b) => b[1].length - a[1].length);
  let out = text;
  for (const [tag, value] of entries) {
    if (!value) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{M}\\d])${escapeRegExp(value)}(?![\\p{L}\\p{M}\\d])`,
      'giu',
    );
    out = out.replace(pattern, tag);
  }
  return out;
}
