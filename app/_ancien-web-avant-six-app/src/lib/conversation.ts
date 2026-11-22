/**
 * Tout ce qui se passe sur le téléphone AVANT l'envoi : lecture du fil, choix de « moi »,
 * anti-arnaque local, masquage vérifiable, style d'écriture. Rien ne part sur le réseau ici.
 */
import {
  applyMask,
  authorsOf,
  detectScam,
  emptyProfile,
  findSensitive,
  isSelfAlias,
  learnStyle,
  looksLikePhoneNumber,
  parseThread,
  resolveMe,
  tensionSignals,
  type ScamReport,
  type SensitiveSpan,
  type StyleProfile,
  type ThreadMessage,
} from '@six/shared';

/** Au plus 12 messages… */
export const MESSAGES_SENT = 12;
/** …et au plus 2000 caractères : les derniers messages suffisent à comprendre l'échange. */
export const CHARS_SENT = 2000;

export interface Conversation {
  messages: ThreadMessage[];
  authors: string[];
  /** Auteur qui est l'utilisateur (« Vous » dans un export), s'il a été reconnu. */
  me?: string;
  /** La personne à qui répondre. */
  other?: string;
  scam: ScamReport;
}

export type ReadResult = { ok: true; conversation: Conversation } | { ok: false; reason: string };

/** Lit un export WhatsApp ou un texte collé. `me` : choix explicite de l'utilisateur. */
export function readConversation(raw: string, me?: string): ReadResult {
  const messages = parseThread(raw);
  if (messages.length === 0) {
    return { ok: false, reason: 'Je n’ai trouvé aucun message dans ce texte.' };
  }
  const authors = authorsOf(messages);
  const resolvedMe = resolveMe(messages, me);
  const others = messages.filter((m) => m.author && m.author !== resolvedMe);
  const other = others.at(-1)?.author ?? (resolvedMe ? undefined : messages.at(-1)?.author);
  const fromOther = other ? messages.filter((m) => m.author === other) : messages;
  const scam = detectScam(
    fromOther.slice(-6).map((m) => m.text),
    looksLikePhoneNumber(other),
  );
  return {
    ok: true,
    conversation: {
      messages,
      authors,
      ...(resolvedMe ? { me: resolvedMe } : {}),
      ...(other ? { other } : {}),
      scam,
    },
  };
}

/** Les derniers messages qui tiennent dans la limite (au moins un, coupé s'il est très long). */
export function lastMessages(
  messages: ThreadMessage[],
  count = MESSAGES_SENT,
  budget = CHARS_SENT,
): ThreadMessage[] {
  const kept: ThreadMessage[] = [];
  let used = 0;
  for (const message of [...messages].reverse()) {
    if (kept.length >= count) break;
    const size = message.text.length + (message.author?.length ?? 0) + 3;
    if (kept.length > 0 && used + size > budget) break;
    kept.unshift(
      size > budget
        ? { ...message, text: message.text.slice(-(budget - 60)).trimStart() }
        : message,
    );
    used += Math.min(size, budget);
  }
  return kept;
}

/** Un message = une ligne « Auteur: texte » : ce que l'utilisateur voit est exactement ce qui part. */
export function excerpt(messages: ThreadMessage[]): string {
  return messages
    .map((m) => {
      const text = m.text.replace(/\s*\n\s*/g, ' ');
      return m.author ? `${m.author}: ${text}` : text;
    })
    .join('\n');
}

export interface MaskPreview {
  /** Les messages qui partiront, dans l'ordre (un par ligne de `text`). */
  messages: ThreadMessage[];
  text: string;
  spans: SensitiveSpan[];
}

/** Ce qui sera masqué dans l'extrait, noms de tout le fil compris. */
export function previewMask(
  conversation: Conversation,
  extraNames: string[] = [],
  count = MESSAGES_SENT,
): MaskPreview {
  const messages = lastMessages(conversation.messages, count);
  const text = excerpt(messages);
  const participants = conversation.authors.filter(
    (a) => !isSelfAlias(a) && !looksLikePhoneNumber(a),
  );
  return {
    messages,
    text,
    spans: findSensitive(text, { extraNames: [...participants, ...extraNames] }),
  };
}

export interface Prepared {
  /** Ce qui part au serveur. */
  masked: string;
  /** Reste sur le téléphone : sert à remettre les vrais noms dans les brouillons. */
  table: Record<string, string>;
  /** « moi » tel qu'il apparaît dans le texte masqué. */
  moi?: string;
}

