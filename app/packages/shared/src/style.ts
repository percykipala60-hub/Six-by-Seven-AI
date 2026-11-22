/**
 * Style d'écriture de l'utilisateur, appris de SES propres messages.
 *
 * Confidentialité : la fiche ne contient que des nombres et des marqueurs tirés d'une liste
 * fixe (« frère », « stp », « mbote »…). Aucune phrase, aucun nom, aucun texte libre n'y entre.
 * Elle se complète à chaque conversation : c'est l'apprentissage continu de Six.
 */
import { normalize } from './scam.js';

/** Marqueurs fréquents à Kinshasa, en français familier et en lingala. Liste fermée. */
const MARKERS = [
  'frere',
  'soeur',
  'bro',
  'stp',
  'svp',
  'mdr',
  'lol',
  'ok',
  'okay',
  'merci',
  'desole',
  'pardon',
  'mbote',
  'boni',
  'ndeko',
  'yaya',
  'leki',
  'mama',
  'papa',
  'nzambe',
  'malamu',
  'sango',
  'kaka',
  'tika',
  'yaka',
  'nayebi',
  'eza',
  'ngai',
  'yo',
  'biso',
  'lobi',
  'lelo',
  'mbongo',
  'mosala',
] as const;
const LINGALA = new Set([
  'mbote',
  'boni',
  'ndeko',
  'yaya',
  'leki',
  'nzambe',
  'malamu',
  'sango',
  'kaka',
  'tika',
  'yaka',
  'nayebi',
  'eza',
  'ngai',
  'biso',
  'bino',
  'bango',
  'lobi',
  'lelo',
  'mbongo',
  'mosala',
  'nazali',
  'ozali',
  'nakoma',
  'nakende',
  'kende',
  'mpo',
  'oyo',
  'wapi',
  'nini',
  'mingi',
]);
const EMOJI = /\p{Extended_Pictographic}/u;

export interface StyleProfile {
  version: 1;
  messages: number;
  mots: number;
  tutoiement: number;
  vouvoiement: number;
  avecEmoji: number;
  motsLingala: number;
  sansMajuscule: number;
  marqueurs: Partial<Record<(typeof MARKERS)[number], number>>;
  /** Styles de brouillon choisis par l'utilisateur (« Rassurante », « Directe »…). */
  choix: Record<string, number>;
}

export function emptyProfile(): StyleProfile {
  return {
    version: 1,
    messages: 0,
    mots: 0,
    tutoiement: 0,
    vouvoiement: 0,
    avecEmoji: 0,
    motsLingala: 0,
    sansMajuscule: 0,
    marqueurs: {},
    choix: {},
  };
}

/** Ajoute les messages de l'utilisateur à sa fiche (sans rien garder du texte). */
export function learnStyle(profile: StyleProfile, ownMessages: string[]): StyleProfile {
  const next: StyleProfile = JSON.parse(JSON.stringify(profile)) as StyleProfile;
  for (const message of ownMessages) {
    const text = message.trim();
    if (!text) continue;
    const words = normalize(text)
      .split(/[^a-z']+/)
      .filter(Boolean);
    next.messages++;
    next.mots += words.length;
    if (/\b(tu|te|t'|toi|ton|ta|tes)\b/.test(normalize(text))) next.tutoiement++;
    if (/\b(vous|votre|vos)\b/.test(normalize(text))) next.vouvoiement++;
    if (EMOJI.test(text)) next.avecEmoji++;
    if (/^[a-zà-ÿ]/.test(text)) next.sansMajuscule++;
    next.motsLingala += words.filter((w) => LINGALA.has(w)).length;
    for (const marker of MARKERS) {
      if (words.includes(marker)) next.marqueurs[marker] = (next.marqueurs[marker] ?? 0) + 1;
    }
  }
  return next;
}

/** Retient le type de brouillon choisi (jamais son texte). */
export function learnChoice(profile: StyleProfile, style: string): StyleProfile {
  const next: StyleProfile = JSON.parse(JSON.stringify(profile)) as StyleProfile;
  const key = style.trim().toLowerCase().slice(0, 30);
  if (key) next.choix[key] = (next.choix[key] ?? 0) + 1;
  return next;
}

export function averageWords(profile: StyleProfile): number {
  return profile.messages ? profile.mots / profile.messages : 0;
}

/** Consignes de style pour le modèle, en clair. Vide tant qu'on connaît moins de 5 messages. */
export function describeStyle(profile: StyleProfile, name: string): string {
  if (profile.messages < 5) return '';
  const lines: string[] = [];
  const avg = Math.round(averageWords(profile));
  lines.push(`messages d'environ ${avg} mots${avg <= 8 ? ' (très courts)' : ''}`);
  if (profile.tutoiement > profile.vouvoiement * 2) lines.push('tutoie ses proches');
  if (profile.avecEmoji / profile.messages >= 0.25) lines.push('met souvent un emoji');
  else if (profile.avecEmoji / profile.messages < 0.05)
    lines.push("n'utilise presque jamais d'emoji");
  if (profile.motsLingala / Math.max(profile.mots, 1) >= 0.08)
    lines.push('mélange le français et le lingala');
  if (profile.sansMajuscule / profile.messages >= 0.6)
    lines.push('commence souvent sans majuscule');
  const favorites = Object.entries(profile.marqueurs)
    .filter(([, n]) => (n ?? 0) >= 2)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 4)
    .map(([m]) => `« ${m} »`);
  if (favorites.length) lines.push(`emploie volontiers ${favorites.join(', ')}`);
  const choice = Object.entries(profile.choix).sort((a, b) => b[1] - a[1])[0];
  if (choice && choice[1] >= 2)
    lines.push(
      `choisit le plus souvent les réponses de style « ${choice[0]} » : propose-en une en premier`,
    );
  const titre = name === 'toi' ? "Ta façon d'écrire" : `Façon d'écrire de ${name}`;
  return `${titre} (apprise de ${profile.messages} ${name === 'toi' ? 'de tes' : 'de ses'} messages) : ${lines.join(' ; ')}.`;
}
