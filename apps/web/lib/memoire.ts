/**
 * Mémoire de Six, sur le téléphone (localStorage) ; copiée sur le compte seulement si la personne l'autorise (lib/compte.ts). Aucune conversation n'y entre.
 *
 * - Habitudes : pour chaque réponse choisie, des nombres seulement (mots, emoji oui/non, tu/vous).
 *   Six en tire une consigne (« d'habitude : réponses courtes, tutoiement ») pour écrire comme toi.
 * - Contacts : ce que l'utilisateur écrit lui-même sur une personne (« mon petit frère, on se tutoie »).
 *   La note part masquée (les noms deviennent les repères de la conversation).
 * - Suivis : le secrétaire de Six (« relancer Junior demain »), affichés sur l'accueil le jour venu.
 *
 * Tout s'efface dans Réglages, et le curateur oublie ce qui a plus de 90 jours.
 */
import type { Canal } from './types';
import { effacerConversations } from './conversations';

const KEY = 'six-memoire';
const OFF = 'six-memoire-off';
export const MEMOIRE_JOURS = 90;
const MAX_CHOIX = 30;
const MAX_CONTACTS = 30;
const MAX_SUIVIS = 20;
export const NOTE_MAX = 140;
const JOUR = 86_400_000;

export interface Choix {
  t: number; // date du choix
  mots: number;
  emoji: boolean;
  tu: boolean;
  vous: boolean;
}

export interface Contact {
  nom: string; // nom tel qu'il apparaît dans la conversation (reste sur le téléphone)
  note: string;
  vu: number;
}

export interface Suivi {
  id: string;
  qui: string; // nom du contact (reste sur le téléphone)
  quoi: string; // objectif choisi (texte de l'utilisateur ou de l'analyse, sans la conversation)
  canal: Canal | '';
  quand: number;
}

export interface Memoire {
  choix: Choix[];
  contacts: Contact[];
  suivis: Suivi[];
}

const vide = (): Memoire => ({ choix: [], contacts: [], suivis: [] });

/** Garde seulement des valeurs du bon type, récentes, en nombre limité. */
function curer(o: unknown, now = Date.now()): Memoire {
  const m = (o && typeof o === 'object' ? o : {}) as Partial<Record<keyof Memoire, unknown[]>>;
  const recent = (t: unknown) => typeof t === 'number' && now - t < MEMOIRE_JOURS * JOUR;
  const str = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');
  const choix = (Array.isArray(m.choix) ? m.choix : [])
    .map((c) => c as Partial<Choix>)
    .filter((c) => recent(c.t) && typeof c.mots === 'number')
    .map((c) => ({
      t: c.t as number,
      mots: Math.max(0, Math.min(400, Math.round(c.mots as number))),
      emoji: c.emoji === true,
      tu: c.tu === true,
      vous: c.vous === true,
    }))
    .slice(-MAX_CHOIX);
  const contacts = (Array.isArray(m.contacts) ? m.contacts : [])
    .map((c) => c as Partial<Contact>)
    .filter((c) => recent(c.vu) && str(c.nom, 40).trim() && str(c.note, NOTE_MAX).trim())
    .map((c) => ({
      nom: str(c.nom, 40).trim(),
      note: str(c.note, NOTE_MAX).trim(),
      vu: c.vu as number,
    }))
    .slice(-MAX_CONTACTS);
  const suivis = (Array.isArray(m.suivis) ? m.suivis : [])
    .map((s) => s as Partial<Suivi>)
    .filter(
      (s) =>
        typeof s.quand === 'number' && now - s.quand < 30 * JOUR && str(s.id, 20) && str(s.qui, 40),
    )
    .map((s) => ({
      id: str(s.id, 20),
      qui: str(s.qui, 40),
      quoi: str(s.quoi, 120),
      canal: str(s.canal, 12) as Canal | '',
      quand: s.quand as number,
    }))
    .slice(-MAX_SUIVIS);
  return { choix, contacts, suivis };
}

export function memoireActive(): boolean {
  try {
    return localStorage.getItem(OFF) !== '1';
  } catch {
    return false;
  }
}

export function activerMemoire(on: boolean): void {
  try {
    if (on) localStorage.removeItem(OFF);
    else {
      localStorage.setItem(OFF, '1');
      localStorage.removeItem(KEY);
      effacerConversations(); // mémoire coupée : les conversations gardées partent aussi
    }
  } catch {
    /* stockage bloqué */
  }
  annoncer();
}

export function lireMemoire(): Memoire {
  try {
    const raw = localStorage.getItem(KEY);
    return curer(raw ? JSON.parse(raw) : null);
  } catch {
    return vide();
  }
}

function ecrire(m: Memoire): void {
  if (!memoireActive()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(curer(m)));
  } catch {
    /* stockage plein ou bloqué : Six marche, sans se souvenir */
  }
  annoncer();
}

export function effacerMemoire(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien à effacer */
  }
  effacerConversations(); // « Effacer la mémoire de Six » efface aussi les conversations gardées
  annoncer();
}