export function prepare(
  conversation: Conversation,
  preview: MaskPreview,
  ignored: ReadonlySet<number>,
): Prepared {
  const { masked, table } = applyMask(preview.text, preview.spans, ignored);
  // Le nom de l'utilisateur a pu être masqué : on envoie le même remplaçant que dans le texte.
  let moi = conversation.me;
  if (moi && !isSelfAlias(moi)) {
    for (const [tag, value] of Object.entries(table)) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      moi = moi.replace(new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'giu'), tag);
    }
  }
  return { masked, table, ...(moi ? { moi } : {}) };
}

/** Ta façon d'écrire, apprise de TES messages de cette conversation. Que des nombres. */
export function styleOf(
  conversation: Conversation,
  choix: Record<string, number> = {},
): StyleProfile {
  const own = conversation.me
    ? conversation.messages.filter((m) => m.author === conversation.me).map((m) => m.text)
    : [];
  return { ...learnStyle(emptyProfile(), own), choix };
}

/** Découpe une ligne en morceaux : texte normal, ou élément détecté (avec son index global). */
export function segments(
  text: string,
  spans: SensitiveSpan[],
): { line: { text: string; span?: number }[] }[] {
  const lines: { line: { text: string; span?: number }[] }[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    const end = offset + line.length;
    const parts: { text: string; span?: number }[] = [];
    let cursor = offset;
    spans.forEach((span, index) => {
      if (span.start < offset || span.end > end) return;
      if (span.start > cursor) parts.push({ text: text.slice(cursor, span.start) });
      parts.push({ text: span.value, span: index });
      cursor = span.end;
    });
    if (cursor < end) parts.push({ text: text.slice(cursor, end) });
    lines.push({ line: parts });
    offset = end + 1;
  }
  return lines;
}

export interface Recap {
  messages: number;
  /** Part des messages écrits par l'utilisateur (0 à 100). */
  partMoi?: number;
  /** Temps de réponse moyen de l'utilisateur, en minutes (exports datés seulement). */
  reponseMoi?: number;
  reponseAutre?: number;
  jours?: number;
  /** Tension des messages reçus, du plus ancien au plus récent (0 calme, 1 pressant, 2 tendu). */
  tension: number[];
}

/** « 01/10/2026 » + « 21:02 » → date (format jour/mois de WhatsApp en français). */
function when(m: ThreadMessage): number | undefined {
  const d = m.date?.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  const t = m.time?.match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return undefined;
  const year = Number(d[3]) < 100 ? 2000 + Number(d[3]) : Number(d[3]);
  const value = new Date(
    year,
    Number(d[2]) - 1,
    Number(d[1]),
    Number(t[1]),
    Number(t[2]),
  ).getTime();
  return Number.isNaN(value) ? undefined : value;
}

/** Statistiques de la carte récap : calculées sur le téléphone, sans aucun mot du texte. */
export function recapOf(conversation: Conversation): Recap {
  const { messages, me, other } = conversation;
  const mine = me ? messages.filter((m) => m.author === me).length : undefined;
  const delays = { moi: [] as number[], autre: [] as number[] };
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const cur = messages[i];
    if (!prev || !cur || !prev.author || !cur.author || prev.author === cur.author) continue;
    const a = when(prev);
    const b = when(cur);
    if (a === undefined || b === undefined || b < a) continue;
    const minutes = (b - a) / 60000;
    if (minutes > 24 * 60) continue; // une nouvelle discussion, pas une réponse
    (cur.author === me ? delays.moi : delays.autre).push(minutes);
  }
  const mean = (list: number[]) =>
    list.length ? Math.round(list.reduce((x, y) => x + y, 0) / list.length) : undefined;
  const times = messages.map(when).filter((x): x is number => x !== undefined);
  const received = other ? messages.filter((m) => m.author === other) : [];
  const windows = Math.min(8, received.length);
  const tension: number[] = [];
  for (let w = 0; w < windows; w++) {
    const from = Math.floor((w * received.length) / windows);
    const to = Math.floor(((w + 1) * received.length) / windows);
    const level = tensionSignals(received.slice(from, to).map((m) => m.text));
    tension.push(level === 'tendu' ? 2 : level === 'pressant' ? 1 : 0);
  }
  const reponseMoi = mean(delays.moi);
  const reponseAutre = mean(delays.autre);
  return {
    messages: messages.length,
    ...(mine !== undefined ? { partMoi: Math.round((mine / messages.length) * 100) } : {}),
    ...(reponseMoi !== undefined ? { reponseMoi } : {}),
    ...(reponseAutre !== undefined ? { reponseAutre } : {}),
    ...(times.length > 1
      ? { jours: Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86_400_000)) }
      : {}),
    tension,
  };
}
