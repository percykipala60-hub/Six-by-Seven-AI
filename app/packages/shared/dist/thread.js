/**
 * Lecture d'une conversation : exports WhatsApp Android et iPhone, ou texte collé « Nom: message ».
 * Les lignes système (chiffrement, « <Médias omis> ») sont ignorées ; un message sur plusieurs
 * lignes reste un seul message.
 */
// Android : « 01/10/2026 14:03 - Nom: msg » ; iPhone : « [01/10/2026 14:03:22] Nom: msg ».
const EXPORT_LINE = /^\[?(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),? (\d{1,2}:\d{2})(?::\d{2})?(?:\s?[AP]M)?\]?\s?(?:-\s)?(?:([^:]{1,60}): )?(.*)$/;
// Texte collé à la main : « Christelle: tu as fini ? »
const PASTED_LINE = /^([^:\n]{1,40}):\s+(.+)$/;
const MEDIA = /^<?(médias omis|media omitted|image absente|vidéo absente|audio omis|sticker omis)>?$/i;
export function parseThread(raw) {
    // BOM (Bloc-notes, PowerShell) et marques de direction (iPhone) : invisibles mais cassent la lecture.
    const lines = raw.replace(/[\uFEFF\u200E\u200F]/g, '').split(/\r?\n/);
    const messages = [];
    let exportFormat = false;
    for (const line of lines) {
        const match = EXPORT_LINE.exec(line);
        if (match) {
            exportFormat = true;
            const [, date, time, author, text = ''] = match;
            if (!author)
                continue; // ligne système
            if (MEDIA.test(text.trim()))
                continue;
            messages.push({
                author: author.trim(),
                ...(date ? { date } : {}),
                ...(time ? { time } : {}),
                text: text.trim(),
            });
            continue;
        }
        const last = messages.at(-1);
        if (exportFormat) {
            if (last && line.trim())
                last.text += `\n${line.trim()}`;
            continue;
        }
        const pasted = PASTED_LINE.exec(line.trim());
        if (pasted?.[1] && pasted[2]) {
            messages.push({ author: pasted[1].trim(), text: pasted[2].trim() });
        }
        else if (line.trim()) {
            if (last)
                last.text += `\n${line.trim()}`;
            else
                messages.push({ text: line.trim() });
        }
    }
    return messages.filter((message) => message.text.length > 0);
}
/** Noms sous lesquels WhatsApp exporte les messages de la personne qui fait l'export. */
const SELF_ALIASES = ['vous', 'you', 'moi', 'me', 'toi', 'yo'];
/** « Vous », « moi »… : le nom que WhatsApp donne à l'utilisateur, pas un vrai prénom. */
export function isSelfAlias(name) {
    return Boolean(name && SELF_ALIASES.includes(name.trim().toLowerCase()));
}
export function authorsOf(messages) {
    return [...new Set(messages.map((m) => m.author).filter((a) => Boolean(a)))];
}
/**
 * Trouve l'utilisateur parmi les auteurs : le nom donné s'il existe, sinon « Vous » / « You »
 * (nom donné par WhatsApp à la personne qui exporte). undefined si aucun ne correspond.
 */
export function resolveMe(messages, moi) {
    const authors = authorsOf(messages);
    const wanted = moi?.trim().toLowerCase();
    const exact = wanted ? authors.find((a) => a.toLowerCase() === wanted) : undefined;
    if (exact)
        return exact;
    return authors.find((a) => SELF_ALIASES.includes(a.toLowerCase()));
}
//# sourceMappingURL=thread.js.map