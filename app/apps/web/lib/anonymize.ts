import { PRENOMS, PRENOMS_AMBIGUS } from './prenoms';

export interface Masked {
  text: string;
  mapping: Record<string, string>; // repère -> texte d'origine
  count: number;
}

const L = String.raw`\p{L}'’-`; // lettres d'un nom, avec apostrophes et tirets
const MAJ = String.raw`\p{Lu}[\p{Ll}'’-]+`; // mot commençant par une majuscule, suivi de minuscules

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const PSEUDO = /(?<![\w.@])@[A-Za-z0-9_.]{2,30}/g;
// Code secret, PIN, OTP ou mot de passe chiffré suivi de 4 à 8 chiffres
const CODE =
  /\b(code(?:\s+(?:pin|secret|otp|de\s+confirmation|de\s+validation))?|pin|otp|mot\s+de\s+passe|mdp|password)\b([^\d\n]{0,25}?)(\d(?:[\s-]?\d){3,7})(?!\d)/giu;
// Numéro de compte au format IBAN (CD12 0001 0002 ...) ou annoncé par « compte »
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,8}(?:\s?[A-Z0-9]{1,4})?\b/g;
const COMPTE = /\b(compte|n°\s*de\s*compte|account)\b([^\d\n]{0,15}?)(\d[\d\s-]{5,30}\d)/giu;
const PHONE = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;
// Adresse : (numéro) avenue/rue/boulevard/quartier + nom propre
const ADRESSE = new RegExp(
  String.raw`(?:\b\d{1,4}\s*,?\s*)?\b(?:avenue|av\.|rue|boulevard|bd|quartier|cité|cite|route|commune\s+de)\s+(?:de\s+la\s+|du\s+|des\s+|de\s+)?\p{Lu}[${L}]*(?:[\s-]\p{Lu}[${L}]*)*(?:\s*,?\s*n°?\s*\d{1,4})?`,
  'giu',
);
const TITLE = new RegExp(
  String.raw`\b(Mr|M\.|Mme|Mlle|Monsieur|Madame|Dr|Prof|Pr|Papa|Maman|Tonton|Tantine|Maître|Pasteur|Frère|Sœur)\.?\s+(${MAJ}(?:\s+${MAJ})?)`,
  'gu',
);
const GREETING = new RegExp(
  String.raw`\b(Salut|Bonjour|Bonsoir|Coucou|Hello|Hey|Cher|Chère|Merci|Mbote)\s+(${MAJ})`,
  'gu',
);
// Deux mots ou plus à majuscule au milieu d'une phrase (« j'ai vu Moïse Kabila ») : probablement un nom complet.
const NOM_COMPLET = new RegExp(String.raw`(?<=[\p{Ll}\d,;]\s+)${MAJ}(?:[\s-]${MAJ}){1,2}`, 'gu');

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PRENOMS_RE = new RegExp(
  String.raw`(?<![\p{L}\[])(?:${PRENOMS.map(escapeRe).join('|')})(?:\s+${MAJ}){0,2}(?![\p{L}])`,
  'giu',
);
const AMBIGUS_RE = new RegExp(
  String.raw`(?<![\p{L}\[])(?:${PRENOMS_AMBIGUS.map(escapeRe).join('|')})(?:\s+${MAJ}){0,2}(?![\p{L}])`,
  'gu',
);

/**
 * Masque ce qui identifie quelqu'un avant tout envoi à l'IA : e-mails, liens, pseudos, codes, comptes,
 * téléphones, adresses, noms connus (interlocuteurs), prénoms courants, noms après un titre ou une salutation,
 * noms complets en milieu de phrase. C'est une détection automatique : l'utilisateur relit et peut ajouter un nom.
 * Même texte d'origine = même repère, pour garder la conversation lisible.
 */
export function anonymize(input: string, knownNames: string[] = []): Masked {
  const mapping: Record<string, string> = {};
  const byOriginal = new Map<string, string>();
  const counters: Record<string, number> = {};

  const tag = (kind: string, original: string): string => {
    const key = `${kind}:${original.toLowerCase()}`;
    const known = byOriginal.get(key);
    if (known) return known;
    counters[kind] = (counters[kind] ?? 0) + 1;
    const placeholder = `[${kind} ${counters[kind]}]`;
    byOriginal.set(key, placeholder);
    mapping[placeholder] = original;
    return placeholder;
  };

  let text = input;
  text = text.replace(EMAIL, (m) => tag('EMAIL', m));
  text = text.replace(URL_RE, (m) => tag('LIEN', m));
  text = text.replace(PSEUDO, (m) => tag('PSEUDO', m));
  text = text.replace(
    CODE,
    (_m, mot: string, entre: string, code: string) => `${mot}${entre}${tag('CODE', code)}`,
  );
  text = text.replace(IBAN, (m) => (/\d{6,}/.test(m.replace(/\s/g, '')) ? tag('COMPTE', m) : m));
  text = text.replace(
    COMPTE,
    (_m, mot: string, entre: string, num: string) => `${mot}${entre}${tag('COMPTE', num)}`,
  );
  text = text.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? tag('TÉL', m) : m));
  text = text.replace(ADRESSE, (m) => tag('ADRESSE', m.trim()));

  const names = [...new Set(knownNames.map((n) => n.trim()).filter((n) => n.length >= 2))];
  names.sort((a, b) => b.length - a.length);
  for (const name of names) {
    const re = new RegExp(`(?<![\\p{L}\\[])${escapeRe(name)}(?![\\p{L}])`, 'giu');
    text = text.replace(re, () => tag('PERSONNE', name));
  }

  text = text.replace(
    TITLE,
    (_m, title: string, name: string) => `${title} ${tag('PERSONNE', name)}`,
  );
  text = text.replace(
    GREETING,
    (_m, word: string, name: string) => `${word} ${tag('PRÉNOM', name)}`,
  );
  text = text.replace(PRENOMS_RE, (m) => tag('PRÉNOM', m));
  text = text.replace(AMBIGUS_RE, (m) => tag('PRÉNOM', m));
  text = text.replace(NOM_COMPLET, (m) => tag('NOM', m));

  return { text, mapping, count: Object.keys(mapping).length };
}

/** Remet les vrais noms dans la réponse finale (avant copie), jamais côté serveur. */
export function restore(text: string, mapping: Record<string, string>): string {
  let out = text;
  for (const [placeholder, original] of Object.entries(mapping)) {
    out = out.split(placeholder).join(original);
  }
  return out;
}

/**
 * Marque les messages de l'utilisateur « Moi : » dans le texte masqué envoyé à l'IA, pour qu'elle sache
 * de quel côté écrire. `me` est l'étiquette d'origine (vrai nom ou « Moi ») ; dans le texte masqué elle a pu
 * devenir un repère comme [PERSONNE 2].
 */
export function markMe(masked: string, me: string, mapping: Record<string, string>): string {
  const who = me.trim();
  if (!who || who.toLowerCase() === 'moi') return masked;
  const placeholder = Object.entries(mapping).find(
    ([, original]) => original.toLowerCase() === who.toLowerCase(),
  )?.[0];
  const label = placeholder ?? who;
  const re = new RegExp(String.raw`^(\s*)${escapeRe(label)}(\s?:\s)`, 'gmu');
  return masked.replace(re, '$1Moi$2');
}
