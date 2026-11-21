/**
 * Fiche de style sur le disque de l'utilisateur (dans la PWA : IndexedDB, sur le téléphone).
 * Elle ne quitte jamais l'appareil. Pour ne pas compter deux fois les mêmes messages, on garde
 * seulement, par interlocuteur, une empreinte de son nom et la date du dernier message appris.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { emptyProfile, type StyleProfile } from './style.js';
import type { ThreadMessage } from './thread.js';

export interface StoredProfile {
  profil: StyleProfile;
  /** empreinte(interlocuteur) → « AAAA-MM-JJ HH:MM » du dernier message appris. */
  appris: Record<string, string>;
}

const fingerprint = (text: string) =>
  createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);

function profilePath(
  moi: string,
  dir = process.env.SIX_PROFILE_DIR ?? join(homedir(), '.six'),
): string {
  return join(dir, `style-${fingerprint(moi)}.json`);
}

export function loadProfile(moi: string, dir?: string): StoredProfile {
  try {
    return JSON.parse(readFileSync(profilePath(moi, dir), 'utf8')) as StoredProfile;
  } catch {
    return { profil: emptyProfile(), appris: {} };
  }
}

export function saveProfile(moi: string, stored: StoredProfile, dir?: string): string {
  const path = profilePath(moi, dir);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(stored, null, 2)}\n`);
  return path;
}

/** « 01/10/2026 » + « 21:02 » → « 2026-10-01 21:02 », comparable comme du texte. */
export function sortableStamp(message: ThreadMessage): string | undefined {
  const m = message.date?.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (!m || !message.time) return undefined;
  const year = m[3]?.length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]?.padStart(2, '0')}-${m[1]?.padStart(2, '0')} ${message.time.padStart(5, '0')}`;
}

/** Messages de l'utilisateur pas encore appris pour cet interlocuteur. */
export function newOwnMessages(
  stored: StoredProfile,
  thread: ThreadMessage[],
  moi: string,
  interlocuteur: string,
): { messages: string[]; lastStamp?: string } {
  const key = fingerprint(interlocuteur);
  const since = stored.appris[key] ?? '';
  const own = thread.filter((m) => m.author?.toLowerCase() === moi.trim().toLowerCase());
  const fresh = own.filter((m) => {
    const stamp = sortableStamp(m);
    return stamp === undefined ? since === '' : stamp > since;
  });
  const lastStamp = own
    .map(sortableStamp)
    .filter((s): s is string => Boolean(s))
    .sort()
    .at(-1);
  return { messages: fresh.map((m) => m.text), ...(lastStamp ? { lastStamp } : {}) };
}

export function interlocutorKey(interlocuteur: string): string {
  return fingerprint(interlocuteur);
}