/**
 * Réunit deux mémoires (ce téléphone et le compte) : rien n'est perdu, la version la plus récente d'une note gagne.
 * Limite connue : un suivi marqué fait sur un seul appareil peut revenir de l'autre.
 */
export function fusionner(a: unknown, b: unknown): Memoire {
  const x = curer(a);
  const y = curer(b);
  const choix = [...new Map([...x.choix, ...y.choix].map((c) => [c.t, c])).values()].sort(
    (p, q) => p.t - q.t,
  );
  const contacts = new Map<string, Contact>();
  for (const c of [...x.contacts, ...y.contacts]) {
    const deja = contacts.get(c.nom);
    if (!deja || c.vu > deja.vu) contacts.set(c.nom, c);
  }
  const suivis = [...new Map([...x.suivis, ...y.suivis].map((s) => [s.id, s])).values()].sort(
    (p, q) => p.quand - q.quand,
  );
  return curer({ choix, contacts: [...contacts.values()].sort((p, q) => p.vu - q.vu), suivis });
}

/** Remplace la mémoire de ce téléphone (après une synchronisation avec le compte). */
export function remplacerMemoire(m: unknown): void {
  ecrire(curer(m));
}

// Prévient les écrans ouverts (accueil, réglages) qu'il faut relire la mémoire.
function annoncer(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('six-memoire'));
}

/** Retient une réponse choisie : des nombres seulement, jamais le texte. */
export function retenirChoix(reponse: string): void {
  const m = lireMemoire();
  const mots = reponse
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length; // un emoji seul n'est pas un mot
  m.choix.push({
    t: Date.now(),
    mots,
    emoji: /\p{Extended_Pictographic}/u.test(reponse),
    tu: /\b(tu|te|toi|ton|ta|tes)\b|\bt['’]/i.test(reponse),
    vous: /\b(vous|votre|vos)\b/i.test(reponse),
  });
  ecrire(m);
}

/** Ce que Six a appris des réponses choisies, en clair (au moins 3 choix pour en dire quelque chose). */
export function habitudes(m: Memoire = lireMemoire()): string[] {
  const c = m.choix;
  if (c.length < 3) return [];
  const moy = Math.round(c.reduce((s, x) => s + x.mots, 0) / c.length);
  const part = (f: (x: Choix) => boolean) => c.filter(f).length / c.length;
  const out = [
    moy <= 20
      ? `réponses courtes (${moy} mots en moyenne)`
      : moy >= 50
        ? `réponses développées (${moy} mots en moyenne)`
        : `réponses moyennes (${moy} mots en moyenne)`,
  ];
  const tu = part((x) => x.tu && !x.vous);
  const vous = part((x) => x.vous && !x.tu);
  if (tu >= 0.6) out.push('tutoiement');
  else if (vous >= 0.6) out.push('vouvoiement');
  const emoji = part((x) => x.emoji);
  if (emoji >= 0.5) out.push('emojis fréquents');
  else if (emoji <= 0.15) out.push("pas d'emoji");
  return out;
}

export function noteContact(nom: string, m: Memoire = lireMemoire()): string {
  const k = nom.trim().toLowerCase();
  return m.contacts.find((c) => c.nom.toLowerCase() === k)?.note ?? '';
}

export function ecrireNote(nom: string, note: string): void {
  const m = lireMemoire();
  const k = nom.trim().toLowerCase();
  m.contacts = m.contacts.filter((c) => c.nom.toLowerCase() !== k);
  if (note.trim())
    m.contacts.push({ nom: nom.trim(), note: note.trim().slice(0, NOTE_MAX), vu: Date.now() });
  ecrire(m);
}

export function ajouterSuivi(s: Omit<Suivi, 'id'>): void {
  const m = lireMemoire();
  m.suivis.push({ ...s, id: Math.random().toString(36).slice(2, 10) });
  ecrire(m);
}

export function retirerSuivi(id: string): void {
  const m = lireMemoire();
  m.suivis = m.suivis.filter((s) => s.id !== id);
  ecrire(m);
}

/**
 * Consigne envoyée avec la demande de réponses. La note du contact est masquée avec les repères de la
 * conversation (« Junior » devient « [PERSONNE 1] »), et les suites de chiffres sont retirées.
 */
export function consigneMemoire(contact: string, mapping: Record<string, string>): string {
  if (!memoireActive()) return '';
  const m = lireMemoire();
  const parts: string[] = [];
  let note = contact ? noteContact(contact, m) : '';
  if (note) {
    const noms = Object.entries(mapping).sort((a, b) => b[1].length - a[1].length);
    for (const [repere, original] of noms) {
      if (original.trim().length > 1) note = note.split(original).join(repere);
    }
    note = note.replace(/\d[\d\s.-]{4,}\d/g, '[numéro]');
    const repere =
      noms.find(([, o]) => o.toLowerCase() === contact.toLowerCase())?.[0] ?? "l'autre personne";
    parts.push(`Ce que l'utilisateur sait de ${repere} : ${note}`);
  }
  const h = habitudes(m);
  if (h.length) parts.push(`D'habitude, il choisit : ${h.join(', ')}`);
  return parts.join('. ');
}
