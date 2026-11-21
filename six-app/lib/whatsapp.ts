export interface WhatsAppMessage {
  author: string;
  text: string;
}

export interface ParsedChat {
  messages: WhatsAppMessage[];
  authors: string[];
}

// Marques invisibles que WhatsApp place parfois en début de ligne ou de message.
const INVISIBLES = /[‎‏‪-‮⁦-⁩﻿]/g;

// Date : 12/09/2026, 12.09.26, 2026-09-12
const DATE = String.raw`(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})`;
// Heure : 14:32, 14:32:10, 2:32 PM, 14 h 32
const HEURE = String.raw`\d{1,2}\s?[:.h]\s?\d{2}(?:[:.]\d{2})?(?:\s?[APap]\.?\s?[Mm]\.?)?`;
// Entre la date et l'heure : virgule, espace, « à », « at », « um »
const LIEN = String.raw`,?\s+(?:(?:à|a|at|um)\s+)?`;

// Android : « 12/09/2026, 14:32 - Nom: message » (aussi « 12/09/2026 à 14:32 - … » et tirets longs)
const ANDROID = new RegExp(String.raw`^${DATE}${LIEN}${HEURE}\s*[-–—]\s+(.*)$`);
// iPhone : « [12/09/2026 14:32:10] Nom: message »
const IOS = new RegExp(String.raw`^\[${DATE}${LIEN}${HEURE}\]\s*(.*)$`);

const MEDIA = /^<?(médias? omis|media omitted|image omitted|image absente|vidéo omise|audio omis|sticker omis|gif omis|document omis)>?$/i;

function clean(line: string): string {
  return line.replace(INVISIBLES, "");
}

function matchLine(line: string): string | null {
  const l = clean(line).trim();
  const m = l.match(ANDROID) ?? l.match(IOS);
  return m ? m[1] : null;
}

function splitAuthor(rest: string): WhatsAppMessage | null {
  // « Nom: message » ou, avec la typographie française, « Nom : message »
  const m = rest.match(/^(.{1,60}?)\s?:\s(.*)$/s);
  if (!m) return null; // message système, sans auteur
  return { author: m[1].trim(), text: m[2] };
}

export function looksLikeWhatsApp(raw: string): boolean {
  const lines = raw.split(/\r?\n/).slice(0, 15);
  return lines.some((l) => matchLine(l) !== null);
}

export function parseWhatsApp(raw: string): ParsedChat {
  const messages: WhatsAppMessage[] = [];
  let current: WhatsAppMessage | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const rest = matchLine(line);
    if (rest !== null) {
      current = splitAuthor(rest);
      if (current) messages.push(current);
    } else if (current && line.trim()) {
      current.text += `\n${clean(line)}`; // suite d'un message sur plusieurs lignes
    }
  }

  const kept = messages.filter((m) => !MEDIA.test(m.text.trim()));
  const authors = [...new Set(kept.map((m) => m.author))];
  return { messages: kept, authors };
}

// Étiquettes sans identité (captures d'écran, mots courants) : inutile de les masquer.
const GENERIC_SPEAKERS = new Set(["moi", "autre", "toi", "lui", "elle", "ok", "note", "attention", "important"]);
// Liens de parenté ou de rôle : ils n'identifient personne et aident l'IA à trouver le ton (on parle à sa mère, à son chef…).
const RELATIONS = new Set([
  "maman", "mama", "papa", "mère", "père", "mon père", "ma mère", "chéri", "chérie", "mon chéri", "ma chérie", "bébé",
  "frère", "sœur", "soeur", "grand frère", "grande sœur", "tonton", "tantine", "tata", "cousin", "cousine",
  "patron", "patronne", "boss", "chef", "prof", "professeur", "service client", "client", "cliente",
]);

/** Vrai pour une étiquette qui n'identifie personne (« Moi », « Maman », « Service client »…) : pas besoin de la masquer. */
export function isGenericSpeaker(label: string): boolean {
  const l = label.trim().toLowerCase();
  return GENERIC_SPEAKERS.has(l) || RELATIONS.has(l);
}

const LABEL_RE = /^\s*(\p{Lu}[\p{L}'’.-]{0,20}(?: \p{L}[\p{L}'’.-]{0,20}){0,2})\s*:\s+\S/gmu;

/** Toutes les étiquettes de début de ligne (« Patrick: … », « Moi: … »), dans l'ordre d'apparition. */
export function speakers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(LABEL_RE)) {
    const label = m[1];
    // « Rendez-vous demain : 17h » n'est pas un nom : les mots suivants doivent commencer par une majuscule,
    // sauf pour un rôle connu (« Service client »).
    const ok = label.split(" ").slice(1).every((w) => /^\p{Lu}/u.test(w)) || isGenericSpeaker(label);
    if (ok && !found.some((f) => f.toLowerCase() === label.toLowerCase())) found.push(label);
  }
  return found;
}

/** Noms placés devant « : » en début de ligne dans un texte collé à la main, sans les étiquettes génériques. */
export function speakerLabels(text: string): string[] {
  return speakers(text).filter((n) => !isGenericSpeaker(n));
}

/**
 * Devine qui est l'utilisateur : « Moi » s'il apparaît ; sinon, à deux personnes, celle qui n'a PAS écrit
 * le dernier message (c'est à elle de répondre). Sinon, rien : l'utilisateur choisit.
 */
export function guessMe(list: string[], text: string): string {
  const moi = list.find((s) => s.toLowerCase() === "moi");
  if (moi) return moi;
  if (list.length !== 2) return "";
  const known = list.map((s) => s.toLowerCase());
  const lines = [...text.matchAll(LABEL_RE)].map((m) => m[1].toLowerCase()).filter((l) => known.includes(l));
  const last = lines.length ? lines[lines.length - 1] : "";
  return list.find((s) => s.toLowerCase() !== last) ?? "";
}

/**
 * Garde les derniers messages dans la limite de caractères.
 * Si le dernier message dépasse à lui seul la limite, on garde sa fin : le résultat n'est jamais vide.
 */
export function toConversation(
  messages: WhatsAppMessage[],
  maxChars: number,
): { text: string; kept: number; total: number } {
  const lines: string[] = [];
  let size = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const line = `${messages[i].author}: ${messages[i].text}`;
    if (size + line.length + 1 > maxChars) {
      if (!lines.length) {
        const prefix = `${messages[i].author}: …`;
        lines.unshift(prefix + messages[i].text.slice(-(maxChars - prefix.length)));
      }
      break;
    }
    lines.unshift(line);
    size += line.length + 1;
  }
  return { text: lines.join("\n"), kept: lines.length, total: messages.length };
}
